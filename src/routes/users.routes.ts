import { Router } from 'express';
import { authenticate, isManagerOrAbove } from '../middleware/auth';
import {
  listUsers,
  createUser,
  updateUser,
  resetCredentials,
  suspendUser,
  getUserById,
} from '../controllers/users.controller';

const router = Router();

router.use(authenticate, isManagerOrAbove);
router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUserById);
router.patch('/:id', updateUser);
router.post('/:id/reset-credentials', resetCredentials);
router.post('/:id/suspend', suspendUser);

export default router;
