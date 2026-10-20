import { Router } from 'express';
import * as SchoolController from '../controllers/school.controller';
import * as SchoolValidator from '../validators/school.validator';
import * as RolesController from '../controllers/roles.controller';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';
import { requireStaff } from '../middlewares/schoolSession';

const router = Router();
export const schoolsRouter = Router();

schoolsRouter.get('/schools', SchoolController.listMySchools);
router.get('/session', SchoolController.getSession);
router.get('/roles', requireStaff, SchoolController.getRoleCatalog);
router.post('/roles', authorize(Entity.ROLES, Action.MANAGE), validate(RolesController.createRole), RolesController.createCustomRole);
router.put('/roles/:code', authorize(Entity.ROLES, Action.MANAGE), validate(RolesController.updateRole), RolesController.updateCustomRole);
router.delete('/roles/:code', authorize(Entity.ROLES, Action.MANAGE), validate(RolesController.deleteRole), RolesController.deleteCustomRole);
router.get('/settings', authorize(Entity.SCHOOL, Action.UPDATE), SchoolController.getSettings);
router.patch('/settings', authorize(Entity.SCHOOL, Action.UPDATE), validate(SchoolValidator.updateSettings), SchoolController.updateSettings);

export default router;
