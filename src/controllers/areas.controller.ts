import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { GeographicArea } from '../models/GeographicArea';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../utils/audit';

export async function listAreas(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { campaignId, parentAreaId, areaType } = req.query;
    const filter: Record<string, unknown> = {};

    if (campaignId) {
      if (!mongoose.Types.ObjectId.isValid(campaignId as string)) throw new AppError('Invalid campaign ID', 400);
      filter.campaignId = campaignId;
    }
    if (parentAreaId) filter.parentAreaId = parentAreaId;
    if (areaType) filter.areaType = areaType;

    if (req.user.role === 'WARD_MEMBER') {
      filter._id = { $in: req.user.assignedScopeIds };
    } else if (req.user.role !== 'MAIN_ADMIN') {
      const accessible = new Set([
        ...req.user.assignedScopeIds.map((id) => id.toString()),
      ]);
      if (accessible.size > 0) {
        filter._id = { $in: Array.from(accessible) };
      }
    }

    const areas = await GeographicArea.find(filter)
      .populate('campaignId', 'name')
      .populate('managerIds', 'name username role')
      .sort({ name: 1 });

    res.json({ success: true, areas });
  } catch (err) {
    next(err);
  }
}

export async function createArea(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { name, areaType, campaignId, parentAreaId, managerIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new AppError('Invalid campaign ID', 400);

    if (parentAreaId) {
      if (!mongoose.Types.ObjectId.isValid(parentAreaId)) throw new AppError('Invalid parent area ID', 400);
      const parent = await GeographicArea.findById(parentAreaId);
      if (!parent) throw new AppError('Parent area not found', 404);
      if (parent.campaignId.toString() !== campaignId) throw new AppError('Parent area belongs to different campaign', 400);
    }

    const area = await GeographicArea.create({
      name,
      areaType,
      campaignId,
      parentAreaId,
      managerIds: managerIds || [],
    });

    await logAudit(req.user._id, 'CREATE_AREA', 'GeographicArea', area._id, { name, campaignId });

    res.status(201).json({ success: true, area });
  } catch (err) {
    next(err);
  }
}

export async function updateArea(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid area ID', 400);

    const area = await GeographicArea.findById(id);
    if (!area) throw new AppError('Area not found', 404);

    const { name, areaType, status, managerIds } = req.body;
    if (name !== undefined) area.name = name;
    if (areaType !== undefined) area.areaType = areaType;
    if (status !== undefined) area.status = status;
    if (managerIds !== undefined) area.managerIds = managerIds;

    await area.save();
    await logAudit(req.user._id, 'UPDATE_AREA', 'GeographicArea', area._id);

    res.json({ success: true, area });
  } catch (err) {
    next(err);
  }
}

export async function getAreaById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid area ID', 400);

    const area = await GeographicArea.findById(id)
      .populate('campaignId', 'name')
      .populate('managerIds', 'name username role')
      .populate('parentAreaId', 'name areaType');

    if (!area) throw new AppError('Area not found', 404);

    res.json({ success: true, area });
  } catch (err) {
    next(err);
  }
}
