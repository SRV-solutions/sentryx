import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import * as ProfileController from '../controllers/profile.controller';
import * as AuthValidator from '../validators/auth.validator';
import * as ProfileValidator from '../validators/profile.validator';
import { authenticate } from '../middlewares/authenticate';
import { loginLimiter, passwordResetLimiter } from '../middlewares/rateLimits';
import { validate } from '../lib/http';

/** Cuenta propia. No hay registro abierto: las cuentas las crea cada colegio o el equipo de Sentryx. */
const router = Router();

// Públicas (con límite de intentos)
router.post('/login', loginLimiter, validate(AuthValidator.login), AuthController.login);
router.post('/request-password-reset', passwordResetLimiter, validate(AuthValidator.requestPasswordReset), AuthController.requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, validate(AuthValidator.resetPassword), AuthController.resetPassword);

// Perfil propio
router.get('/me', authenticate, ProfileController.getMyProfile);
router.patch('/me', authenticate, validate(ProfileValidator.updateMyProfile), ProfileController.updateMyProfile);
router.put('/change-password', authenticate, validate(ProfileValidator.changeMyPassword), ProfileController.changeMyPassword);
router.put('/me/avatar', authenticate, validate(ProfileValidator.setMyAvatar), ProfileController.setMyAvatar);
router.delete('/me/avatar', authenticate, ProfileController.deleteMyAvatar);

export default router;
