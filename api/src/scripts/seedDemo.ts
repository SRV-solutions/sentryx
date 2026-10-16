/**
 * Datos de demostración (`npm run seed:demo`): una escuela con los tres niveles, personal con cada rol,
 * alumnos con sus familias, notas y asistencia. Solo para desarrollo.
 * Todos los usuarios demo usan la contraseña: demo1234
 */
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import * as M from '../models';
import { createSchool } from '../school/services/setup';
import { getSchoolGlobalRoleId } from '../school/services/users';
import { ensureBaseData, seedCourses } from '../utils/seedDataBase';
import { evaluateAlerts } from '../school/services/alerts';
import { SchoolRole, LevelType } from '../school/constants';

const PASSWORD = 'demo1234';
const YEAR = new Date().getFullYear();

const FIRST = ['Sofía', 'Mateo', 'Valentina', 'Santiago', 'Martina', 'Benjamín', 'Catalina', 'Joaquín', 'Emma', 'Thiago', 'Isabella', 'Lautaro', 'Mía', 'Felipe', 'Olivia', 'Bautista'];
const LAST = ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'García', 'Pérez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres'];
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

const run = async () => {
  if (env.isProd) throw new Error('seed:demo no se ejecuta en producción.');
  await M.sequelize.authenticate();
  await M.sequelize.sync();
  await ensureBaseData();
  await seedCourses();

  if (await M.School.findOne({ where: { slug: 'colegio-demo' } })) {
    console.log('La escuela demo ya existe. Para regenerarla, borrá la base de desarrollo.');
    return M.sequelize.close();
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const roleId = await getSchoolGlobalRoleId();
  let dni = 30_000_000;
  const mkUser = (firstName: string, lastName: string, email: string) =>
    M.User.create({
      firstName, lastName, email, dni: String(dni++), username: email.split('@')[0], password: hash, roleId,
      phone: null, biography: null, avatar: null, lastLogin: null,
    });

  const levels: LevelType[] = ['INICIAL', 'PRIMARIO', 'SECUNDARIO'];
  const school = await createSchool({ name: 'Colegio Demo SRV', slug: 'colegio-demo', cue: '0200000-00', levels, year: YEAR });
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
    const u = await mkUser(f, l, `${user}@demo.sentryx`);
    await M.Membership.create({ userId: u.id, schoolId: school.id, role, levelId: level ? lv[level].id : null, title: null });
  }

  // --- Divisiones y materias ---
  const plan: Record<LevelType, { divisions: Array<[string, number]>; subjects: string[] }> = {
    INICIAL: { divisions: [['Sala de 5 Azul', 0]], subjects: ['Sala'] },
    PRIMARIO: { divisions: [['4º A', 4], ['4º B', 4]], subjects: ['Prácticas del Lenguaje', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales', 'Inglés'] },
    SECUNDARIO: { divisions: [['2º 1ª', 2], ['5º 1ª', 5]], subjects: ['Lengua y Literatura', 'Matemática', 'Historia', 'Biología', 'Inglés', 'Educación Física'] },
  };

  const teachers: M.User[] = [];
  for (let i = 0; i < 8; i++) {
    const t = await mkUser(pick(FIRST, i + 3), pick(LAST, i + 5), `docente${i + 1}@demo.sentryx`);
    await M.Membership.create({ userId: t.id, schoolId: school.id, role: 'DOCENTE', levelId: null, title: null });
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

        const parent = await mkUser(pick(['Mariana', 'Pablo', 'Lorena', 'Javier', 'Verónica', 'Gustavo'], s), lastName, `familia${s + 1}@demo.sentryx`);
        await M.StudentGuardian.create({ studentId: student.id, userId: parent.id, relationship: s % 2 ? 'Padre' : 'Madre', isPrimary: true });
        await M.Membership.create({ userId: parent.id, schoolId: school.id, role: 'TUTOR', levelId: null, title: null });

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

  await evaluateAlerts(school.id);
  // Deja terminar las notificaciones que se envían en segundo plano.
  await new Promise((r) => setTimeout(r, 3000));
  console.log(`
✅ Escuela demo creada. Contraseña de todos los usuarios: ${PASSWORD}
   representante@demo.sentryx · directora@demo.sentryx · rectora@demo.sentryx · preceptora@demo.sentryx
   secretaria@demo.sentryx · administracion@demo.sentryx · docente1..8@demo.sentryx · familia1..${s}@demo.sentryx`);
  await M.sequelize.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
