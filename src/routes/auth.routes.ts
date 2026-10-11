import { Router } from 'express';
import { login, logout, refresh, changePassword, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts, try again later' },
});

router.post('/login', loginLimiter, login);
router.post('/logout', authenticate, logout);
router.post('/refresh', refresh);
router.post('/change-password', authenticate, changePassword);
router.get('/me', authenticate, getMe);

export default router;
