/**
 * Directorio de personas de la institución (familias y personal) y ficha de perfil.
 * Lo que se muestra de cada persona depende de quién mira (ver services/access.ts → visibilityOf).
 */
import { z } from 'zod';
import { Op, QueryTypes } from 'sequelize';
import { User, Division, Level, Subject, TeachingAssignment, School, Student, StudentGuardian, UserRole, sequelize } from '../models';
import { asyncHandler, pagination, conflict, forbidden, badRequest } from '../lib/http';
import { invalidateSchoolSession, canSeeDivision, SchoolSession } from '../services/schoolSession';
import { ROLE_LABELS, SchoolRole, isStaffRole } from '../constants/school';
import { loadPerson, assertCanManagePerson, visibilityOf } from '../services/access';
import { resetToTemporaryPassword, isTechEmail } from '../services/accounts';
import { audit } from '../services/audit';
import { reconcileAccess, touchAccess } from '../services/billing';
import { Entity, Action } from '../constants/permissions';
import { dirQuery } from '../validators/people.validator';
import { RoleCode } from '../constants/roles';

const like = (q?: string) => (q ? `%${q.replace(/[%_]/g, '')}%` : null);

/** Materias que dicta (para la familia: solo en las divisiones de sus hijos). */
const teachingOf = async (session: SchoolSession, userId: number, onlyDivisions?: number[]) => {
  if (!session.academicYearId) return [];
  const rows = await TeachingAssignment.findAll({
    where: { teacherId: userId, schoolId: session.schoolId, ...(onlyDivisions ? { divisionId: onlyDivisions } : {}) },
    include: [
      { model: Division, where: { academicYearId: session.academicYearId }, attributes: ['id', 'name'], include: [{ model: Level, attributes: ['name'] }] },
      { model: Subject, attributes: ['id', 'name'] },
    ],
    order: [[Division, 'name', 'ASC']],
  });
  return rows.map((t) => ({ division: { id: t.Division!.id, name: t.Division!.name, level: t.Division!.Level?.name }, subject: t.Subject }));
};

// GET /people
export const listPeople = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const { page, limit, type, q, divisionId, role, status } = req.query as unknown as z.infer<typeof dirQuery>;
    const contacts = session.can(Entity.CONTACT_INFO, Action.READ);
    if (divisionId && !canSeeDivision(session, divisionId)) throw forbidden('Esa división está fuera de tu alcance.');
    const statusSql =
      status === 'never' ? `AND u."lastLogin" IS NULL` : status === 'pending' ? `AND u."mustChangePassword" = true` : '';

    if (type === 'families') {

      const divisions = divisionId ? [divisionId] : session.scope.all ? null : session.scope.divisionIds;
      if (divisions && !divisions.length) return res.json({ data: [], pagination: { totalItems: 0, currentPage: page, totalPages: 0 } });
      const rows = (await sequelize.query(
        `WITH fam AS (
           SELECT g."userId", json_agg(json_build_object(
                    'id', s.id, 'firstName', s."firstName", 'lastName', s."lastName", 'relationship', g.relationship,
                    'division', d.name, 'divisionId', d.id) ORDER BY s."firstName") AS children
             FROM "StudentGuardian" g
             JOIN "Student" s ON s.id = g."studentId" AND s."schoolId" = :sid AND s.active
             LEFT JOIN "Enrollment" e ON e."studentId" = s.id AND e."academicYearId" = :yid AND e.status = 'ACTIVE'
             LEFT JOIN "Division" d ON d.id = e."divisionId"
            WHERE g.active AND ${divisions ? `e."divisionId" IN (:divs)` : 'TRUE'}
            GROUP BY g."userId"
         )
         SELECT u.id, u."firstName", u."lastName", u.avatar, u."lastLogin", u."mustChangePassword", u."isActive",
                ${contacts ? `u.email, u.phone, u.dni,` : ''} fam.children, COUNT(*) OVER()::int AS total
           FROM fam JOIN "User" u ON u.id = fam."userId"
          WHERE (:q::text IS NULL OR u."firstName" ILIKE :q OR u."lastName" ILIKE :q OR u.dni ILIKE :q OR u.email ILIKE :q
                 OR (u."firstName" || ' ' || u."lastName") ILIKE :q OR fam.children::text ILIKE :q) ${statusSql}
          ORDER BY u."lastName", u."firstName"
          LIMIT :limit OFFSET :offset`,
        {
          replacements: { sid: session.schoolId, yid: session.academicYearId ?? 0, divs: divisions ?? [0], q: like(q), limit, offset: (page - 1) * limit },
          type: QueryTypes.SELECT,
        }
      )) as Array<Record<string, unknown> & { total: number; email?: string }>;
      const total = rows[0]?.total ?? 0;
      return res.json({
        data: rows.map(({ total: _t, ...r }) => ({ ...r, email: r.email && isTechEmail(r.email) ? null : r.email })),
        pagination: { totalItems: total, currentPage: page, totalPages: Math.ceil(total / limit) },
      });
    }

    const roleFilter = role && role in ROLE_LABELS ? role : null;
    const rows = (await sequelize.query(
      `SELECT u.id, u."firstName", u."lastName", u.avatar, u."lastLogin", u."mustChangePassword", u."isActive",
              ${contacts ? `u.email, u.phone, u.dni,` : ''}
              json_agg(json_build_object('membershipId', m.id, 'role', m.role, 'levelId', m."levelId", 'level', l.name, 'title', m.title, 'active', m.active)
                       ORDER BY m.role) AS roles,
              bool_or(m.active) AS active,
              COUNT(*) OVER()::int AS total
         FROM "UserRole" m
         JOIN "User" u ON u.id = m."userId"
         LEFT JOIN "Level" l ON l.id = m."levelId"
        WHERE m."schoolId" = :sid AND m.role NOT IN ('TUTOR', 'ESTUDIANTE')
          AND (:role::text IS NULL OR m.role::text = :role)
          AND (:q::text IS NULL OR u."firstName" ILIKE :q OR u."lastName" ILIKE :q OR u.email ILIKE :q OR u.dni ILIKE :q
               OR (u."firstName" || ' ' || u."lastName") ILIKE :q OR m.title ILIKE :q) ${statusSql}
        GROUP BY u.id
        ORDER BY u."lastName", u."firstName"
        LIMIT :limit OFFSET :offset`,
      { replacements: { sid: session.schoolId, role: roleFilter, q: like(q), limit, offset: (page - 1) * limit }, type: QueryTypes.SELECT }
    )) as Array<Record<string, unknown> & { total: number; email?: string; roles: Array<{ role: SchoolRole }> }>;
    const total = rows[0]?.total ?? 0;
    res.json({
      data: rows.map(({ total: _t, ...r }) => ({
        ...r,
        email: r.email && isTechEmail(r.email) ? null : r.email,
        roles: r.roles.map((x) => ({ ...x, roleLabel: ROLE_LABELS[x.role] })),
      })),
      pagination: { totalItems: total, currentPage: page, totalPages: Math.ceil(total / limit) },
    });
  });

/** Ficha de una persona. Cada campo se incluye solo si quien mira puede verlo. */
// GET /people/:id
export const getPerson = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const person = await loadPerson(session, Number(req.params.id));
    const vis = await visibilityOf(session, person);
    const u = person.user;
    const full = vis === 'self' || (vis === 'staff' && session.can(Entity.CONTACT_INFO, Action.READ));

    let canManage = false;
    if (vis !== 'self' && session.can(Entity.USERS, Action.UPDATE)) {
      canManage = await assertCanManagePerson(session, person).then(() => true, () => false);
    }

    let children: Array<Record<string, unknown>> = [];
    if (person.isGuardian && vis !== 'limited') {
      const ids = person.guardianLinks.filter((g) => g.Student?.active !== false).map((g) => g.studentId as number);
      const enr = ids.length && session.academicYearId
        ? ((await sequelize.query(
            `SELECT e."studentId", d.id, d.name, l.name AS level FROM "Enrollment" e JOIN "Division" d ON d.id = e."divisionId" JOIN "Level" l ON l.id = d."levelId"
              WHERE e."studentId" IN (:ids) AND e."academicYearId" = :yid AND e.status = 'ACTIVE'`,
            { replacements: { ids, yid: session.academicYearId }, type: QueryTypes.SELECT }
          )) as Array<{ studentId: number; id: number; name: string; level: string }>)
        : [];
      children = person.guardianLinks
        .map((g) => {
          const e = enr.find((x) => x.studentId === g.studentId);
          return {
            linkId: g.id,
            id: g.studentId,
            firstName: g.Student!.firstName,
            lastName: g.Student!.lastName,
            photoUrl: g.Student!.photoUrl,
            relationship: g.relationship,
            isPrimary: g.isPrimary,
            canPickUp: g.canPickUp,
            division: e ? { id: e.id, name: e.name, level: e.level } : null,
          };
        })
        .filter((c) => vis === 'self' || session.scope.all || (c.division && canSeeDivision(session, c.division.id)));
    } else if (person.isGuardian && vis === 'limited') {

      children = person.guardianLinks
        .filter((g) => session.childIds.includes(g.studentId as number) || session.isStaff)
        .map((g) => ({ id: g.studentId, firstName: g.Student!.firstName, relationship: g.relationship }));
    }

    let teaching: Awaited<ReturnType<typeof teachingOf>> = [];
    if (person.staffRoles.includes(RoleCode.DOCENTE) || (await TeachingAssignment.count({ where: { teacherId: u.id, schoolId: session.schoolId } }))) {
      let only: number[] | undefined;
      if (vis === 'limited' && !session.isStaff) {
        only = session.academicYearId
          ? ((await sequelize.query(`SELECT "divisionId" FROM "Enrollment" WHERE "studentId" IN (:ids) AND "academicYearId" = :yid AND status = 'ACTIVE'`, {
              replacements: { ids: session.childIds.length ? session.childIds : [0], yid: session.academicYearId },
              type: QueryTypes.SELECT,
            })) as Array<{ divisionId: number }>).map((r) => r.divisionId)
          : [];
      }
      teaching = await teachingOf(session, u.id, only);
    }

    const roles = person.userRoles
      .filter((m) => isStaffRole(m.role) && (m.active || vis !== 'limited'))
      .map((m) => ({ membershipId: m.id, role: m.role, roleLabel: ROLE_LABELS[m.role], levelId: m.levelId, title: m.title, active: m.active }));
    const levelNames = new Map(
      (await Level.findAll({ where: { schoolId: session.schoolId }, attributes: ['id', 'name'], raw: true })).map((l) => [l.id, l.name])
    );

    res.json({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      biography: u.biography,
      roles: roles.map((r) => ({ ...r, level: r.levelId ? levelNames.get(r.levelId) ?? null : null })),
      isGuardian: person.isGuardian,
      isStaff: person.staffRoles.length > 0,
      isStudent: !!person.student && person.userRoles.some((m) => m.role === RoleCode.ESTUDIANTE),
      studentId: person.student && vis !== 'limited' ? person.student.id : null,
      accessActive: person.staffRoles.length > 0 || person.isGuardian || person.userRoles.some((m) => m.role === RoleCode.ESTUDIANTE && m.active),
      children,
      teaching,
      contact: full ? { email: isTechEmail(u.email) ? null : u.email, phone: u.phone, dni: u.dni } : null,
      account:
        vis === 'self' || canManage || (vis === 'staff' && session.can(Entity.USERS, Action.UPDATE))
          ? { lastLogin: u.lastLogin, mustChangePassword: u.mustChangePassword, isActive: u.isActive, login: u.dni ?? u.email }
          : null,
      visibility: vis,
      canManage,
    });
  });

/** Corrige datos personales (nombre, DNI, email, teléfono) con validación de duplicados. */
// PATCH /people/:id
export const updatePerson = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const person = await loadPerson(session, Number(req.params.id));
    await assertCanManagePerson(session, person);
    const body = req.body as Partial<{ firstName: string; lastName: string; email: string | null; dni: string | null; phone: string | null }>;
    const patch: Record<string, unknown> = {};
    if (body.firstName) patch.firstName = body.firstName;
    if (body.lastName) patch.lastName = body.lastName;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.dni !== undefined) {
      const dni = body.dni ? body.dni.replace(/\D/g, '') : null;
      if (dni && (dni.length < 7 || dni.length > 9)) throw badRequest('El DNI debe tener 7 u 8 dígitos.');
      if (!dni && isTechEmail(person.user.email) && body.email === undefined) throw conflict('Sin email, el DNI es obligatorio: es lo que usa para ingresar.');
      if (dni) {
        const other = await User.findOne({ where: { dni, id: { [Op.ne]: person.user.id } }, attributes: ['firstName', 'lastName'] });
        if (other) throw conflict(`Ese DNI ya lo tiene ${other.firstName} ${other.lastName}.`);
      }
      patch.dni = dni;
    }
    if (body.email !== undefined) {
      const email = body.email?.toLowerCase() ?? null;
      if (email) {
        const other = await User.findOne({ where: { email, id: { [Op.ne]: person.user.id } }, attributes: ['firstName', 'lastName'] });
        if (other) throw conflict(`Ese email ya lo usa ${other.firstName} ${other.lastName}.`);
        patch.email = email;
      } else {
        const dni = (patch.dni as string | null | undefined) ?? person.user.dni;
        if (!dni) throw conflict('Sin DNI, el email es obligatorio: es lo que usa para ingresar.');
        patch.email = `${dni}@sin-email.local`;
      }
    }
    const before = { firstName: person.user.firstName, lastName: person.user.lastName, email: person.user.email, dni: person.user.dni, phone: person.user.phone };
    await person.user.update(patch);
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'User', entityId: person.user.id, action: 'update', before, after: patch });
    invalidateSchoolSession(person.user.id);
    touchAccess(session.schoolId, [person.user.id]);
    res.json({ ok: true });
  });

/**
 * Blanqueo de contraseña: genera una temporal, obliga a cambiarla al ingresar y la manda por email.
 * Se muestra UNA vez a quien la blanqueó (para entregarla a quien no tiene email).
 */
// POST /people/:id/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const person = await loadPerson(session, Number(req.params.id));
    await assertCanManagePerson(session, person);
    if (!person.user.isActive) throw conflict('La cuenta está desactivada.');
    const school = await School.findByPk(session.schoolId, { attributes: ['name'] });
    const r = await resetToTemporaryPassword(person.user, school?.name ?? 'Tu institución');
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'User', entityId: person.user.id, action: 'reset-password' });
    res.json({ name: `${person.user.firstName} ${person.user.lastName}`, login: r.login, tempPassword: r.tempPassword, emailed: r.emailed });
  });

/**
 * Desactivar / reactivar el acceso de una persona a ESTE colegio (baja lógica: nada se borra).
 * Personal → sus roles; familia → sus vínculos con alumnos; estudiante → su cuenta de alumno.
 * Para facturación cuenta igual el mes en que estuvo activa (ver services/billing.ts).
 */
// PATCH /people/:id/access
export const setAccess = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const person = await loadPerson(session, Number(req.params.id));
    await assertCanManagePerson(session, person);
    const active = req.body.active as boolean;
    const studentIds = (await Student.findAll({ where: { schoolId: session.schoolId }, attributes: ['id'], raw: true })).map((x) => x.id);
    await sequelize.transaction(async (transaction) => {
      await UserRole.update({ active }, { where: { userId: person.user.id, schoolId: session.schoolId, role: { [Op.ne]: RoleCode.TUTOR } }, transaction });
      await StudentGuardian.unscoped().update(
        active ? { active: true, endedAt: null } : { active: false, endedAt: new Date() },
        { where: { userId: person.user.id, studentId: studentIds, active: !active }, transaction }
      );
    });
    await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'User', entityId: person.user.id, action: active ? 'enable-access' : 'disable-access' });
    invalidateSchoolSession(person.user.id);
    await reconcileAccess(session.schoolId, { userIds: [person.user.id] });
    res.json({ ok: true, active });
  });
