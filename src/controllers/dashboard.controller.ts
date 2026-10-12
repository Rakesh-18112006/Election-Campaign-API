import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Campaign } from '../models/Campaign';
import { VoterRecord } from '../models/VoterRecord';
import { User } from '../models/User';
import { Party } from '../models/Party';
import { RecordAssignment } from '../models/RecordAssignment';
import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export async function getOverview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    // MAIN_ADMIN sees party-level stats only
    if (req.user.role === 'MAIN_ADMIN') {
      const [totalParties, activeParties, totalMayors] = await Promise.all([
        Party.countDocuments(),
        Party.countDocuments({ status: 'active' }),
        User.countDocuments({ role: 'MAYOR' }),
      ]);
      res.json({
        success: true,
        stats: {
          parties: { total: totalParties, active: activeParties },
          mayors: { total: totalMayors },
          records: { total: 0, visited: 0, notVisited: 0, assigned: 0, unassigned: 0, completionRate: 0 },
          campaigns: { total: 0, active: 0 },
          users: { total: totalMayors, active: totalMayors, suspended: 0 },
          recentActivity: [],
        },
      });
      return;
    }

    const partyFilter = { partyId: req.user.partyId };
    const recordFilter: Record<string, unknown> = { partyId: req.user.partyId };

    if (req.user.role === 'WARD_MEMBER') {
      const assignments = await RecordAssignment.find({
        assignedUserId: req.user._id,
        assignmentStatus: 'active',
      }).select('voterRecordId');
      recordFilter._id = { $in: assignments.map((a) => a.voterRecordId) };
      delete recordFilter.partyId;
    } else if (req.user.role === 'DIVISIONAL_INCHARGE' && req.user.assignedScopeIds.length > 0) {
      recordFilter.geographicAreaId = { $in: req.user.assignedScopeIds };
    }

    const [
      totalCampaigns,
      activeCampaigns,
      totalRecords,
      visitedRecords,
      notVisitedRecords,
      assignedRecords,
      unassignedRecords,
      totalUsers,
      activeUsers,
      suspendedUsers,
      recentActivity,
    ] = await Promise.all([
      Campaign.countDocuments(partyFilter),
      Campaign.countDocuments({ ...partyFilter, status: 'active' }),
      VoterRecord.countDocuments(recordFilter),
      VoterRecord.countDocuments({ ...recordFilter, recordStatus: 'visited' }),
      VoterRecord.countDocuments({ ...recordFilter, recordStatus: 'not_visited' }),
      VoterRecord.countDocuments({ ...recordFilter, recordStatus: 'assigned' }),
      VoterRecord.countDocuments({ ...recordFilter, recordStatus: 'unassigned' }),
      User.countDocuments({ ...partyFilter, role: { $ne: 'MAIN_ADMIN' } }),
      User.countDocuments({ ...partyFilter, role: { $ne: 'MAIN_ADMIN' }, status: 'active' }),
      User.countDocuments({ ...partyFilter, role: { $ne: 'MAIN_ADMIN' }, status: 'suspended' }),
      AuditLog.find()
        .populate('actorUserId', 'name username')
        .sort({ timestamp: -1 })
        .limit(10),
    ]);

    const completionRate = totalRecords > 0 ? Math.round((visitedRecords / totalRecords) * 100) : 0;

    res.json({
      success: true,
      stats: {
        campaigns: { total: totalCampaigns, active: activeCampaigns },
        records: {
          total: totalRecords,
          visited: visitedRecords,
          notVisited: notVisitedRecords,
          assigned: assignedRecords,
          unassigned: unassignedRecords,
          completionRate,
        },
        users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers },
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid campaign ID', 400);

    const campaign = await Campaign.findById(id);
    if (!campaign) throw new AppError('Campaign not found', 404);

    const [totalRecords, byStatus] = await Promise.all([
      VoterRecord.countDocuments({ campaignId: id }),
      VoterRecord.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(id) } },
        { $group: { _id: '$recordStatus', count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((item) => { statusMap[item._id] = item.count; });

    const areaStats = await VoterRecord.aggregate([
      { $match: { campaignId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: '$geographicAreaId', total: { $sum: 1 }, visited: { $sum: { $cond: [{ $eq: ['$recordStatus', 'visited'] }, 1, 0] } } } },
      { $lookup: { from: 'geographicareas', localField: '_id', foreignField: '_id', as: 'area' } },
      { $unwind: '$area' },
      { $project: { areaName: '$area.name', areaType: '$area.areaType', total: 1, visited: 1 } },
    ]);

    res.json({
      success: true,
      campaign,
      stats: {
        total: totalRecords,
        byStatus: statusMap,
        byArea: areaStats,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getAreaStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid area ID', 400);

    const [total, visited, notVisited, assigned, unassigned] = await Promise.all([
      VoterRecord.countDocuments({ geographicAreaId: id }),
      VoterRecord.countDocuments({ geographicAreaId: id, recordStatus: 'visited' }),
      VoterRecord.countDocuments({ geographicAreaId: id, recordStatus: 'not_visited' }),
      VoterRecord.countDocuments({ geographicAreaId: id, recordStatus: 'assigned' }),
      VoterRecord.countDocuments({ geographicAreaId: id, recordStatus: 'unassigned' }),
    ]);

    const memberStats = await RecordAssignment.aggregate([
      { $match: { assignmentStatus: 'active' } },
      { $lookup: { from: 'voterrecords', localField: 'voterRecordId', foreignField: '_id', as: 'record' } },
      { $unwind: '$record' },
      { $match: { 'record.geographicAreaId': new mongoose.Types.ObjectId(id) } },
      { $group: { _id: '$assignedUserId', total: { $sum: 1 }, visited: { $sum: { $cond: [{ $eq: ['$record.recordStatus', 'visited'] }, 1, 0] } } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { userName: '$user.name', userUsername: '$user.username', total: 1, visited: 1 } },
    ]);

    res.json({
      success: true,
      stats: { total, visited, notVisited, assigned, unassigned, memberStats },
    });
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { page = '1', limit = '50', action, entityType } = req.query;
    const filter: Record<string, unknown> = {};
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorUserId', 'name username role')
        .skip(skip)
        .limit(parseInt(limit as string))
        .sort({ timestamp: -1 }),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, logs, total });
  } catch (err) {
    next(err);
  }
}
