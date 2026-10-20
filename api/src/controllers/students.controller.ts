/** Controlador de students: la lógica de cada ruta de routes/students.routes.ts. */
import { z } from 'zod';
import { Op, WhereOptions } from 'sequelize';
import { UserRole, User, Level, Student, Enrollment, StudentGuardian, Division, School, AcademicYear, sequelize } from '../models';
import { asyncHandler, notFound, badRequest, pagination } from '../lib/http';
import { invalidateSchoolSession, assertStudentAccess, assertDivision, SchoolSession, studentDivisionId, canSeeDivision } from '../services/schoolSession';
import { findOrCreatePerson, sendWelcome, isTechEmail } from '../services/accounts';
import { touchAccess } from '../services/billing';
import { userAttrsFor, BASIC_USER_ATTRIBUTES } from '../services/access';
import { schoolName } from '../services/staffMembers';
import { audit } from '../services/audit';
import { conflict, forbidden } from '../lib/http';
import { Entity, Action } from '../constants/permissions';
import { StudentInput, guardianInput, studentBody, studentQuery } from '../validators/students.validator';
import { RoleCode } from '../constants/roles';


const sameName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) => {
  const n = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  return n(a.lastName) === n(b.lastName) || n(a.firstName).split(' ')[0] === n(b.firstName).split(' ')[0];
};

/** El personal solo administra alumnos de su alcance (ej: Rectoría de Secundario no edita alumnos de Primario). */
const assertStaffOverStudent = async (session: SchoolSession, studentId: number) => {
  if (session.scope.all) return;
  const div = await studentDivisionId(session, studentId);
  if (!div || !canSeeDivision(session, div)) throw forbidden('Ese alumno está fuera de tu alcance.');
};

/** Crea alumno + inscripción + familias (reutiliza usuarios existentes por DNI/email: hermanos comparten familia). */
const createStudentWithFamily = async (session: SchoolSession, input: StudentInput) =>
  sequelize.transaction(async (transaction) => {
    const division = await Division.findOne({ where: { id: input.divisionId, schoolId: session.schoolId }, transaction });
    if (!division) throw badRequest(`División inexistente (${input.divisionId}).`);
    assertDivision(session, division.id);
    const dni = input.dni ? input.dni.replace(/\D/g, '') : null;

    let student = dni ? await Student.findOne({ where: { schoolId: session.schoolId, dni }, transaction }) : null;
    if (student && !sameName(student, input)) {
      throw conflict(`Ya hay un alumno con DNI ${dni} (${student.firstName} ${student.lastName}). Revisá el DNI.`);
    }
    if (!student) {
      student = await Student.create(
        {
          schoolId: session.schoolId,
          firstName: input.firstName,
          lastName: input.lastName,
          dni,
          birthDate: input.birthDate ?? null,
          notes: input.notes ?? null,
          photoUrl: null,
        },
        { transaction }
      );
    }
    await Enrollment.upsert(
      { studentId: student.id, divisionId: division.id, academicYearId: division.academicYearId as number, status: 'ACTIVE' },
      { transaction, conflictFields: ['studentId', 'academicYearId'] }
    );

    const credentials: Array<{ name: string; login: string; tempPassword: string; email: string | null }> = [];
    const newUsers: Array<{ user: User; tempPassword: string }> = [];
    const linked = new Map<number, number>(); // userId → nº de familiar en el formulario
    // Si nadie quedó marcado como principal, el primero lo es (recibe los avisos importantes).
    const hasPrimary = input.guardians.some((g) => g.isPrimary);
    for (const [i, g] of input.guardians.entries()) {
      const { relationship, isPrimary, canPickUp, receivesCommunications, ...p } = g;
      const { user, tempPassword } = await findOrCreatePerson(p, transaction);
      if (linked.has(user.id)) {
        throw badRequest(`Familiar ${linked.get(user.id)} y Familiar ${i + 1} quedaron como la misma persona (${user.firstName} ${user.lastName}): cada familiar necesita su propio DNI o email.`);
      }
      linked.set(user.id, i + 1);
      // unscoped: si el vínculo existía y se había dado de baja, se reactiva (no se duplica).
      const [link, created] = await StudentGuardian.unscoped().findOrCreate({
        where: { studentId: student.id, userId: user.id },
        defaults: { studentId: student.id, userId: user.id, relationship, isPrimary: isPrimary || (!hasPrimary && i === 0), canPickUp, receivesCommunications },
        transaction,
      });
      // Re-carga del mismo alumno: actualiza el vínculo en lugar de ignorarlo en silencio.
      if (!created) await link.update({ relationship, canPickUp, receivesCommunications, active: true, endedAt: null, ...(isPrimary ? { isPrimary } : {}) }, { transaction });
      await UserRole.findOrCreate({
        where: { userId: user.id, schoolId: session.schoolId, role: RoleCode.TUTOR },
        defaults: { userId: user.id, schoolId: session.schoolId, role: RoleCode.TUTOR, levelId: null, title: null },
        transaction,
      });
      if (tempPassword) {
        newUsers.push({ user, tempPassword });
        credentials.push({
          name: `${user.firstName} ${user.lastName}`,
          login: user.dni ?? user.email,
          tempPassword,
          email: isTechEmail(user.email) ? null : user.email,
        });
      }
    }
    return { student, credentials, newUsers, guardiansLinked: linked.size };
  });

// =============== CUENTAS DE ESTUDIANTES (solo Secundario) ===============

/** División actual del alumno con su nivel; las cuentas propias solo existen en Secundario. */
const secondaryEnrollment = async (session: SchoolSession, studentId: number) => {
  const e = await Enrollment.findOne({
    where: { studentId, academicYearId: session.academicYearId ?? 0, status: 'ACTIVE' },
    include: [{ model: Division, attributes: ['id', 'name'], include: [{ model: Level, attributes: ['type'] }] }],
  });
  const division = e?.Division as (Division & { Level?: Level }) | undefined;
  if (!division) throw badRequest('El alumno no está inscripto en el ciclo actual.');
  if (division.Level?.type !== 'SECUNDARIO') throw badRequest('Las cuentas de estudiantes solo están habilitadas para Secundario.');
  return division;
};

/** Crea (o reactiva) la cuenta del estudiante. Ingresa con su DNI; el email es opcional. */
const createStudentAccount = async (session: SchoolSession, student: Student, email: string | null) => {
  if (!student.dni && !email) throw badRequest(`${student.firstName} ${student.lastName}: cargá su DNI (o un email) para crearle la cuenta.`);
  return sequelize.transaction(async (transaction) => {
    let tempPassword: string | null = null;
    let user: User | null = student.userId ? await User.findByPk(student.userId, { transaction }) : null;
    if (!user) {
      const r = await findOrCreatePerson({ firstName: student.firstName, lastName: student.lastName, dni: student.dni, email }, transaction);
      // Un DNI de alumno que ya es de un adulto (ej: se cargó el DNI de la madre) no se reutiliza.
      if (!r.created && (await UserRole.count({ where: { userId: r.user.id, role: { [Op.ne]: 'ESTUDIANTE' } }, transaction }))) {
        throw conflict(`${student.firstName}: ese DNI ya pertenece a una cuenta de personal o familia. Revisá el DNI del alumno.`);
      }
      user = r.user;
      tempPassword = r.tempPassword;
      await student.update({ userId: user.id }, { transaction });
    }
    const [m, created] = await UserRole.findOrCreate({
      where: { userId: user.id, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE },
      defaults: { userId: user.id, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE, levelId: null, title: null },
      transaction,
    });
    if (!created && m.active && !tempPassword) throw conflict(`${student.firstName} ya tiene una cuenta activa.`);
    if (!created && !m.active) await m.update({ active: true }, { transaction });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Student', entityId: student.id, action: 'create-account', after: { userId: user.id } }, transaction);
    return { user, tempPassword };
  });
};

/** Lista de alumnos dentro del alcance (docente: sus divisiones; preceptor/directivo: su nivel). */
// GET /students
export const listStudents = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { page, limit, divisionId, q } = req.query as unknown as z.infer<typeof studentQuery>;
    if (divisionId) assertDivision(session, divisionId);

    const showInactive = (req.query as { status?: string }).status === 'inactive';
    const enrollmentWhere: WhereOptions = showInactive ? {} : { academicYearId: session.academicYearId ?? 0, status: 'ACTIVE' };
    if (divisionId) Object.assign(enrollmentWhere, { divisionId });
    else if (!session.scope.all) Object.assign(enrollmentWhere, { divisionId: session.scope.divisionIds });

    const where: WhereOptions = { schoolId: session.schoolId, active: !showInactive };
    if (q) {
      Object.assign(where, {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${q}%` } },
          { lastName: { [Op.iLike]: `%${q}%` } },
          { dni: { [Op.iLike]: `%${q.replace(/\D/g, '') || q}%` } },
        ],
      });
    }

    const { rows, count } = await Student.findAndCountAll({
      where,
      include: [
        {
          model: Enrollment,
          where: enrollmentWhere,
          required: !showInactive && !(session.scope.all && !divisionId),
          include: [{ model: Division, attributes: ['id', 'name', 'levelId'] }],
        },
      ],
      attributes: ['id', 'firstName', 'lastName', 'dni', 'photoUrl', 'active', 'leftAt', 'leaveReason'],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    res.json({ data: rows, pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) } });
  });

/** Ficha del alumno: personal con alcance o su familia. Las notas privadas solo las ve el personal. */
// GET /students/:id
export const getStudent = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const id = Number(req.params.id);
    const { asGuardian } = await assertStudentAccess(session, id);
    const student = await Student.findByPk(id, {
      attributes: asGuardian ? ['id', 'firstName', 'lastName', 'dni', 'birthDate', 'photoUrl'] : undefined,
      include: [
        {
          model: Enrollment,
          where: { academicYearId: session.academicYearId ?? 0 },
          required: false,
          include: [{ model: Division, include: [{ model: Level, attributes: ['id', 'name', 'type'] }] }],
        },
        {
          model: StudentGuardian,
          as: 'Guardians',
          // El defaultScope (solo vínculos vigentes) haría un INNER JOIN: sin esto, un alumno sin familia daba 404.
          required: false,
          include: [{ model: User, attributes: asGuardian ? BASIC_USER_ATTRIBUTES : userAttrsFor(session) }],
        },
      ],
    });
    if (!student) throw notFound();
    const json = student.toJSON() as unknown as Record<string, unknown>;

    // Trayectoria: todos los ciclos en los que estuvo inscripto (el boletín de cada uno se conserva).
    const history = await Enrollment.findAll({
      where: { studentId: id },
      attributes: ['id', 'status', 'academicYearId'],
      include: [
        { model: AcademicYear, attributes: ['id', 'year'] },
        { model: Division, attributes: ['id', 'name'], include: [{ model: Level, attributes: ['id', 'name', 'type'] }] },
      ],
      order: [[AcademicYear, 'year', 'DESC']],
    });
    json.history = history.map((e) => {
      const year = (e as Enrollment & { AcademicYear?: { id: number; year: number } }).AcademicYear;
      const division = (e as Enrollment & { Division?: { id: number; name: string; Level?: { id: number; name: string; type: string } } }).Division;
      return { academicYearId: year?.id ?? e.academicYearId, year: year?.year, status: e.status, division: division ? { id: division.id, name: division.name, level: division.Level?.name ?? null } : null };
    });

    if (asGuardian) delete json.notes;
    delete json.userId;
    if (!asGuardian) {
      const division = student.Enrollments?.[0]?.Division as (Division & { Level?: Level }) | undefined;
      const [u, m] = student.userId
        ? await Promise.all([
            User.findByPk(student.userId, { attributes: ['id', 'lastLogin', 'mustChangePassword', 'dni', 'email'] }),
            UserRole.findOne({ where: { userId: student.userId, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE } }),
          ])
        : [null, null];
      json.account = {
        eligible: division?.Level?.type === 'SECUNDARIO',
        exists: !!u,
        active: !!m?.active,
        userId: u?.id ?? null,
        login: u ? u.dni ?? u.email : null,
        lastLogin: u?.lastLogin ?? null,
        mustChangePassword: u?.mustChangePassword ?? null,
      };
    }
    res.json(json);
  });

// POST /students
export const createStudent = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const result = await createStudentWithFamily(session, req.body);
    const name = await schoolName(session.schoolId);
    result.newUsers.forEach(({ user, tempPassword }) => sendWelcome(user, tempPassword, name));
    invalidateSchoolSession();
    touchAccess(session.schoolId);
    res.status(201).json({ student: result.student, credentials: result.credentials, guardiansLinked: result.guardiansLinked });
  });

/**
 * Importación masiva (CSV/Excel convertido a filas en el navegador). Procesa fila por fila:
 * un error no frena el resto y se informa por número de fila.
 */
// POST /students/import
export const importStudents = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const name = await schoolName(session.schoolId);
    const ok: number[] = [];
    const errors: Array<{ row: number; message: string }> = [];
    const credentials: Array<{ name: string; login: string; tempPassword: string; email: string | null; student: string }> = [];

    for (const [i, raw] of (req.body.rows as unknown[]).entries()) {
      const parsed = studentBody.safeParse(raw);
      if (!parsed.success) {
        errors.push({ row: i + 1, message: Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => `${k}: ${v?.join(', ')}`).join(' · ') });
        continue;
      }
      try {
        const r = await createStudentWithFamily(session, parsed.data);
        ok.push(i + 1);
        credentials.push(...r.credentials.map((c) => ({ ...c, student: `${r.student.lastName}, ${r.student.firstName}` })));
        if (req.body.sendEmails) r.newUsers.forEach(({ user, tempPassword }) => sendWelcome(user, tempPassword, name));
      } catch (err) {
        errors.push({ row: i + 1, message: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
    invalidateSchoolSession();
    touchAccess(session.schoolId);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Student', action: 'import', after: { imported: ok.length, failed: errors.length } });
    res.json({ imported: ok.length, errors, credentials });
  });

// PATCH /students/:id
export const updateStudent = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!student) throw notFound();
    await assertStaffOverStudent(session, student.id);
    const { divisionId, ...data } = req.body;
    await sequelize.transaction(async (transaction) => {
      if (data.dni) data.dni = data.dni.replace(/\D/g, '');
      await student.update(data, { transaction });
      if (divisionId) {
        const division = await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, transaction });
        if (!division) throw badRequest('División inválida.');
        assertDivision(session, division.id);
        await Enrollment.upsert(
          { studentId: student.id, divisionId, academicYearId: division.academicYearId as number, status: 'ACTIVE' },
          { transaction, conflictFields: ['studentId', 'academicYearId'] }
        );
      }
    });
    invalidateSchoolSession();
    touchAccess(session.schoolId);
    res.json(student);
  });

// POST /students/:id/guardians
export const addGuardian = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!student) throw notFound();
    await assertStaffOverStudent(session, student.id);
    const { relationship, isPrimary, canPickUp, receivesCommunications, ...p } = req.body as z.infer<typeof guardianInput>;
    const result = await sequelize.transaction(async (transaction) => {
      const r = await findOrCreatePerson(p, transaction);
      const [link, created] = await StudentGuardian.unscoped().findOrCreate({
        where: { studentId: student.id, userId: r.user.id },
        defaults: { studentId: student.id, userId: r.user.id, relationship, isPrimary, canPickUp, receivesCommunications },
        transaction,
      });
      if (!created && link.active) throw conflict(`${r.user.firstName} ${r.user.lastName} ya está vinculado/a a ${student.firstName}.`);
      if (!created) await link.update({ active: true, endedAt: null, relationship, isPrimary, canPickUp, receivesCommunications }, { transaction });
      await UserRole.findOrCreate({
        where: { userId: r.user.id, schoolId: session.schoolId, role: RoleCode.TUTOR },
        defaults: { userId: r.user.id, schoolId: session.schoolId, role: RoleCode.TUTOR, levelId: null, title: null },
        transaction,
      });
      return r;
    });
    if (result.tempPassword) sendWelcome(result.user, result.tempPassword, await schoolName(session.schoolId));
    invalidateSchoolSession(result.user.id);
    touchAccess(session.schoolId, [result.user.id]);
    res.status(201).json({
      userId: result.user.id,
      name: `${result.user.firstName} ${result.user.lastName}`,
      login: result.user.dni ?? result.user.email,
      tempPassword: result.tempPassword,
      email: isTechEmail(result.user.email) ? null : result.user.email,
      existing: !result.created,
    });
  });

// PATCH /guardians/:id
export const updateGuardianLink = asyncHandler(async (req, res) => {
    const link = await StudentGuardian.findByPk(Number(req.params.id), { include: [{ model: Student, where: { schoolId: req.schoolSession!.schoolId } }] });
    if (!link) throw notFound();
    await assertStaffOverStudent(req.schoolSession!, link.studentId as number);
    res.json(await link.update(req.body));
  });

// DELETE /guardians/:id
export const unlinkGuardian = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const link = await StudentGuardian.findByPk(Number(req.params.id), { include: [{ model: Student, where: { schoolId: session.schoolId } }] });
    if (link) {
      await assertStaffOverStudent(session, link.studentId as number);

      await link.update({ active: false, endedAt: new Date() });
      await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'StudentGuardian', entityId: link.id, action: 'unlink', before: { studentId: link.studentId, userId: link.userId } });
      invalidateSchoolSession(link.userId as number);
      touchAccess(session.schoolId, [link.userId as number]);
    }
    res.status(204).end();
  });

// POST /students/:id/account
export const createAccount = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: session.schoolId, active: true } });
    if (!student) throw notFound();
    await assertStaffOverStudent(session, student.id);
    await secondaryEnrollment(session, student.id);
    const { user, tempPassword } = await createStudentAccount(session, student, (req.body.email as string | null) ?? null);
    if (tempPassword) sendWelcome(user, tempPassword, await schoolName(session.schoolId));
    invalidateSchoolSession(user.id);
    touchAccess(session.schoolId, [user.id]);
    res.status(201).json({
      userId: user.id,
      credentials: tempPassword ? [{ name: `${user.firstName} ${user.lastName}`, login: user.dni ?? user.email, tempPassword, email: isTechEmail(user.email) ? null : user.email }] : [],
    });
  });

/** Cuentas para toda una división de Secundario (las que falten). Un error no frena al resto. */
// POST /students/accounts
export const createDivisionAccounts = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const divisionId = req.body.divisionId as number;
    assertDivision(session, divisionId);
    const division = (await Division.findOne({ where: { id: divisionId, schoolId: session.schoolId }, include: [{ model: Level, attributes: ['type'] }] })) as (Division & { Level?: Level }) | null;
    if (!division) throw notFound();
    if (division.Level?.type !== 'SECUNDARIO') throw badRequest('Las cuentas de estudiantes solo están habilitadas para Secundario.');
    const enrollments = await Enrollment.findAll({ where: { divisionId, status: 'ACTIVE' }, include: [{ model: Student, where: { active: true } }] });
    const name = await schoolName(session.schoolId);
    const credentials: Array<{ name: string; login: string; tempPassword: string; email: string | null; student: string }> = [];
    const errors: Array<{ student: string; message: string }> = [];
    let skipped = 0;
    for (const e of enrollments) {
      const st = e.Student!;
      if (st.userId && (await UserRole.count({ where: { userId: st.userId, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE, active: true } }))) {
        skipped++;
        continue;
      }
      try {
        const { user, tempPassword } = await createStudentAccount(session, st, null);
        if (tempPassword) {
          credentials.push({ name: `${user.firstName} ${user.lastName}`, login: user.dni ?? user.email, tempPassword, email: null, student: division.name });
          sendWelcome(user, tempPassword, name);
        }
      } catch (err) {
        errors.push({ student: `${st.lastName}, ${st.firstName}`, message: err instanceof Error ? err.message : 'Error' });
      }
    }
    invalidateSchoolSession();
    touchAccess(session.schoolId);
    res.json({ created: credentials.length, skipped, errors, credentials });
  });

/** Desactivar / reactivar la cuenta del estudiante (baja lógica; su legajo y mensajes se conservan). */
// PATCH /students/:id/account
export const setAccountStatus = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
    if (!student?.userId) throw notFound('El alumno no tiene cuenta.');
    await assertStaffOverStudent(session, student.id);
    await UserRole.update({ active: req.body.active }, { where: { userId: student.userId, schoolId: session.schoolId, role: RoleCode.ESTUDIANTE } });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Student', entityId: student.id, action: req.body.active ? 'enable-account' : 'disable-account' });
    invalidateSchoolSession(student.userId);
    touchAccess(session.schoolId, [student.userId]);
    res.json({ ok: true });
  });

/** Hijos del usuario logueado (vista familia). */
// GET /my-children
export const listMyChildren = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    if (!session.childIds.length) return res.json([]);
    const children = await Student.findAll({
      where: { id: session.childIds },
      attributes: ['id', 'firstName', 'lastName', 'photoUrl'],
      include: [
        {
          model: Enrollment,
          where: { academicYearId: session.academicYearId ?? 0, status: 'ACTIVE' },
          required: false,
          include: [{ model: Division, attributes: ['id', 'name', 'levelId'], include: [{ model: Level, attributes: ['id', 'name', 'type'] }] }],
        },
      ],
      order: [['firstName', 'ASC']],
    });
    res.json(children);
  });
