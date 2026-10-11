import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Campaign } from '../models/Campaign';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../utils/audit';

export async function listCampaigns(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { status, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [campaigns, total] = await Promise.all([
      Campaign.find(filter)
        .populate('createdBy', 'name username')
        .skip(skip)
        .limit(parseInt(limit as string))
        .sort({ createdAt: -1 }),
      Campaign.countDocuments(filter),
    ]);

    res.json({ success: true, campaigns, total });
  } catch (err) {
    next(err);
  }
}

export async function createCampaign(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { name, description, status, startDate, endDate } = req.body;
    const campaign = await Campaign.create({
      name,
      description,
      status: status || 'draft',
      startDate,
      endDate,
      createdBy: req.user._id,
    });

    await logAudit(req.user._id, 'CREATE_CAMPAIGN', 'Campaign', campaign._id, { name });

    res.status(201).json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
}

export async function updateCampaign(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid campaign ID', 400);

    const campaign = await Campaign.findById(id);
    if (!campaign) throw new AppError('Campaign not found', 404);

    const { name, description, status, startDate, endDate } = req.body;
    if (name !== undefined) campaign.name = name;
    if (description !== undefined) campaign.description = description;
    if (status !== undefined) campaign.status = status;
    if (startDate !== undefined) campaign.startDate = startDate;
    if (endDate !== undefined) campaign.endDate = endDate;

    await campaign.save();
    await logAudit(req.user._id, 'UPDATE_CAMPAIGN', 'Campaign', campaign._id);

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid campaign ID', 400);

    const campaign = await Campaign.findById(id).populate('createdBy', 'name username');
    if (!campaign) throw new AppError('Campaign not found', 404);

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
}
