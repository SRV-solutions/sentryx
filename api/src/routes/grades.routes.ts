import { Router } from 'express';
import * as GradesController from '../controllers/grades.controller';
import * as GradesValidator from '../validators/grades.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.get('/my-subjects', GradesController.listMySubjects);
router.get('/sheet', validate(GradesValidator.getGradeSheet), GradesController.getGradeSheet);
router.put('/sheet', authorize(Entity.GRADES, Action.UPDATE), validate(GradesValidator.saveGradeSheet), GradesController.saveGradeSheet);
router.get('/report-card/:id', validate(GradesValidator.getReportCard), GradesController.getReportCard);
router.get('/division-status/:id', authorize(Entity.GRADES, Action.READ), validate(GradesValidator.getDivisionStatus), GradesController.getDivisionStatus);
router.post('/publish', authorize(Entity.REPORT_CARDS, Action.PUBLISH), validate(GradesValidator.publishReportCards), GradesController.publishReportCards);
router.delete('/publish', authorize(Entity.REPORT_CARDS, Action.PUBLISH), validate(GradesValidator.unpublishReportCards), GradesController.unpublishReportCards);

export default router;
