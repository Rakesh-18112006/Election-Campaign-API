import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, UserRole } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../utils/audit';
import { revokeRefreshTokensForUser } from '../utils/jwt';
import { ROLE_HIERARCHY } from '../utils/roles';

function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

export async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { role, status, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};

    if (req.user.role === 'MAIN_ADMIN') {
      filter.role = 'MAYOR';
    } else {
      filter.partyId = req.user.partyId;
    }
    if (role && req.user.role !== 'MAIN_ADMIN') filter.role = role;
    if (status) filter.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash')
        .populate('parentUserId', 'name username role')
        .skip(skip)
        .limit(parseInt(limit as string))
        .sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, users, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { name, username, password, role, assignedScopeIds } = req.body;

    if (req.user.role === 'MAIN_ADMIN') {
      throw new AppError('Main Admin must create users via the Parties page', 403);
    }

    if (!canManageRole(req.user.role, role)) {
      throw new AppError('Cannot create user with equal or higher privilege', 403);
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) throw new AppError('Username already exists', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      username: username.toLowerCase(),
      passwordHash,
      role,
      partyId: req.user.partyId,
      parentUserId: req.user._id,
      assignedScopeIds: assignedScopeIds || [],
      createdBy: req.user._id,
      mustChangePassword: true,
      status: 'active',
    });

    await logAudit(req.user._id, 'CREATE_USER', 'User', user._id, { role, username });

    res.status(201).json({ success: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params['id'] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user ID', 400);

    const target = await User.findById(id);
    if (!target) throw new AppError('User not found', 404);

    if (req.user.role !== 'MAIN_ADMIN' && target.partyId?.toString() !== req.user.partyId?.toString()) {
      throw new AppError('Access denied', 403);
    }

    const { name, assignedScopeIds } = req.body;
    if (name) target.name = name;
    if (assignedScopeIds) target.assignedScopeIds = assignedScopeIds;

    await target.save();
    await logAudit(req.user._id, 'UPDATE_USER', 'User', target._id);

    res.json({ success: true, user: target });
  } catch (err) {
    next(err);
  }
}

export async function resetCredentials(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params['id'] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user ID', 400);

    const target = await User.findById(id);
    if (!target) throw new AppError('User not found', 404);

    if (!canManageRole(req.user.role, target.role)) {
      throw new AppError('Cannot reset credentials for this user', 403);
    }

    if (req.user.role !== 'MAIN_ADMIN' && target.partyId?.toString() !== req.user.partyId?.toString()) {
      throw new AppError('Access denied', 403);
    }

    const { newPassword } = req.body;
    target.passwordHash = await bcrypt.hash(newPassword, 12);
    target.mustChangePassword = true;
    await target.save();

    await revokeRefreshTokensForUser(target._id.toString());
    await logAudit(req.user._id, 'RESET_CREDENTIALS', 'User', target._id);

    res.json({ success: true, message: 'Credentials reset successfully' });
  } catch (err) {
    next(err);
  }
}

export async function suspendUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params['id'] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user ID', 400);

    const target = await User.findById(id);
    if (!target) throw new AppError('User not found', 404);

    if (!canManageRole(req.user.role, target.role)) {
      throw new AppError('Cannot suspend this user', 403);
    }

    if (req.user.role !== 'MAIN_ADMIN' && target.partyId?.toString() !== req.user.partyId?.toString()) {
      throw new AppError('Access denied', 403);
    }

    const { action } = req.body;
    target.status = action === 'activate' ? 'active' : 'suspended';
    await target.save();

    if (target.status === 'suspended') {
      await revokeRefreshTokensForUser(target._id.toString());
    }

    await logAudit(req.user._id, action === 'activate' ? 'ACTIVATE_USER' : 'SUSPEND_USER', 'User', target._id);

    res.json({ success: true, user: target });
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params['id'] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user ID', 400);

    const user = await User.findById(id)
      .select('-passwordHash')
      .populate('parentUserId', 'name username role')
      .populate('assignedScopeIds', 'name areaType');

    if (!user) throw new AppError('User not found', 404);

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}
