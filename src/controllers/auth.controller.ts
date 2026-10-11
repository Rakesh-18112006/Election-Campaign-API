import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  verifyRefreshToken,
  revokeRefreshTokensForUser,
} from '../utils/jwt';
import { logAudit } from '../utils/audit';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

// Cross-domain (prod): sameSite=none+secure so browser sends cookie to API subdomain.
// Local dev: sameSite=lax is fine (same origin via Vite proxy).
const COOKIE_OPTS = {
  httpOnly: true,
  secure: !env.isDev,
  sameSite: (env.isDev ? 'lax' : 'none') as 'lax' | 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ success: false, message: 'Account is suspended' });
      return;
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());
    await saveRefreshToken(user._id.toString(), refreshToken);

    user.lastLoginAt = new Date();
    await user.save();

    await logAudit(user._id, 'LOGIN', 'User', user._id);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    res.json({
      success: true,
      accessToken,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        assignedScopeIds: user.assignedScopeIds,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      await revokeRefreshTokensForUser(req.user._id.toString());
      await logAudit(req.user._id, 'LOGOUT', 'User', req.user._id);
    }
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token' });
      return;
    }

    const decoded = verifyRefreshToken(token);
    const stored = await RefreshToken.findOne({ token, userId: decoded.userId });
    if (!stored || stored.expiresAt < new Date()) {
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
      return;
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active') {
      res.status(401).json({ success: false, message: 'Account not active' });
      return;
    }

    await stored.deleteOne();
    const newAccessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString());
    await saveRefreshToken(user._id.toString(), newRefreshToken);

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTS);
    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) throw new AppError('User not found', 404);

    if (!req.user.mustChangePassword) {
      if (!(await user.comparePassword(currentPassword))) {
        res.status(400).json({ success: false, message: 'Current password is incorrect' });
        return;
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    await user.save();

    await revokeRefreshTokensForUser(user._id.toString());
    res.clearCookie('refreshToken');

    await logAudit(user._id, 'PASSWORD_CHANGE', 'User', user._id);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);
    res.json({ success: true, user: req.user });
  } catch (err) {
    next(err);
  }
}
