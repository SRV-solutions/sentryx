import { Router } from 'express';
import * as FilesController from '../controllers/files.controller';
import * as FilesValidator from '../validators/files.validator';
import { validate } from '../lib/http';
import { authorize } from '../middlewares/authorize';
import { Entity, Action } from '../constants/permissions';

const router = Router();

router.post('/files/presign', validate(FilesValidator.createUploadUrl), FilesController.createUploadUrl);
router.post('/files/:id/confirm', validate(FilesValidator.confirmUploadedFile), FilesController.confirmUploadedFile);
router.get('/files', validate(FilesValidator.listFiles), FilesController.listFiles);
router.get('/files/usage', authorize(Entity.USERS, Action.UPDATE), FilesController.getStorageUsage);
router.get('/files/my-usage', FilesController.getMyStorageUsage);
router.get('/files/:id', validate(FilesValidator.getDownloadUrl), FilesController.getDownloadUrl);
router.delete('/files/:id', validate(FilesValidator.deleteFileById), FilesController.deleteFileById);

export default router;
