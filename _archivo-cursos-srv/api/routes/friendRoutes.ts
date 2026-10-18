import { Router } from 'express';
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getMyFriends,
  getFriendStatus,
  getReceivedRequests,
  getSentRequests,
} from '../controllers/friendController';
import { isAuth, checkPermission } from '../middlewares/auth';
import { Entity, Action } from '../models/enums';

const router = Router();
// La comunidad (amigos) es de los cursos SRV: las cuentas de familias y personal escolar no la usan.
router.use(isAuth, checkPermission(Entity.CHATS, Action.READ));

router.post('/requests/:userId', isAuth, sendFriendRequest);
router.post('/requests/:requestId/accept', isAuth, acceptFriendRequest);
router.post('/requests/:requestId/reject', isAuth, rejectFriendRequest);

router.get('/status/:userId', isAuth, getFriendStatus);
router.get('/', isAuth, getMyFriends);
router.get('/requests/received', isAuth, getReceivedRequests);
router.get('/requests/sent', isAuth, getSentRequests); // Opcional


export default router;
