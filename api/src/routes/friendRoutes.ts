import { Router } from 'express';
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getMyFriends,
  searchUsers,
} from '../controllers/friendController';
import { isAuth } from '../middlewares/auth';

const router = Router();

router.post('/friend-request/:userId', isAuth, sendFriendRequest);
router.post('/friend-request/:requestId/accept', isAuth, acceptFriendRequest);
router.post('/friend-request/:requestId/reject', isAuth, rejectFriendRequest);
router.get('/', isAuth, getMyFriends);
router.get('/search-users', isAuth, searchUsers);

export default router;
