import { Router } from 'express';
import { z } from 'zod';
import { Op, WhereOptions } from 'sequelize';
import {
  Membership,
  User,
  Level,
  Student,
  Enrollment,
  StudentGuardian,
  Division,
  School,
  sequelize,
} from '../../models';
import { asyncHandler, validate, idParam, notFound, badRequest, pagination } from '../../lib/http';
import { requirePerm, requireStaff, invalidateSchoolContext, assertStudentAccess, assertDivision, SchoolContext } from '../context';
import { SCHOOL_ROLES, ROLE_LABELS } from '../constants';
import { findOrCreatePerson, sendWelcome } from '../services/users';
import { audit } from '../services/audit';

const router = Router();

const person = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120).nullish(),
  dni: z.string().trim().regex(/^[\d.]{6,12}$/, 'DNI inválido').nullish(),
  phone: z.string().trim().max(40).nullish(),
};

const USER_ATTRS = ['id', 'firstName', 'lastName', 'email', 'dni', 'phone', 'avatar', 'lastLogin'];

const schoolName = async (id: number) => (await School.findByPk(id, { attributes: ['name'] }))?.name ?? 'Tu institución';

// =============== PERSONAL ===============

router.get(
  '/staff',
  requirePerm('people.read'),
  asyncHandler(async (req, res) => {
    const memberships = await Membership.findAll({
      where: { schoolId: req.school!.schoolId, role: { [Op.ne]: 'TUTOR' } },
      include: [
        { model: User, attributes: USER_ATTRS },
        { model: Level, attributes: ['id', 'name'] },
      ],
      order: [[User, 'lastName', 'ASC']],
    });
    res.json(memberships.map((m) => ({ ...m.toJSON(), roleLabel: ROLE_LABELS[m.role] })));
  })
);

const staffBody = z.object({
  ...person,
  role: z.enum(SCHOOL_ROLES).refine((r) => r !== 'TUTOR', 'Las familias se cargan desde Alumnos.'),
  levelId: z.number().int().nullish(),
  divisionIds: z.array(z.number().int()).default([]),
  title: z.string().max(80).nullish(),
});

router.post(
  '/staff',
  requirePerm('people.manage'),
  validate({ body: staffBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { role, levelId, divisionIds, title, ...p } = req.body as z.infer<typeof staffBody>;
    if (levelId && !(await Level.count({ where: { id: levelId, schoolId: ctx.schoolId } }))) throw badRequest('Nivel inválido.');

    const result = await sequelize.transaction(async (transaction) => {
      const { user, tempPassword } = await findOrCreatePerson(p, transaction);
      const [membership, created] = await Membership.findOrCreate({
        where: { userId: user.id, schoolId: ctx.schoolId, role, levelId: levelId ?? null },
        defaults: { userId: user.id, schoolId: ctx.schoolId, role, levelId: levelId ?? null, divisionIds, title: title ?? null },
        transaction,
      });
      if (!created) await membership.update({ active: true, divisionIds, title: title ?? null }, { transaction });
      await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Membership', entityId: membership.id, action: 'grant', after: { userId: user.id, role, levelId } }, transaction);
      return { user, tempPassword, membership };
    });

    invalidateSchoolContext(result.user.id);
    if (result.tempPassword) sendWelcome(result.user, result.tempPassword, await schoolName(ctx.schoolId));
    res.status(201).json({
      membership: result.membership,
      user: { id: result.user.id, firstName: result.user.firstName, lastName: result.user.lastName },
      // Se muestra una única vez para entregar a quien no tenga email.
      tempPassword: result.tempPassword,
    });
  })
);

router.patch(
  '/staff/:id',
  requirePerm('people.manage'),
  validate({
    params: idParam,
    body: z.object({
      levelId: z.number().int().nullish(),
      divisionIds: z.array(z.number().int()).optional(),
      title: z.string().max(80).nullish(),
      active: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const m = await Membership.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!m) throw notFound();
    const before = m.toJSON();
    await m.update(req.body);
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Membership', entityId: m.id, action: 'update', before, after: m.toJSON() });
    invalidateSchoolContext(m.userId as number);
    res.json(m);
  })
);

// =============== ALUMNOS ===============

const studentQuery = pagination.extend({
  divisionId: z.coerce.number().int().optional(),
  q: z.string().trim().max(60).optional(),
});

/** Lista de alumnos dentro del alcance (docente: sus divisiones; preceptor/directivo: su nivel). */
router.get(
  '/students',
  requirePerm('people.read'),
  validate({ query: studentQuery }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const { page, limit, divisionId, q } = req.query as unknown as z.infer<typeof studentQuery>;
    if (divisionId) assertDivision(ctx, divisionId);

    const enrollmentWhere: WhereOptions = { academicYearId: ctx.academicYearId ?? 0, status: 'ACTIVE' };
    if (divisionId) Object.assign(enrollmentWhere, { divisionId });
    else if (!ctx.scope.all) Object.assign(enrollmentWhere, { divisionId: ctx.scope.divisionIds });

    const where: WhereOptions = { schoolId: ctx.schoolId, active: true };
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
          required: !(ctx.scope.all && !divisionId),
          include: [{ model: Division, attributes: ['id', 'name', 'levelId'] }],
        },
      ],
      attributes: ['id', 'firstName', 'lastName', 'dni', 'photoUrl'],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    res.json({ data: rows, pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) } });
  })
);

/** Ficha del alumno: personal con alcance o su familia. Las notas privadas solo las ve el personal. */
router.get(
  '/students/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const id = Number(req.params.id);
    const { asGuardian } = await assertStudentAccess(ctx, id);
    const student = await Student.findByPk(id, {
      attributes: asGuardian ? ['id', 'firstName', 'lastName', 'dni', 'birthDate', 'photoUrl'] : undefined,
      include: [
        {
          model: Enrollment,
          where: { academicYearId: ctx.academicYearId ?? 0 },
          required: false,
          include: [{ model: Division, include: [{ model: Level, attributes: ['id', 'name', 'type'] }] }],
        },
        {
          model: StudentGuardian,
          as: 'Guardians',
          include: [{ model: User, attributes: asGuardian ? ['id', 'firstName', 'lastName'] : USER_ATTRS }],
        },
      ],
    });
    if (!student) throw notFound();
    res.json(student);
  })
);

const guardianInput = z.object({
  ...person,
  relationship: z.string().trim().min(2).max(40).default('Tutor/a'),
  isPrimary: z.boolean().default(false),
  canPickUp: z.boolean().default(true),
  receivesCommunications: z.boolean().default(true),
});

const studentBody = z.object({
  firstName: person.firstName,
  lastName: person.lastName,
  dni: person.dni,
  birthDate: z.string().date().nullish(),
  notes: z.string().max(2000).nullish(),
  divisionId: z.number().int().positive(),
  guardians: z.array(guardianInput).max(6).default([]),
});

type StudentInput = z.infer<typeof studentBody>;

/** Crea alumno + inscripción + familias (reutiliza usuarios existentes por DNI/email: hermanos comparten familia). */
const createStudentWithFamily = async (ctx: SchoolContext, input: StudentInput) =>
  sequelize.transaction(async (transaction) => {
    const division = await Division.findOne({ where: { id: input.divisionId, schoolId: ctx.schoolId }, transaction });
    if (!division) throw badRequest(`División inexistente (${input.divisionId}).`);
    const dni = input.dni ? input.dni.replace(/\D/g, '') : null;

    let student = dni ? await Student.findOne({ where: { schoolId: ctx.schoolId, dni }, transaction }) : null;
    if (!student) {
      student = await Student.create(
        {
          schoolId: ctx.schoolId,
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
    for (const g of input.guardians) {
      const { relationship, isPrimary, canPickUp, receivesCommunications, ...p } = g;
      const { user, tempPassword } = await findOrCreatePerson(p, transaction);
      await StudentGuardian.findOrCreate({
        where: { studentId: student.id, userId: user.id },
        defaults: { studentId: student.id, userId: user.id, relationship, isPrimary, canPickUp, receivesCommunications },
        transaction,
      });
      await Membership.findOrCreate({
        where: { userId: user.id, schoolId: ctx.schoolId, role: 'TUTOR' },
        defaults: { userId: user.id, schoolId: ctx.schoolId, role: 'TUTOR', levelId: null, title: null },
        transaction,
      });
      if (tempPassword) {
        newUsers.push({ user, tempPassword });
        credentials.push({
          name: `${user.firstName} ${user.lastName}`,
          login: user.dni ?? user.email,
          tempPassword,
          email: user.email.endsWith('@sin-email.local') ? null : user.email,
        });
      }
    }
    return { student, credentials, newUsers };
  });

router.post(
  '/students',
  requirePerm('people.manage'),
  validate({ body: studentBody }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const result = await createStudentWithFamily(ctx, req.body);
    const name = await schoolName(ctx.schoolId);
    result.newUsers.forEach(({ user, tempPassword }) => sendWelcome(user, tempPassword, name));
    invalidateSchoolContext();
    res.status(201).json({ student: result.student, credentials: result.credentials });
  })
);

/**
 * Importación masiva (CSV/Excel convertido a filas en el navegador). Procesa fila por fila:
 * un error no frena el resto y se informa por número de fila.
 */
router.post(
  '/students/import',
  requirePerm('people.manage'),
  validate({ body: z.object({ rows: z.array(z.unknown()).min(1).max(1500), sendEmails: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const name = await schoolName(ctx.schoolId);
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
        const r = await createStudentWithFamily(ctx, parsed.data);
        ok.push(i + 1);
        credentials.push(...r.credentials.map((c) => ({ ...c, student: `${r.student.lastName}, ${r.student.firstName}` })));
        if (req.body.sendEmails) r.newUsers.forEach(({ user, tempPassword }) => sendWelcome(user, tempPassword, name));
      } catch (err) {
        errors.push({ row: i + 1, message: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
    invalidateSchoolContext();
    await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'Student', action: 'import', after: { imported: ok.length, failed: errors.length } });
    res.json({ imported: ok.length, errors, credentials });
  })
);

router.patch(
  '/students/:id',
  requirePerm('people.manage'),
  validate({
    params: idParam,
    body: studentBody.omit({ guardians: true }).partial().extend({ active: z.boolean().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!student) throw notFound();
    const { divisionId, ...data } = req.body;
    await sequelize.transaction(async (transaction) => {
      if (data.dni) data.dni = data.dni.replace(/\D/g, '');
      await student.update(data, { transaction });
      if (divisionId) {
        const division = await Division.findOne({ where: { id: divisionId, schoolId: ctx.schoolId }, transaction });
        if (!division) throw badRequest('División inválida.');
        await Enrollment.upsert(
          { studentId: student.id, divisionId, academicYearId: division.academicYearId as number, status: 'ACTIVE' },
          { transaction, conflictFields: ['studentId', 'academicYearId'] }
        );
      }
    });
    invalidateSchoolContext();
    res.json(student);
  })
);

router.post(
  '/students/:id/guardians',
  requirePerm('people.manage'),
  validate({ params: idParam, body: guardianInput }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: ctx.schoolId } });
    if (!student) throw notFound();
    const { relationship, isPrimary, canPickUp, receivesCommunications, ...p } = req.body as z.infer<typeof guardianInput>;
    const result = await sequelize.transaction(async (transaction) => {
      const r = await findOrCreatePerson(p, transaction);
      await StudentGuardian.findOrCreate({
        where: { studentId: student.id, userId: r.user.id },
        defaults: { studentId: student.id, userId: r.user.id, relationship, isPrimary, canPickUp, receivesCommunications },
        transaction,
      });
      await Membership.findOrCreate({
        where: { userId: r.user.id, schoolId: ctx.schoolId, role: 'TUTOR' },
        defaults: { userId: r.user.id, schoolId: ctx.schoolId, role: 'TUTOR', levelId: null, title: null },
        transaction,
      });
      return r;
    });
    if (result.tempPassword) sendWelcome(result.user, result.tempPassword, await schoolName(ctx.schoolId));
    invalidateSchoolContext(result.user.id);
    res.status(201).json({ userId: result.user.id, tempPassword: result.tempPassword });
  })
);

router.patch(
  '/guardians/:id',
  requirePerm('people.manage'),
  validate({
    params: idParam,
    body: z.object({
      relationship: z.string().max(40).optional(),
      isPrimary: z.boolean().optional(),
      canPickUp: z.boolean().optional(),
      receivesCommunications: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const link = await StudentGuardian.findByPk(Number(req.params.id), { include: [{ model: Student, where: { schoolId: req.school!.schoolId } }] });
    if (!link) throw notFound();
    res.json(await link.update(req.body));
  })
);

router.delete(
  '/guardians/:id',
  requirePerm('people.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    const link = await StudentGuardian.findByPk(Number(req.params.id), { include: [{ model: Student, where: { schoolId: ctx.schoolId } }] });
    if (link) {
      await link.destroy();
      await audit({ schoolId: ctx.schoolId, userId: ctx.userId, entity: 'StudentGuardian', entityId: link.id, action: 'delete', before: { studentId: link.studentId, userId: link.userId } });
      invalidateSchoolContext(link.userId as number);
    }
    res.status(204).end();
  })
);

/** Hijos del usuario logueado (vista familia). */
router.get(
  '/my-children',
  asyncHandler(async (req, res) => {
    const ctx = req.school!;
    if (!ctx.childIds.length) return res.json([]);
    const children = await Student.findAll({
      where: { id: ctx.childIds },
      attributes: ['id', 'firstName', 'lastName', 'photoUrl'],
      include: [
        {
          model: Enrollment,
          where: { academicYearId: ctx.academicYearId ?? 0, status: 'ACTIVE' },
          required: false,
          include: [{ model: Division, attributes: ['id', 'name', 'levelId'], include: [{ model: Level, attributes: ['id', 'name', 'type'] }] }],
        },
      ],
      order: [['firstName', 'ASC']],
    });
    res.json(children);
  })
);

export { requireStaff };
export default router;
