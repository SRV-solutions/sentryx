import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { resolveSchoolSession } from '../middlewares/schoolSession';
import { nonStaffWriteGuard } from '../middlewares/nonStaffWriteGuard';
import { userLimiter } from '../middlewares/rateLimits';
import { serveAvatar } from '../controllers/profile.controller';

import publicRoutes from './public.routes';
import usersRoutes from './users.routes';
import notificationsRoutes from './notifications.routes';
import platformRoutes from './platform.routes';
import pushRoutes from './push.routes';
import schoolRoutes, { schoolsRouter } from './school.routes';
import structureRoutes from './structure.routes';
import staffRoutes from './staff.routes';
import studentsRoutes from './students.routes';
import peopleRoutes from './people.routes';
import gradesRoutes from './grades.routes';
import attendanceRoutes from './attendance.routes';
import alertsRoutes from './alerts.routes';
import announcementsRoutes from './announcements.routes';
import statsRoutes from './stats.routes';
import threadsRoutes from './threads.routes';
import channelsRoutes from './channels.routes';
import classroomsRoutes from './classrooms.routes';
import filesRoutes from './files.routes';
import dashboardRoutes from './dashboard.routes';
import billingRoutes from './billing.routes';
import auditRoutes from './audit.routes';
import academicRoutes from './academic.routes';
import supportRoutes from './support.routes';
import plansRoutes from './plans.routes';
import staffRecordsRoutes from './staffRecords.routes';
import eventsRoutes from './events.routes';
import teachingRoutes from './teaching.routes';
import playRoutes from './play.routes';

/**
 * MAPA DE LA API
 *
 *   /avatars/:token     fotos de perfil (públicas, token imposible de adivinar)
 *   /public/*           datos públicos del colegio para la pantalla de ingreso
 *   /users/*            login, recupero de contraseña y perfil propio
 *   /notifications/*    campana de notificaciones
 *   /support/*          reportes de problemas (cualquier usuario con sesión)
 *   /platform/*         consola del equipo Sentryx (rol de plataforma SUPERADMIN)
 *   /play/*             partidas en vivo de los juegos (alumnos sin cuenta: PIN + apodo)
 *   /school/*           todo lo de un colegio: requiere sesión escolar (X-School-Id)
 */
export const apiRouter = Router();

apiRouter.get('/avatars/:token', serveAvatar);
apiRouter.use('/public', publicRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/notifications', authenticate, userLimiter, notificationsRoutes);
apiRouter.use('/support', authenticate, userLimiter, supportRoutes);
apiRouter.use('/platform', authenticate, userLimiter, platformRoutes);
apiRouter.use('/play', playRoutes);

// ---------------- /school ----------------
const school = Router();
school.use(authenticate, userLimiter);
school.use(pushRoutes); // no dependen del colegio activo
school.use(schoolsRouter); // GET /school/schools: colegios del usuario (para el selector)

// Desde acá todo requiere colegio activo con roles, permisos y alcance del usuario.
school.use(resolveSchoolSession);
// Regla estricta: familias y estudiantes solo escriben mensajes, confirmaciones y adjuntos propios.
school.use(nonStaffWriteGuard);
school.use(schoolRoutes);
school.use(structureRoutes);
school.use(academicRoutes); // antes de students: /students/transfer no debe tomarse como /students/:id
school.use(staffRoutes);
school.use(studentsRoutes);
school.use(peopleRoutes);
school.use('/grades', gradesRoutes);
school.use(statsRoutes);
school.use(attendanceRoutes);
school.use(alertsRoutes);
school.use(announcementsRoutes);
school.use(threadsRoutes);
school.use(channelsRoutes);
school.use(classroomsRoutes);
school.use(filesRoutes);
school.use(dashboardRoutes);
school.use(billingRoutes);
school.use(auditRoutes);
school.use(plansRoutes);
school.use(staffRecordsRoutes);
school.use(eventsRoutes);
school.use(teachingRoutes);

apiRouter.use('/school', school);
