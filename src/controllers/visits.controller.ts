import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { VoterRecord } from '../models/VoterRecord';
import { RecordAssignment } from '../models/RecordAssignment';
import { VisitEvent } from '../models/VisitEvent';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export async function submitVisit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid record ID', 400);

    const record = await VoterRecord.findById(id);
    if (!record) throw new AppError('Record not found', 404);

    if (req.user.role === 'WARD_MEMBER') {
      const assignment = await RecordAssignment.findOne({
        voterRecordId: record._id,
        assignedUserId: req.user._id,
        assignmentStatus: 'active',
      });
      if (!assignment) throw new AppError('Record not assigned to you', 403);
    }

    const { status, latitude, longitude, accuracyMeters, capturedAt, correctionReason } = req.body;

    if (!['visited', 'not_visited', 'correction'].includes(status)) {
      throw new AppError('Invalid visit status', 400);
    }

    if (status === 'visited') {
      if (latitude !== undefined || longitude !== undefined) {
        if (latitude < -90 || latitude > 90) throw new AppError('Invalid latitude', 400);
        if (longitude < -180 || longitude > 180) throw new AppError('Invalid longitude', 400);
      }
    }

    const previousStatus = record.recordStatus;

    const event = await VisitEvent.create({
      voterRecordId: record._id,
      campaignId: record.campaignId,
      actorUserId: req.user._id,
      previousStatus,
      newStatus: status,
      latitude: status === 'visited' ? latitude : undefined,
      longitude: status === 'visited' ? longitude : undefined,
      accuracyMeters: status === 'visited' ? accuracyMeters : undefined,
      capturedAt: capturedAt ? new Date(capturedAt) : undefined,
      receivedAt: new Date(),
      correctionReason,
    });

    if (status === 'visited') {
      record.recordStatus = 'visited';
      record.visitCount = (record.visitCount || 0) + 1;
      await record.save();
    } else if (status === 'not_visited') {
      record.recordStatus = 'not_visited';
      await record.save();
    }

    res.status(201).json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

export async function getVisitHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid record ID', 400);

    const record = await VoterRecord.findById(id);
    if (!record) throw new AppError('Record not found', 404);

    if (req.user.role === 'WARD_MEMBER') {
      const assignment = await RecordAssignment.findOne({
        voterRecordId: record._id,
        assignedUserId: req.user._id,
        assignmentStatus: 'active',
      });
      if (!assignment) throw new AppError('Access denied', 403);
    }

    const events = await VisitEvent.find({ voterRecordId: id })
      .populate('actorUserId', 'name username role')
      .sort({ receivedAt: -1 });

    res.json({ success: true, events });
  } catch (err) {
    next(err);
  }
}
