/**
 * CONSOLA DE LA PLATAFORMA SENTRYX (solo superadmin).
 * Cada colegio es un espacio aislado con sus niveles, personas y datos; desde acá se dan de alta,
 * se suspenden y se ve la facturación de todos.
 */
import { z } from 'zod';
import { QueryTypes } from 'sequelize';
import { School, UserRole, sequelize } from '../models';
import { asyncHandler, notFound, conflict } from '../lib/http';
import { createSchool } from '../services/schoolSetup';
import { findOrCreatePerson, sendWelcome, isTechEmail } from '../services/accounts';
import { billingFor, cycleOf, reconcileAccess } from '../services/billing';
import { publicSchool } from '../services/branding';
import { invalidateSchoolSession } from '../services/schoolSession';
import { audit } from '../services/audit';
import { env } from '../config/env';
import { schoolBody } from '../validators/platform.validator';
import { RoleCode } from '../constants/roles';


/** Colegios con sus indicadores principales. */
// GET /schools
export const listSchools = asyncHandler(async (_req, res) => {
    const rows = (await sequelize.query(
      `SELECT s.id, s.name, s.slug, s.cue, s.active, s."createdAt",
              (SELECT json_agg(l.name ORDER BY l.id) FROM "Level" l WHERE l."schoolId" = s.id) AS levels,
              (SELECT COUNT(*)::int FROM "AccessPeriod" p WHERE p."schoolId" = s.id AND p."endedAt" IS NULL) AS "activeUsers",
              (SELECT COUNT(*)::int FROM "Student" st WHERE st."schoolId" = s.id AND st.active) AS students,
              (SELECT json_agg(json_build_object('id', u.id, 'name', u."firstName" || ' ' || u."lastName", 'email', u.email, 'lastLogin', u."lastLogin"))
                 FROM "UserRole" m JOIN "User" u ON u.id = m."userId"
                WHERE m."schoolId" = s.id AND m.role = 'REPRESENTANTE_LEGAL' AND m.active) AS "legalReps"
         FROM "School" s ORDER BY s.name`,
      { type: QueryTypes.SELECT }
    )) as Array<Record<string, unknown> & { id: number; activeUsers: number }>;
    res.json(
      rows.map((r) => ({
        ...r,
        estimatedMonthly: r.activeUsers * env.BILLING_PRICE_ARS,
        legalReps: ((r.legalReps as Array<{ email: string }> | null) ?? []).map((x) => ({ ...x, email: isTechEmail(x.email) ? null : x.email })),
      }))
    );
  });

/** Alta de colegio: crea niveles, ciclo lectivo, períodos, reglas de alertas y su Representante Legal. */
// POST /schools
export const registerSchool = asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof schoolBody>;
    if (await School.count({ where: { slug: input.slug } })) throw conflict(`Ya existe un colegio con el identificador "${input.slug}".`);
    const school = await createSchool({ name: input.name, slug: input.slug, cue: input.cue ?? null, levels: input.levels, year: input.year });
    const { user, tempPassword } = await sequelize.transaction(async (transaction) => {
      const r = await findOrCreatePerson(input.admin, transaction);
      await UserRole.create({ userId: r.user.id, schoolId: school.id, role: RoleCode.REPRESENTANTE_LEGAL, levelId: null, title: null }, { transaction });
      return r;
    });
    if (tempPassword) sendWelcome(user, tempPassword, school.name);
    invalidateSchoolSession(user.id);
    await reconcileAccess(school.id);
    await audit({ schoolId: school.id, userId: req.user!.id, entity: 'School', entityId: school.id, action: 'create', after: { name: school.name, slug: school.slug } });
    res.status(201).json({
      school: await publicSchool(school),
      loginUrl: `${env.FRONTEND_URL}/c/${school.slug}`,
      legalRep: { name: `${user.firstName} ${user.lastName}`, login: user.dni ?? user.email, tempPassword, email: isTechEmail(user.email) ? null : user.email },
    });
  });

/** Renombrar o suspender un colegio (baja lógica: nada se borra; sus usuarios dejan de poder entrar). */
// PATCH /schools/:id
export const updateSchool = asyncHandler(async (req, res) => {
    const school = await School.findByPk(Number(req.params.id));
    if (!school) throw notFound();
    const before = { name: school.name, active: school.active };
    await school.update(req.body);
    await audit({ schoolId: school.id, userId: req.user!.id, entity: 'School', entityId: school.id, action: 'update', before, after: req.body });
    invalidateSchoolSession();
    if (req.body.active !== undefined) await reconcileAccess(school.id);
    res.json(await publicSchool(school));
  });

/** Facturación de todos los colegios para un ciclo. */
// GET /billing
export const getPlatformBilling = asyncHandler(async (req, res) => {
    const cycle = (req.query as { cycle?: string }).cycle ?? cycleOf();
    const schools = await School.findAll({ attributes: ['id', 'name', 'active'], order: [['name', 'ASC']] });
    const rows = [];
    for (const s of schools) {
      const b = await billingFor(s.id, cycle);
      rows.push({ schoolId: s.id, name: s.name, active: s.active, status: b.status, billableUsers: b.billableUsers, activeNow: b.activeNow, byCategory: b.byCategory, total: b.total });
    }
    res.json({ cycle, currentCycle: cycleOf(), unitPrice: env.BILLING_PRICE_ARS, schools: rows, billableUsers: rows.reduce((t, r) => t + r.billableUsers, 0), total: rows.reduce((t, r) => t + r.total, 0) });
  });
