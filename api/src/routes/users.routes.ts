import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import * as ProfileController from '../controllers/profile.controller';
import * as AuthValidator from '../validators/auth.validator';
import * as ProfileValidator from '../validators/profile.validator';
import * as SessionsController from '../controllers/sessions.controller';
import { authenticate } from '../middlewares/authenticate';
import { loginLimiter, passwordResetLimiter } from '../middlewares/rateLimits';
import { validate } from '../lib/http';

/** Cuenta propia. No hay registro abierto: las cuentas las crea cada colegio o el equipo de Sentryx. */
const router = Router();

// Públicas (con límite de intentos)
router.post('/login', loginLimiter, validate(AuthValidator.login), AuthController.login);
router.post('/request-password-reset', passwordResetLimiter, validate(AuthValidator.requestPasswordReset), AuthController.requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, validate(AuthValidator.resetPassword), AuthController.resetPassword);
// Entrar en el celular escaneando el QR de una sesión abierta (link de un solo uso).
router.post('/login-link/redeem', loginLimiter, validate(SessionsController.redeemLoginLinkBody), SessionsController.redeemLoginLink);

// Perfil propio
router.get('/me/tutorials', authenticate, ProfileController.getMyTutorials);
router.put('/me/tutorials', authenticate, validate(ProfileValidator.setMyTutorials), ProfileController.setMyTutorials);
router.get('/me', authenticate, ProfileController.getMyProfile);
router.patch('/me', authenticate, validate(ProfileValidator.updateMyProfile), ProfileController.updateMyProfile);
router.put('/change-password', authenticate, validate(ProfileValidator.changeMyPassword), ProfileController.changeMyPassword);
router.put('/me/avatar', authenticate, validate(ProfileValidator.setMyAvatar), ProfileController.setMyAvatar);
router.delete('/me/avatar', authenticate, ProfileController.deleteMyAvatar);

// Sesiones y dispositivos
router.get('/sessions', authenticate, SessionsController.listMySessions);
router.post('/sessions/logout-others', authenticate, SessionsController.logoutOthers);
router.delete('/sessions/:id', authenticate, validate(SessionsController.sessionParam), SessionsController.revokeOne);
router.post('/logout', authenticate, SessionsController.logout);
router.post('/login-link', authenticate, SessionsController.createLoginLink);

export default router;
