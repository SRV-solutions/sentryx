import { Router } from 'express';
import * as Controller from '../controllers/absences.controller';
import * as Validator from '../validators/absences.validator';
import { validate } from '../lib/http';

const router = Router();

// Ausencias docentes: las ve quien tiene esos cursos; las registra el/la docente o preceptoría/conducción.
router.get('/teacher-absences', validate(Validator.listAbsences), Controller.listAbsences);
router.post('/teacher-absences', validate(Validator.createAbsence), Controller.createAbsence);
router.delete('/teacher-absences/:id', validate(Validator.deleteAbsence), Controller.deleteAbsence);
// Horario del curso para el aula (estudiantes, familias y personal).
router.get('/classrooms/:id/timetable', validate(Validator.classroomTimetable), Controller.classroomTimetable);

export default router;
