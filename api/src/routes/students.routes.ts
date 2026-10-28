import { Router } from 'express';
import * as StudentsController from '../controllers/students.controller';
import * as StudentsValidator from '../validators/students.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { studentEmailLimiter } from '../middlewares/rateLimits';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/students', authorize(Entity.USERS, Action.READ), validate(StudentsValidator.listStudents), StudentsController.listStudents);
router.get('/students/:id', validate(StudentsValidator.getStudent), StudentsController.getStudent);
router.get('/students/:id/subjects', validate(StudentsValidator.getStudentSubjects), StudentsController.getStudentSubjects);
// Sin authorize a propósito: familia y estudiante también cargan el email (allowlist de nonStaffWriteGuard); el control está en el controlador.
router.put('/students/:id/email', studentEmailLimiter, validate(StudentsValidator.setStudentEmail), StudentsController.setStudentEmail);
router.post('/students', authorize(Entity.USERS, Action.CREATE), validate(StudentsValidator.createStudent), StudentsController.createStudent);
router.post('/students/import', authorize(Entity.USERS, Action.CREATE), validate(StudentsValidator.importStudents), StudentsController.importStudents);
router.patch('/students/:id', authorize(Entity.USERS, Action.UPDATE), validate(StudentsValidator.updateStudent), StudentsController.updateStudent);
router.post('/students/:id/guardians', authorize(Entity.USERS, Action.CREATE), validate(StudentsValidator.addGuardian), StudentsController.addGuardian);
router.patch('/guardians/:id', authorize(Entity.USERS, Action.UPDATE), validate(StudentsValidator.updateGuardianLink), StudentsController.updateGuardianLink);
router.delete('/guardians/:id', authorize(Entity.USERS, Action.UPDATE), validate(StudentsValidator.unlinkGuardian), StudentsController.unlinkGuardian);
router.post('/students/:id/account', authorize(Entity.USERS, Action.CREATE), validate(StudentsValidator.createAccount), StudentsController.createAccount);
router.post('/students/accounts', authorize(Entity.USERS, Action.CREATE), validate(StudentsValidator.createDivisionAccounts), StudentsController.createDivisionAccounts);
router.patch('/students/:id/account', authorize(Entity.USERS, Action.UPDATE), validate(StudentsValidator.setAccountStatus), StudentsController.setAccountStatus);
router.get('/my-children', StudentsController.listMyChildren);

export default router;
