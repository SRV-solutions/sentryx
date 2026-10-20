/**
 * ELIMINACIÓN DEFINITIVA DE UN COLEGIO (consola de la plataforma, solo superadmin).
 *
 * Borra el colegio y TODO lo que tiene: estructura, alumnos, notas, asistencia, comunicados, mensajes,
 * canales, archivos (también del bucket), planes, facturación, legajos, eventos, programas y juegos.
 * Las cuentas que pertenecían SOLO a este colegio se borran; las que siguen en otro colegio (o son del
 * equipo de Sentryx) se conservan, sin el acceso a este.
 *
 * Resguardos: el colegio tiene que estar suspendido antes y se confirma escribiendo su identificador.
 * Queda un registro en la auditoría de la plataforma con lo que se borró.
 */
import { QueryTypes, Transaction } from 'sequelize';
import { School, sequelize } from '../models';
import { env } from '../config/env';
import { deletePrefix } from '../config/s3';
import { badRequest, conflict, notFound } from '../lib/http';
import { audit } from './audit';
import { invalidateSchoolSession } from './schoolSession';
import { isStorageConfigured } from './files';

const count = async (sql: string, replacements: Record<string, unknown>) => {
  const rows = (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as unknown as Array<{ n: string }>;
  return Number(rows[0]?.n ?? 0);
};

const tableExists = async (table: string, transaction: Transaction) =>
  !!((await sequelize.query(`SELECT to_regclass(:name) AS t`, { replacements: { name: `"${table}"` }, type: QueryTypes.SELECT, transaction })) as Array<{ t: string | null }>)[0]?.t;

/** Personas del colegio: roles, familias (por sus hijos) y cuentas de estudiantes. */
const PEOPLE_SQL = `
  SELECT "userId" AS id FROM "UserRole" WHERE "schoolId" = :sid
  UNION SELECT g."userId" FROM "StudentGuardian" g JOIN "Student" s ON s.id = g."studentId" WHERE s."schoolId" = :sid
  UNION SELECT "userId" FROM "Student" WHERE "schoolId" = :sid AND "userId" IS NOT NULL`;

/** De esas personas, las que no tienen nada en otro colegio ni rol de plataforma (se borran). */
const EXCLUSIVE_SQL = `
  SELECT p.id FROM (${PEOPLE_SQL}) p
   WHERE NOT EXISTS (SELECT 1 FROM "UserRole" m WHERE m."userId" = p.id AND (m."schoolId" IS NULL OR m."schoolId" <> :sid))
     AND NOT EXISTS (SELECT 1 FROM "StudentGuardian" g JOIN "Student" s ON s.id = g."studentId" WHERE g."userId" = p.id AND s."schoolId" <> :sid)
     AND NOT EXISTS (SELECT 1 FROM "Student" s WHERE s."userId" = p.id AND s."schoolId" <> :sid)`;

/** Lo que se va a borrar (para mostrarlo antes de confirmar y para la auditoría). */
export const deletionSummary = async (schoolId: number) => {
  const school = await School.findByPk(schoolId);
  if (!school) throw notFound('El colegio no existe.');
  const r = { sid: schoolId };
  const [students, people, exclusiveUsers, files, bytes, announcements, messages, statements, billed] = await Promise.all([
    count(`SELECT COUNT(*) n FROM "Student" WHERE "schoolId" = :sid`, r),
    count(`SELECT COUNT(*) n FROM (${PEOPLE_SQL}) p`, r),
    count(`SELECT COUNT(*) n FROM (${EXCLUSIVE_SQL}) e`, r),
    count(`SELECT COUNT(*) n FROM "FileAsset" WHERE "schoolId" = :sid`, r),
    count(`SELECT COALESCE(SUM(size), 0) n FROM "FileAsset" WHERE "schoolId" = :sid`, r),
    count(`SELECT COUNT(*) n FROM "Announcement" WHERE "schoolId" = :sid`, r),
    count(`SELECT COUNT(*) n FROM "ThreadMessage" m JOIN "Thread" t ON t.id = m."threadId" WHERE t."schoolId" = :sid`, r),
    count(`SELECT COUNT(*) n FROM "BillingStatement" WHERE "schoolId" = :sid`, r),
    count(`SELECT COALESCE(SUM(total), 0) n FROM "BillingStatement" WHERE "schoolId" = :sid`, r),
  ]);
  return {
    school: { id: school.id, name: school.name, slug: school.slug, active: school.active },
    students,
    people,
    accountsDeleted: exclusiveUsers,
    accountsKept: people - exclusiveUsers,
    files,
    bytes,
    announcements,
    messages,
    closedStatements: statements,
    billedTotal: billed,
  };
};

export const deleteSchoolPermanently = async (opts: { schoolId: number; confirmSlug: string; deletedById: number }) => {
  const school = await School.findByPk(opts.schoolId);
  if (!school) throw notFound('El colegio no existe.');
  if (school.active) throw conflict('Primero suspendé el colegio. Recién después se puede eliminar definitivamente.');
  if (opts.confirmSlug.trim().toLowerCase() !== school.slug) throw badRequest(`Para confirmar, escribí exactamente el identificador del colegio: ${school.slug}`);

  const summary = await deletionSummary(school.id);
  const r = { sid: school.id };

  await sequelize.transaction(async (transaction) => {
    const exclusive = ((await sequelize.query(EXCLUSIVE_SQL, { replacements: r, type: QueryTypes.SELECT, transaction })) as Array<{ id: number }>).map((u) => u.id);
    const run = (sql: string, replacements: Record<string, unknown> = r) => sequelize.query(sql, { replacements, transaction });

    // 1) Tablas que no se borran solas con el colegio (sus claves no son en cascada). De hijas a padres.
    await run(`DELETE FROM "LiveGame" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "QuizAssignment" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "Quiz" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "SubjectProgram" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "SchoolEvent" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "PayrollReceipt" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "StaffPosition" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "PlanRequest" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "PlanAssignment" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "AccessPeriod" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "BillingStatement" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "Channel" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "SupportReport" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "ActivityLog" WHERE "schoolId" = :sid`);
    await run(`DELETE FROM "AuditLog" WHERE "schoolId" = :sid`);

    // 2) El colegio: arrastra en cascada niveles, ciclos, cursos, materias, alumnos, familias (vínculos),
    //    notas, asistencia, alertas, comunicados, mensajes, aulas, archivos y roles.
    await run(`DELETE FROM "School" WHERE id = :sid`);

    // 3) Cuentas que eran solo de este colegio (y lo que dejaron fuera del colegio: notificaciones, reportes…).
    if (exclusive.length) {
      const u = { ids: exclusive };
      await run(`DELETE FROM "SupportReport" WHERE "userId" IN (:ids)`, u);
      await run(`DELETE FROM "PlanRequest" WHERE "userId" IN (:ids)`, u);
      await run(`DELETE FROM "PlanAssignment" WHERE "userId" IN (:ids)`, u);
      await run(`DELETE FROM "AccessPeriod" WHERE "userId" IN (:ids)`, u);
      // Tablas de los cursos SRV archivados: solo existen en bases viejas.
      if (await tableExists('LessonComment', transaction)) await run(`DELETE FROM "LessonComment" WHERE "userId" IN (:ids)`, u);
      await run(`DELETE FROM "User" WHERE id IN (:ids)`, u);
    }

    // 4) Registro en la auditoría de la plataforma (sin colegio: el colegio ya no existe).
    await audit(
      { schoolId: null, userId: opts.deletedById, entity: 'School', entityId: school.id, action: 'delete-permanent', before: summary },
      transaction
    );
  });

  // 5) Archivos del bucket (fuera de la transacción: si falla, la base ya está limpia y se informa).
  let filesDeleted = 0;
  let storageError: string | null = null;
  if (isStorageConfigured()) {
    try {
      filesDeleted = await deletePrefix(env.filesBucket!, `schools/${school.id}/`);
    } catch (err) {
      storageError = (err as Error).message;
      console.error('[school-deletion] no se pudieron borrar los archivos del bucket:', storageError);
    }
  }
  invalidateSchoolSession();
  return { ...summary, filesDeleted, storageError };
};
