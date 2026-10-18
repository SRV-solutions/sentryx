/**
 * Migraciones versionadas e idempotentes (`npm run db:migrate`).
 * Cada paso se registra en "SentryxMigration" y no se vuelve a ejecutar.
 * Nunca borra datos: solo crea tablas/columnas/índices faltantes.
 */
import { DataTypes, QueryInterface } from 'sequelize';
import * as M from '../models';
import { reconcileAccess } from '../services/billing';
import { syncRbacCatalog, grantPlatformRole } from '../services/rbac';
import { RoleCode } from '../constants/roles';

const { sequelize } = M;

const addColumnIfMissing = async (qi: QueryInterface, table: string, column: string, spec: Parameters<QueryInterface['addColumn']>[2]) => {
  const desc = await qi.describeTable(table);
  if (!desc[column]) await qi.addColumn(table, column, spec);
};

const index = (sql: string) => sequelize.query(sql);

const migrations: Array<{ name: string; up: (qi: QueryInterface) => Promise<void> }> = [
  {
    // Base vacía (despliegue nuevo): crea todas las tablas desde los modelos.
    // En una base existente no toca nada: sync() sin alter/force solo crea las que faltan.
    name: '0000-baseline',
    up: async () => {
      await sequelize.sync();
    },
  },
  {
    name: '2026-10-16-school-platform',
    up: async (qi) => {
      await addColumnIfMissing(qi, 'User', 'dni', { type: DataTypes.STRING(15), allowNull: true });
      await addColumnIfMissing(qi, 'User', 'mustChangePassword', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
      await addColumnIfMissing(qi, 'User', 'isActive', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
      await index(`CREATE UNIQUE INDEX IF NOT EXISTS "user_dni_unique" ON "User" ("dni") WHERE "dni" IS NOT NULL`);

      // Orden por dependencias de claves foráneas. sync() = CREATE TABLE IF NOT EXISTS + índices del modelo.
      const models = [
        M.School, M.Level, M.AcademicYear, M.Division, M.Subject, M.TeachingAssignment,
        M.Student, M.Enrollment, M.StudentGuardian, M.GradingPeriod, M.Grade, M.ReportCardPublication,
        M.AttendanceRule, M.Attendance, M.Alert, M.Announcement, M.AnnouncementRecipient,
        M.Thread, M.ThreadParticipant, M.ThreadMessage, M.AuditLog, M.DeviceToken,
      ];
      for (const model of models) await (model as unknown as { sync: () => Promise<unknown> }).sync();

      // Índices para consultas frecuentes del sistema existente.
      await index(`CREATE INDEX IF NOT EXISTS "chat_message_chat_id" ON "ChatMessage" ("chatId", "id")`);
      await index(`CREATE INDEX IF NOT EXISTS "chat_user_user_id" ON "ChatUser" ("userId")`);
      await index(`CREATE INDEX IF NOT EXISTS "user_notification_user" ON "UserNotification" ("userId", "createdAt" DESC)`);
      await index(`CREATE INDEX IF NOT EXISTS "user_course_user" ON "UserCourse" ("userId")`);
      await index(`CREATE INDEX IF NOT EXISTS "lesson_module" ON "Lesson" ("moduleId", "order")`);
    },
  },
  {
    name: '2026-10-17-classrooms-and-files',
    up: async (qi) => {
      await addColumnIfMissing(qi, 'School', 'storageQuotaMb', { type: DataTypes.INTEGER, allowNull: true });
      await (M.FileAsset as unknown as { sync: () => Promise<unknown> }).sync();
      await (M.ClassroomPost as unknown as { sync: () => Promise<unknown> }).sync();
    },
  },
  {
    name: '2026-10-18-avatars',
    up: async () => {
      await (M.UserAvatar as unknown as { sync: () => Promise<unknown> }).sync();
    },
  },
  {
    // Cuentas de estudiantes (Secundario), canales de curso, baja lógica de vínculos y facturación.
    name: '2026-10-19-students-channels-billing',
    up: async (qi) => {
      // Solo en bases que todavía tenían el enum (en una base nueva el rol ya es texto con FK a Role).
      await index(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Membership_role') THEN
          ALTER TYPE "enum_Membership_role" ADD VALUE IF NOT EXISTS 'ESTUDIANTE';
        END IF; END $$`);
      await addColumnIfMissing(qi, 'Student', 'userId', { type: DataTypes.INTEGER, allowNull: true, references: { model: 'User', key: 'id' }, onDelete: 'SET NULL' });
      await index(`CREATE UNIQUE INDEX IF NOT EXISTS "student_user_unique" ON "Student" ("userId") WHERE "userId" IS NOT NULL`);
      await addColumnIfMissing(qi, 'StudentGuardian', 'active', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
      await addColumnIfMissing(qi, 'StudentGuardian', 'endedAt', { type: DataTypes.DATE, allowNull: true });
      for (const model of [M.AccessPeriod, M.BillingStatement, M.Channel, M.ChannelMessage, M.ChannelRead, M.ChannelMute]) {
        await (model as unknown as { sync: () => Promise<unknown> }).sync();
      }
      await index(`CREATE UNIQUE INDEX IF NOT EXISTS "access_period_open" ON "AccessPeriod" ("schoolId", "userId") WHERE "endedAt" IS NULL`);
      await index(`CREATE UNIQUE INDEX IF NOT EXISTS "channel_division_subject" ON "Channel" ("divisionId", COALESCE("subjectId", 0))`);
      // Facturación: abre un período por cada persona con acceso hoy, desde su fecha de alta original.
      for (const s of await M.School.findAll({ attributes: ['id'] })) await reconcileAccess(s.id, { backfill: true });
    },
  },
  {
    /**
     * Roles y permisos en tablas: un usuario tiene muchos roles (UserRole) y un rol muchos permisos
     * (RolePermission → Permission = acción sobre entidad). No se borra nada:
     *  - las tablas viejas de roles de los cursos SRV pasan a llamarse Legacy*;
     *  - Membership pasa a llamarse UserRole y su columna role apunta a Role.code;
     *  - el superadmin pasa de User.roleId a un UserRole de plataforma (sin colegio).
     */
    name: '2026-10-20-rbac-tables',
    up: async (qi) => {
      const tableExists = async (table: string) =>
        ((await sequelize.query(`SELECT to_regclass(:name) AS t`, { replacements: { name: `"${table}"` }, type: 'SELECT' })) as Array<{ t: string | null }>)[0].t !== null;
      const columnExists = async (table: string, column: string) => (await tableExists(table)) && !!(await qi.describeTable(table))[column];

      // 1) Tablas de roles de la versión anterior → Legacy*
      if (await columnExists('Role', 'roleName')) {
        if (await tableExists('RolePermission')) await index(`ALTER TABLE "RolePermission" RENAME TO "LegacyRolePermission"`);
        if (await tableExists('Permission')) await index(`ALTER TABLE "Permission" RENAME TO "LegacyPermission"`);
        await index(`ALTER TABLE "Role" RENAME TO "LegacyRole"`);
      }
      // Los índices conservan su nombre al renombrar la tabla: se renombran para no chocar con los nuevos.
      await index(`DO $$ DECLARE i record; BEGIN
        FOR i IN SELECT indexname FROM pg_indexes WHERE tablename IN ('LegacyRole', 'LegacyPermission', 'LegacyRolePermission')
                  AND indexname NOT LIKE 'legacy_%'
        LOOP EXECUTE format('ALTER INDEX %I RENAME TO %I', i.indexname, 'legacy_' || i.indexname); END LOOP; END $$`);
      const legacySuperadminUserIds = (await tableExists('LegacyRole')) && (await columnExists('User', 'roleId'))
        ? ((await sequelize.query(
            `SELECT u.id FROM "User" u JOIN "LegacyRole" r ON r.id = u."roleId" WHERE r."roleName" IN ('superadmin', 'admin')`,
            { type: 'SELECT' }
          )) as Array<{ id: number }>).map((r) => r.id)
        : [];
      // User.roleId deja de usarse: se conserva el dato pero sin obligatoriedad ni FK.
      if (await columnExists('User', 'roleId')) {
        await index(`DO $$ DECLARE c record; BEGIN
          FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = '"User"'::regclass AND contype = 'f'
                    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = '"User"'::regclass AND attname = 'roleId')]
          LOOP EXECUTE format('ALTER TABLE "User" DROP CONSTRAINT %I', c.conname); END LOOP; END $$`);
        await index(`ALTER TABLE "User" ALTER COLUMN "roleId" DROP NOT NULL`);
      }
      await addColumnIfMissing(qi, 'User', 'tokenVersion', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });

      // 2) Tablas nuevas + catálogo de roles y permisos
      for (const model of [M.Role, M.Permission, M.RolePermission]) await (model as unknown as { sync: () => Promise<unknown> }).sync();
      await syncRbacCatalog();

      // 3) Membership → UserRole (rol como texto con FK a Role.code; schoolId opcional para roles de plataforma)
      if ((await tableExists('Membership')) && !(await tableExists('UserRole'))) {
        await index(`ALTER TABLE "Membership" RENAME TO "UserRole"`);
      }
      if (await tableExists('UserRole')) {
        await index(`ALTER TABLE "UserRole" ALTER COLUMN role TYPE VARCHAR(40) USING role::text`);
        await index(`DROP TYPE IF EXISTS "enum_Membership_role"`);
        await index(`ALTER TABLE "UserRole" ALTER COLUMN "schoolId" DROP NOT NULL`);
        await index(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_role_fkey') THEN
            ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_fkey" FOREIGN KEY (role) REFERENCES "Role"(code) ON UPDATE CASCADE;
          END IF; END $$`);
      } else {
        await (M.UserRole as unknown as { sync: () => Promise<unknown> }).sync();
      }

      // 4) Superadmins de la versión anterior → rol de plataforma
      for (const userId of legacySuperadminUserIds) await grantPlatformRole(userId, RoleCode.SUPERADMIN);
    },
  },
  {
    // Auditoría con IP, registro de actividad, reportes de problemas, bajas de alumnos y fin de ciclo.
    name: '2026-10-21-audit-support-student-lifecycle',
    up: async (qi) => {
      await addColumnIfMissing(qi, 'AuditLog', 'ip', { type: DataTypes.STRING(64), allowNull: true });
      await addColumnIfMissing(qi, 'AuditLog', 'userAgent', { type: DataTypes.STRING(300), allowNull: true });
      await index(`CREATE INDEX IF NOT EXISTS "audit_log_school_created_at" ON "AuditLog" ("schoolId", "createdAt")`);
      await index(`CREATE INDEX IF NOT EXISTS "audit_log_user_created_at" ON "AuditLog" ("userId", "createdAt")`);
      for (const model of [M.ActivityLog, M.SupportReport]) await (model as unknown as { sync: () => Promise<unknown> }).sync();
      await addColumnIfMissing(qi, 'Student', 'leftAt', { type: DataTypes.DATEONLY, allowNull: true });
      await addColumnIfMissing(qi, 'Student', 'leaveReason', { type: DataTypes.STRING(30), allowNull: true });
      await addColumnIfMissing(qi, 'Student', 'leaveNotes', { type: DataTypes.TEXT, allowNull: true });
      await index(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Enrollment_status') THEN
          ALTER TYPE "enum_Enrollment_status" ADD VALUE IF NOT EXISTS 'COMPLETED';
        END IF; END $$`);
      // Permisos nuevos (soporte, auditoría de plataforma, publicaciones de aulas) y sus vínculos por defecto.
      await syncRbacCatalog();
    },
  },
];

const run = async () => {
  await sequelize.authenticate();
  await sequelize.query(`CREATE TABLE IF NOT EXISTS "SentryxMigration" (name VARCHAR(120) PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const [rows] = (await sequelize.query(`SELECT name FROM "SentryxMigration"`)) as [Array<{ name: string }>, unknown];
  const done = new Set(rows.map((r) => r.name));
  const qi = sequelize.getQueryInterface();

  for (const m of migrations) {
    if (done.has(m.name)) continue;
    console.log(`→ ${m.name}`);
    await m.up(qi);
    await sequelize.query(`INSERT INTO "SentryxMigration" (name) VALUES (:name)`, { replacements: { name: m.name } });
  }
  console.log('✅ Migraciones al día');
  await sequelize.close();
};

run().catch((err) => {
  console.error('❌ Migración fallida:', err);
  process.exit(1);
});
