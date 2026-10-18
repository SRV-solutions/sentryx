/**
 * Colegio de demostración: los tres niveles, UN USUARIO POR CADA ROL, alumnos con sus familias, notas,
 * asistencia, aulas y canales. Sirve para desarrollo y para presentar Sentryx a directivos.
 *
 *   Desarrollo:  npm run seed:demo                         (contraseña de todos: demo1234)
 *   Producción:  npm run seed:demo -- --password 'Clave-Demo-2026' --domain demo.wearesrv.com \
 *                                    --name "Colegio Demo Sentryx" --slug demo
 *
 * En producción: la contraseña es obligatoria (mín. 10 caracteres), las cuentas no usan DNI (para no chocar
 * con personas reales) y no se crea un superadmin de demo salvo que se pida con --with-superadmin.
 */
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import * as M from '../models';
import { createSchool } from '../services/schoolSetup';
import { syncRbacCatalog, grantPlatformRole } from '../services/rbac';
import { evaluateAlerts } from '../services/alerts';
import { LevelType } from '../constants/school';
import { RoleCode, SchoolRole } from '../constants/roles';
import { reconcileAccess } from '../services/billing';

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};
const PASSWORD = argument('password') ?? (env.isProd ? '' : 'demo1234');
const DOMAIN = argument('domain') ?? 'demo.sentryx';
const SCHOOL_NAME = argument('name') ?? 'Colegio Demo SRV';
const SCHOOL_SLUG = argument('slug') ?? 'colegio-demo';
const WITH_SUPERADMIN = !env.isProd || process.argv.includes('--with-superadmin');
/** DNIs ficticios solo en desarrollo: en producción podrían coincidir con personas reales. */
const USE_DEMO_DNI = !env.isProd;
const YEAR = new Date().getFullYear();

const FIRST = ['Sofía', 'Mateo', 'Valentina', 'Santiago', 'Martina', 'Benjamín', 'Catalina', 'Joaquín', 'Emma', 'Thiago', 'Isabella', 'Lautaro', 'Mía', 'Felipe', 'Olivia', 'Bautista'];
const LAST = ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'García', 'Pérez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres'];
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

const run = async () => {
  if (PASSWORD.length < (env.isProd ? 10 : 6)) throw new Error('Indicá --password (en producción, mínimo 10 caracteres).');
  await M.sequelize.authenticate();
  // En producción las tablas las crean las migraciones (npm run db:migrate), nunca sync().
  if (!env.isProd) await M.sequelize.sync();
  await syncRbacCatalog();

  if (await M.School.findOne({ where: { slug: SCHOOL_SLUG } })) {
    console.log(`El colegio "${SCHOOL_SLUG}" ya existe. Usá otro --slug o, en desarrollo, borrá la base.`);
    return M.sequelize.close();
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  let dni = 30_000_000;
  const mkUser = (firstName: string, lastName: string, email: string) =>
    M.User.create({
      firstName, lastName, email, dni: USE_DEMO_DNI ? String(dni++) : null, username: `${email.split('@')[0]}-${SCHOOL_SLUG}`.slice(0, 40), password: hash,
      phone: null, biography: null, avatar: null, lastLogin: null,
    });

  // Rol GLOBAL de todas las cuentas escolares: "escuela" (solo lectura). Lo que cada uno puede hacer en el colegio
  // sale de su rol escolar (UserRole): Directivo / Docente / Familia / Estudiante. Ver constants/roles.ts.
  let studentAccounts = 0;
  const levels: LevelType[] = ['INICIAL', 'PRIMARIO', 'SECUNDARIO'];
  const school = await createSchool({ name: SCHOOL_NAME, slug: SCHOOL_SLUG, cue: null, levels, year: YEAR });
  const year = (await M.AcademicYear.findOne({ where: { schoolId: school.id } }))!;
  const lv = Object.fromEntries((await M.Level.findAll({ where: { schoolId: school.id } })).map((l) => [l.type, l])) as Record<LevelType, M.Level>;

  // --- Personal ---
  const staff: Array<[string, string, string, SchoolRole, LevelType | null]> = [
    ['Laura', 'Benítez', 'representante', 'REPRESENTANTE_LEGAL', null],
    ['Patricia', 'Suárez', 'directora', 'DIRECTOR', 'PRIMARIO'],
    ['Graciela', 'Molina', 'vicedirectora', 'VICEDIRECTOR', 'PRIMARIO'],
    ['Silvia', 'Castro', 'rectora', 'RECTOR', 'SECUNDARIO'],
    ['Andrea', 'Ríos', 'secretaria', 'SECRETARIO', null],
    ['Carla', 'Ortiz', 'preceptora', 'PRECEPTOR', 'SECUNDARIO'],
    ['Diego', 'Navarro', 'administracion', 'ADMINISTRACION', null],
  ];
  for (const [f, l, user, role, level] of staff) {
    const u = await mkUser(f, l, `${user}@${DOMAIN}`);
    await M.UserRole.create({ userId: u.id, schoolId: school.id, role, levelId: level ? lv[level].id : null, title: null });
  }

  // --- Divisiones y materias ---
  const plan: Record<LevelType, { divisions: Array<[string, number]>; subjects: string[] }> = {
    INICIAL: { divisions: [['Sala de 5 Azul', 0]], subjects: ['Sala'] },
    PRIMARIO: { divisions: [['4º A', 4], ['4º B', 4]], subjects: ['Prácticas del Lenguaje', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales', 'Inglés'] },
    SECUNDARIO: { divisions: [['2º 1ª', 2], ['5º 1ª', 5]], subjects: ['Lengua y Literatura', 'Matemática', 'Historia', 'Biología', 'Inglés', 'Educación Física'] },
  };

  const teachers: M.User[] = [];
  for (let i = 0; i < 8; i++) {
    const t = await mkUser(pick(FIRST, i + 3), pick(LAST, i + 5), `docente${i + 1}@${DOMAIN}`);
    await M.UserRole.create({ userId: t.id, schoolId: school.id, role: RoleCode.DOCENTE, levelId: null, title: null });
    teachers.push(t);
  }

  let s = 0;
  for (const type of levels) {
    const subjects = await Promise.all(plan[type].subjects.map((name) => M.Subject.create({ schoolId: school.id, levelId: lv[type].id, name, code: null, gradeYear: null })));
    const periods = await M.GradingPeriod.findAll({ where: { levelId: lv[type].id, academicYearId: year.id }, order: [['order', 'ASC']] });

    for (const [name, gradeYear] of plan[type].divisions) {
      const division = await M.Division.create({ schoolId: school.id, levelId: lv[type].id, academicYearId: year.id, name, gradeYear, section: null, shift: 'Mañana' });
      for (const [i, subject] of subjects.entries()) {
        await M.TeachingAssignment.create({ schoolId: school.id, divisionId: division.id, subjectId: subject.id, teacherId: teachers[(i + gradeYear) % teachers.length].id });
      }

      for (let k = 0; k < 6; k++, s++) {
        const lastName = pick(LAST, s);
        const student = await M.Student.create({ schoolId: school.id, firstName: pick(FIRST, s), lastName, dni: String(50_000_000 + s), birthDate: `${YEAR - 6 - gradeYear}-0${(s % 9) + 1}-15`, notes: null, photoUrl: null });
        await M.Enrollment.create({ studentId: student.id, divisionId: division.id, academicYearId: year.id });

        const parent = await mkUser(pick(['Mariana', 'Pablo', 'Lorena', 'Javier', 'Verónica', 'Gustavo'], s), lastName, `familia${s + 1}@${DOMAIN}`);
        await M.StudentGuardian.create({ studentId: student.id, userId: parent.id, relationship: s % 2 ? 'Padre' : 'Madre', isPrimary: true });
        await M.UserRole.create({ userId: parent.id, schoolId: school.id, role: RoleCode.TUTOR, levelId: null, title: null });

        // Secundario: el alumno tiene cuenta propia (ingresa con su DNI) para el chat con docentes y el canal del curso.
        if (type === 'SECUNDARIO') {
          studentAccounts++;
          const account = await M.User.create({
            firstName: student.firstName, lastName: student.lastName, email: `estudiante${studentAccounts}@${DOMAIN}`, dni: USE_DEMO_DNI ? student.dni : null,
            username: `estudiante${studentAccounts}-${SCHOOL_SLUG}`.slice(0, 40), password: hash, phone: null, biography: null, avatar: null, lastLogin: null,
          });
          await student.update({ userId: account.id });
          await M.UserRole.create({ userId: account.id, schoolId: school.id, role: RoleCode.ESTUDIANTE, levelId: null, title: null });
        }

        // Notas de los dos primeros períodos.
        for (const period of periods.slice(0, 2)) {
          for (const subject of subjects) {
            const seed = (s * 7 + subject.id * 3 + period.order) % 10;
            const settings = lv[type].settings;
            await M.Grade.create({
              schoolId: school.id, studentId: student.id, subjectId: subject.id, divisionId: division.id, periodId: period.id,
              numericValue: period.kind === 'NUMERIC' ? Math.max(3, Math.min(10, 4 + seed)) : null,
              conceptualValue: period.kind === 'CONCEPTUAL' ? settings.conceptualScale[seed % settings.conceptualScale.length] : null,
              narrative: period.kind === 'NARRATIVE' ? `${student.firstName} participa con entusiasmo de las propuestas y avanza en su autonomía.` : null,
              observation: null, updatedById: teachers[0].id,
            });
          }
        }

        // Asistencia de los últimos 15 días hábiles.
        const d = new Date();
        for (let day = 0, n = 0; n < 15; day++) {
          d.setDate(d.getDate() - (day ? 1 : 0));
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          n++;
          const absent = (s === 2 && n <= 4) || (s + n) % 11 === 0;
          const late = !absent && (s + n) % 7 === 0;
          const status = absent ? 'AUSENTE' : late ? 'TARDE' : 'PRESENTE';
          await M.Attendance.create({
            schoolId: school.id, studentId: student.id, divisionId: division.id, date: d.toISOString().slice(0, 10), status,
            value: status === 'PRESENTE' ? 0 : lv[type].settings.attendanceWeights[status], justified: false, note: null, recordedById: teachers[0].id,
          });
        }
      }
      // Publicaciones de ejemplo en el aula.
      await M.ClassroomPost.create({
        schoolId: school.id, divisionId: division.id, subjectId: subjects[0].id, authorId: teachers[gradeYear % teachers.length].id,
        kind: 'MATERIAL', title: `Bienvenidos a ${name}`, body: 'Acá vamos a compartir materiales, videos y tareas de la materia.',
        links: [{ url: 'https://www.educ.ar', title: 'Recursos de educ.ar' }], fileIds: [], dueDate: null, pinned: true,
      });
      await M.ClassroomPost.create({
        schoolId: school.id, divisionId: division.id, subjectId: subjects[subjects.length - 1].id, authorId: teachers[(gradeYear + 1) % teachers.length].id,
        kind: 'TAREA', title: 'Trabajo práctico Nº 1', body: 'Leer el capítulo 1 y responder las preguntas de la página 12.',
        links: [], fileIds: [], dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10), pinned: false,
      });
      // Boletín del primer período publicado.
      await M.ReportCardPublication.create({ schoolId: school.id, divisionId: division.id, periodId: periods[0].id, publishedById: teachers[0].id });
    }
  }

  // Superadmin de la plataforma (equipo Sentryx): consola de colegios y facturación de todos.
  if (WITH_SUPERADMIN) {
    const superadmin = await M.User.create({
      firstName: 'Equipo', lastName: 'Sentryx', email: `superadmin@${DOMAIN}`, dni: null, username: `superadmin-${SCHOOL_SLUG}`.slice(0, 40), password: hash,
      phone: null, biography: null, avatar: null, lastLogin: null,
    });
    await grantPlatformRole(superadmin.id, RoleCode.SUPERADMIN);
  }
  await evaluateAlerts(school.id);
  // Facturación: abre los períodos de acceso de todos los usuarios demo.
  await reconcileAccess(school.id);
  // Deja terminar las notificaciones que se envían en segundo plano.
  await new Promise((r) => setTimeout(r, 3000));

  // Un usuario de prueba por cada rol (para presentar a directivos).
  const oneUserPerRole: Array<[string, string, string]> = [
    ...(WITH_SUPERADMIN ? [['Superadmin (equipo Sentryx)', `superadmin@${DOMAIN}`, 'Consola: colegios, facturación global, reportes y auditoría']] as Array<[string, string, string]> : []),
    ['Representante Legal', `representante@${DOMAIN}`, 'Todo el colegio, incluida la facturación'],
    ['Dirección · Primario', `directora@${DOMAIN}`, 'Conducción de Primario'],
    ['Vicedirección · Primario', `vicedirectora@${DOMAIN}`, 'Acompaña a la conducción de Primario'],
    ['Rectoría · Secundario', `rectora@${DOMAIN}`, 'Conducción de Secundario'],
    ['Secretaría', `secretaria@${DOMAIN}`, 'Altas, legajos y comunicados de toda la institución'],
    ['Administración', `administracion@${DOMAIN}`, 'Altas de familias y comunicados (no ve notas)'],
    ['Preceptoría · Secundario', `preceptora@${DOMAIN}`, 'Asistencia, alertas y canales de Secundario'],
    ['Docente', `docente1@${DOMAIN}`, 'Sus materias: notas, aulas y mensajes'],
    ['Familia (Inicial)', `familia1@${DOMAIN}`, 'Con un hijo/a en Sala de 5'],
    ['Familia (Secundario)', `familia19@${DOMAIN}`, 'Con un hijo/a en 2º 1ª'],
    ['Estudiante (Secundario)', `estudiante1@${DOMAIN}`, 'Su curso: canales, aulas y mensajes con docentes'],
  ];
  console.log(`\n✅ Colegio "${SCHOOL_NAME}" creado (link de ingreso: ${env.FRONTEND_URL}/c/${SCHOOL_SLUG}).`);
  console.log(`   Contraseña de todos los usuarios: ${PASSWORD}\n`);
  console.log('   Un usuario por rol:');
  for (const [role, email, description] of oneUserPerRole) console.log(`   ${role.padEnd(28)} ${email.padEnd(36)} ${description}`);
  console.log(`\n   Además: docente1..8, familia1..${s} y estudiante1..${studentAccounts} @${DOMAIN}.`);
  await M.sequelize.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
