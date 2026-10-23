/** Personal de la institución: listado, alta (individual y masiva) y cambios de rol. */
import { Op } from 'sequelize';
import { UserRole, User, Level, UserSession, sequelize } from '../models';
import { asyncHandler, notFound, badRequest, forbidden } from '../lib/http';
import { invalidateSchoolSession } from '../services/schoolSession';
import { NON_STAFF_ROLES, RoleCode, isStaffRole } from '../constants/roles';
import { roleLabel } from '../services/roleRegistry';
import { sendWelcome } from '../services/accounts';
import { assertCanGrant, userAttrsFor } from '../services/access';
import { touchAccess } from '../services/billing';
import { audit } from '../services/audit';
import { grantStaffRole, StaffMemberInput, schoolName, credentialOf, parseRole, findLevelId } from '../services/staffMembers';
import { staffImportRow } from '../validators/staff.validator';
import { describeZodError } from '../lib/validationMessages';

// GET /staff
export const listStaff = asyncHandler(async (req, res) => {
  const userRoles = await UserRole.findAll({
    where: { schoolId: req.schoolSession!.schoolId, role: { [Op.notIn]: NON_STAFF_ROLES } },
    include: [
      { model: User, attributes: userAttrsFor(req.schoolSession!) },
      { model: Level, attributes: ['id', 'name'] },
    ],
    order: [[User, 'lastName', 'ASC']],
  });
  // Última conexión de cada persona (uso más reciente de sus sesiones).
  const seen = new Map(
    ((await UserSession.findAll({ where: { userId: [...new Set(userRoles.map((m) => m.userId as number))] }, attributes: ['userId', [sequelize.fn('MAX', sequelize.col('lastUsedAt')), 'seen']], group: ['userId'], raw: true })) as unknown as Array<{ userId: number; seen: Date }>).map((r) => [r.userId, r.seen])
  );
  res.json(userRoles.map((userRole) => ({ ...userRole.toJSON(), roleLabel: roleLabel(userRole.role), lastSeenAt: seen.get(userRole.userId as number) ?? null })));
});

// POST /staff
export const createStaffMember = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { user, tempPassword, userRole } = await grantStaffRole(session, req.body as StaffMemberInput);
  if (tempPassword) sendWelcome(user, tempPassword, await schoolName(session.schoolId));
  res.status(201).json({
    membership: userRole,
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName },
    // Se muestra una única vez para entregar a quien no tenga email.
    tempPassword,
  });
});

/**
 * POST /staff/import — alta masiva desde un CSV (Excel → Guardar como CSV).
 * Procesa fila por fila: un error no frena el resto y se informa con el número de fila.
 */
export const importStaff = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { rows, sendEmails } = req.body as { rows: unknown[]; sendEmails: boolean };
  const name = await schoolName(session.schoolId);
  const errors: Array<{ row: number; message: string }> = [];
  const credentials: ReturnType<typeof credentialOf>[] = [];
  let imported = 0;

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 1;
    const parsed = staffImportRow.safeParse(raw);
    if (!parsed.success) {
      errors.push({ row: rowNumber, message: describeZodError(parsed.error).message });
      continue;
    }
    try {
      const role = parseRole(parsed.data.role, session.schoolId);
      if (!role) throw badRequest(`Rol "${parsed.data.role}" desconocido (usá Docente, Preceptoría, Secretaría, Dirección…).`);
      const levelId = await findLevelId(session.schoolId, parsed.data.level);
      const { user, tempPassword } = await grantStaffRole(session, { ...parsed.data, role, levelId, title: parsed.data.title ?? null });
      imported++;
      if (tempPassword) {
        credentials.push(credentialOf(user, tempPassword));
        if (sendEmails) sendWelcome(user, tempPassword, name);
      }
    } catch (err) {
      errors.push({ row: rowNumber, message: err instanceof Error ? err.message : 'Error desconocido' });
    }
  }
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'UserRole', action: 'import', after: { imported, failed: errors.length } });
  res.json({ imported, errors, credentials });
});

// PATCH /staff/:id
export const updateStaffRole = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const userRole = await UserRole.findOne({ where: { id: req.params.id, schoolId: session.schoolId } });
  if (!userRole || !isStaffRole(userRole.role)) throw notFound();
  if (userRole.userId === session.userId && !session.superAdmin) throw forbidden('No podés modificar tu propio rol. Pedíselo a otra autoridad.');

  // Debe poder administrar el rol actual y, si cambia, el nivel/divisiones nuevos.
  assertCanGrant(session, userRole.role, userRole.levelId ?? null, userRole.divisionIds ?? []);
  const nextLevel = req.body.levelId === undefined ? userRole.levelId ?? null : req.body.levelId ?? null;
  assertCanGrant(session, userRole.role, nextLevel, req.body.divisionIds ?? userRole.divisionIds ?? []);
  if (req.body.active === false && userRole.role === RoleCode.REPRESENTANTE_LEGAL) {
    const others = await UserRole.count({ where: { schoolId: session.schoolId, role: RoleCode.REPRESENTANTE_LEGAL, active: true, id: { [Op.ne]: userRole.id } } });
    if (!others) throw badRequest('Es la única Representante Legal activa: primero asigná a otra persona.');
  }
  const before = userRole.toJSON();
  await userRole.update(req.body);
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'UserRole', entityId: userRole.id, action: 'update', before, after: userRole.toJSON() });
  invalidateSchoolSession(userRole.userId as number);
  touchAccess(session.schoolId, [userRole.userId as number]);
  res.json(userRole);
});
