import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Party } from '../models/Party';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../utils/audit';
import {
  PARTY_TYPES, PARTY_THEMES, PARTY_LABELS, HEX_COLOR, buildCustomTheme, PartyType, PartyTheme,
} from '../config/partyThemes';

const DEFAULT_CUSTOM_COLOR = '#1D4ED8';

export async function listParties(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [parties, total] = await Promise.all([
      Party.find()
        .populate('adminUserId', 'name username role status')
        .populate('createdBy', 'name username')
        .skip(skip)
        .limit(parseInt(limit as string))
        .sort({ createdAt: -1 }),
      Party.countDocuments(),
    ]);

    res.json({ success: true, parties, total });
  } catch (err) {
    next(err);
  }
}

export async function createParty(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { partyType = 'OTHER', partyDescription, primaryColor, mayorName, mayorUsername, mayorPassword } = req.body;

    if (!PARTY_TYPES.includes(partyType)) throw new AppError('Invalid party type', 400);

    let partyName: string;
    let theme: PartyTheme;
    if (partyType === 'OTHER') {
      partyName = String(req.body.partyName ?? '').trim();
      if (!partyName) throw new AppError('Party name is required for other parties', 400);
      if (primaryColor !== undefined && !HEX_COLOR.test(primaryColor)) {
        throw new AppError('Primary colour must be a hex value like #1D4ED8', 400);
      }
      theme = buildCustomTheme(primaryColor ?? DEFAULT_CUSTOM_COLOR);
    } else {
      partyName = PARTY_LABELS[partyType as Exclude<PartyType, 'OTHER'>];
      theme = PARTY_THEMES[partyType as Exclude<PartyType, 'OTHER'>];
    }

    if (!mayorName || !mayorUsername || !mayorPassword) {
      throw new AppError('Mayor name, username and password are required', 400);
    }

    const existing = await User.findOne({ username: mayorUsername.toLowerCase() });
    if (existing) throw new AppError('Username already taken', 409);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const [party] = await Party.create([{ name: partyName, description: partyDescription, partyType, theme, createdBy: req.user._id }], { session });

      const passwordHash = await bcrypt.hash(mayorPassword, 12);
      const [mayor] = await User.create([{
        name: mayorName,
        username: mayorUsername.toLowerCase(),
        passwordHash,
        role: 'MAYOR',
        status: 'active',
        partyId: party._id,
        parentUserId: req.user._id,
        createdBy: req.user._id,
        mustChangePassword: false,
      }], { session });

      party.adminUserId = mayor._id;
      await party.save({ session });

      await session.commitTransaction();

      await logAudit(req.user._id, 'CREATE_PARTY', 'Party', party._id, { partyName, partyType, mayorUsername });

      res.status(201).json({ success: true, party: await Party.findById(party._id).populate('adminUserId', 'name username role') });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    next(err);
  }
}

export async function getPartyById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params['id'] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid party ID', 400);

    const party = await Party.findById(id)
      .populate('adminUserId', 'name username role status')
      .populate('createdBy', 'name username');

    if (!party) throw new AppError('Party not found', 404);

    const memberCount = await User.countDocuments({ partyId: id });

    res.json({ success: true, party, memberCount });
  } catch (err) {
    next(err);
  }
}

export async function togglePartyStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params['id'] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid party ID', 400);

    const party = await Party.findById(id);
    if (!party) throw new AppError('Party not found', 404);

    party.status = party.status === 'active' ? 'suspended' : 'active';
    await party.save();

    await logAudit(req.user._id, party.status === 'active' ? 'ACTIVATE_PARTY' : 'SUSPEND_PARTY', 'Party', party._id);

    res.json({ success: true, party });
  } catch (err) {
    next(err);
  }
}
