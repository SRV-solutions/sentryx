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
import { isAuth } from '../middlewares/auth';

const router = Router();

router.post('/requests/:userId', isAuth, sendFriendRequest);
router.post('/requests/:requestId/accept', isAuth, acceptFriendRequest);
router.post('/requests/:requestId/reject', isAuth, rejectFriendRequest);

router.get('/status/:userId', isAuth, getFriendStatus);
router.get('/', isAuth, getMyFriends);
router.get('/requests/received', isAuth, getReceivedRequests);
router.get('/requests/sent', isAuth, getSentRequests); // Opcional


export default router;
