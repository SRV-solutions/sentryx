/**
 * Migraciones versionadas e idempotentes (`npm run db:migrate`).
 * Cada paso se registra en "SentryxMigration" y no se vuelve a ejecutar.
 * Nunca borra datos: solo crea tablas/columnas/índices faltantes.
 */
import { DataTypes, QueryInterface } from 'sequelize';
import * as M from '../models';

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
        M.School, M.Level, M.AcademicYear, M.Division, M.Subject, M.TeachingAssignment, M.Membership,
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
