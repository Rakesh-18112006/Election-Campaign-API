import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, IUser, UserRole } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUser;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.accessToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId);

    if (!user || user.status !== 'active') {
      res.status(401).json({ success: false, message: 'Account not active' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function isMainAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'MAIN_ADMIN') {
    res.status(403).json({ success: false, message: 'Main admin access required' });
    return;
  }
  next();
}

export function isManagerOrAbove(req: AuthRequest, res: Response, next: NextFunction): void {
  const managerRoles: UserRole[] = ['MAIN_ADMIN', 'MAYOR', 'SARPANCH', 'WARD_SUPERVISOR'];
  if (!req.user || !managerRoles.includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'Manager access required' });
    return;
  }
  next();
}
