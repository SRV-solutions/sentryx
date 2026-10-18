import { Router } from 'express';
import * as BillingController from '../controllers/billing.controller';
import * as BillingValidator from '../validators/billing.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/billing', authorize(Entity.BILLING, Action.READ), validate(BillingValidator.getSchoolBilling), BillingController.getSchoolBilling);

export default router;
