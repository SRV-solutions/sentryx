import { Router } from 'express';
import * as DashboardController from '../controllers/dashboard.controller';

const router = Router();

router.get('/dashboard', DashboardController.getDashboard);

export default router;
