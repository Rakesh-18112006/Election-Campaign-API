import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { VoterRecord } from '../models/VoterRecord';
import { RecordAssignment } from '../models/RecordAssignment';
import { GeographicArea } from '../models/GeographicArea';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logAudit } from '../utils/audit';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export async function listRecords(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { campaignId, geographicAreaId, recordStatus, search, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};

    if (campaignId) filter.campaignId = campaignId;
    if (geographicAreaId) filter.geographicAreaId = geographicAreaId;
    if (recordStatus) filter.recordStatus = recordStatus;

    if (req.user.role === 'WARD_MEMBER') {
      const assignments = await RecordAssignment.find({
        assignedUserId: req.user._id,
        assignmentStatus: 'active',
      }).select('voterRecordId');
      const recordIds = assignments.map((a) => a.voterRecordId);
      filter._id = { $in: recordIds };
    } else if (req.user.role !== 'MAIN_ADMIN' && req.user.assignedScopeIds.length > 0) {
      filter.geographicAreaId = { $in: req.user.assignedScopeIds };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { voterIdRef: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [records, total] = await Promise.all([
      VoterRecord.find(filter)
        .populate('geographicAreaId', 'name areaType')
        .populate('currentAssignmentId')
        .skip(skip)
        .limit(parseInt(limit as string))
        .sort({ createdAt: -1 }),
      VoterRecord.countDocuments(filter),
    ]);

    res.json({ success: true, records, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    next(err);
  }
}

export async function getRecordById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid record ID', 400);

    const record = await VoterRecord.findById(id)
      .populate('geographicAreaId', 'name areaType')
      .populate('campaignId', 'name')
      .populate('currentAssignmentId');

    if (!record) throw new AppError('Record not found', 404);

    if (req.user.role === 'WARD_MEMBER') {
      const assignment = await RecordAssignment.findOne({
        voterRecordId: record._id,
        assignedUserId: req.user._id,
        assignmentStatus: 'active',
      });
      if (!assignment) throw new AppError('Access denied', 403);
    }

    res.json({ success: true, record });
  } catch (err) {
    next(err);
  }
}

export async function createRecord(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { campaignId, geographicAreaId, name, voterIdRef, houseNumber, phone, address } = req.body;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new AppError('Invalid campaign ID', 400);
    if (!mongoose.Types.ObjectId.isValid(geographicAreaId)) throw new AppError('Invalid area ID', 400);

    const record = await VoterRecord.create({
      campaignId,
      geographicAreaId,
      name,
      voterIdRef,
      houseNumber,
      phone,
      address,
    });

    await logAudit(req.user._id, 'CREATE_RECORD', 'VoterRecord', record._id);

    res.status(201).json({ success: true, record });
  } catch (err) {
    next(err);
  }
}

export async function importRecords(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { campaignId, geographicAreaId } = req.body;
    if (!req.file) throw new AppError('No file uploaded', 400);
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new AppError('Invalid campaign ID', 400);
    if (!mongoose.Types.ObjectId.isValid(geographicAreaId)) throw new AppError('Invalid area ID', 400);

    const area = await GeographicArea.findById(geographicAreaId);
    if (!area) throw new AppError('Geographic area not found', 404);

    let rows: Record<string, string>[] = [];
    const filename = req.file.originalname.toLowerCase();

    if (filename.endsWith('.csv')) {
      rows = parse(req.file.buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[];
    } else {
      throw new AppError('Only CSV and Excel files are supported', 400);
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const records = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row['name'] || row['Name'] || row['NAME'] || '').toString().trim();
      if (!name) {
        results.failed++;
        results.errors.push(`Row ${i + 2}: Name is required`);
        continue;
      }

      records.push({
        campaignId: new mongoose.Types.ObjectId(campaignId),
        geographicAreaId: new mongoose.Types.ObjectId(geographicAreaId),
        name,
        voterIdRef: (row['voter_id'] || row['voterIdRef'] || row['Voter ID'] || '').toString().trim() || undefined,
        houseNumber: (row['house_number'] || row['houseNumber'] || row['House Number'] || '').toString().trim() || undefined,
        phone: (row['phone'] || row['Phone'] || row['Mobile'] || '').toString().trim() || undefined,
        address: (row['address'] || row['Address'] || '').toString().trim() || undefined,
        recordStatus: 'unassigned' as const,
      });
      results.success++;
    }

    if (records.length > 0) {
      await VoterRecord.insertMany(records);
    }

    await logAudit(req.user._id, 'IMPORT_RECORDS', 'VoterRecord', undefined, {
      campaignId,
      geographicAreaId,
      total: rows.length,
      success: results.success,
      failed: results.failed,
    });

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
}

export async function assignRecord(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid record ID', 400);

    const { assignedUserId, reassignmentReason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) throw new AppError('Invalid user ID', 400);

    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const record = await VoterRecord.findById(id).session(session);
      if (!record) throw new AppError('Record not found', 404);

      const existingAssignment = await RecordAssignment.findOne({
        voterRecordId: record._id,
        assignmentStatus: 'active',
      }).session(session);

      if (existingAssignment) {
        existingAssignment.assignmentStatus = 'reassigned';
        existingAssignment.unassignedAt = new Date();
        existingAssignment.reassignmentReason = reassignmentReason;
        await existingAssignment.save({ session });
      }

      const assignment = await RecordAssignment.create(
        [
          {
            voterRecordId: record._id,
            assignedUserId,
            assignedBy: req.user._id,
            assignmentStatus: 'active',
            assignedAt: new Date(),
          },
        ],
        { session }
      );

      record.currentAssignmentId = assignment[0]._id;
      record.recordStatus = 'assigned';
      await record.save({ session });

      await session.commitTransaction();

      await logAudit(req.user._id, 'ASSIGN_RECORD', 'VoterRecord', record._id, { assignedUserId });

      res.status(201).json({ success: true, assignment: assignment[0] });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  } catch (err) {
    next(err);
  }
}

export async function bulkAssignRecords(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { geographicAreaId, assignedUserId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(geographicAreaId)) throw new AppError('Invalid area ID', 400);
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) throw new AppError('Invalid user ID', 400);

    const records = await VoterRecord.find({
      geographicAreaId,
      recordStatus: 'unassigned',
    });

    let assigned = 0;
    for (const record of records) {
      await RecordAssignment.create({
        voterRecordId: record._id,
        assignedUserId,
        assignedBy: req.user._id,
        assignmentStatus: 'active',
        assignedAt: new Date(),
      });
      record.recordStatus = 'assigned';
      await record.save();
      assigned++;
    }

    await logAudit(req.user._id, 'BULK_ASSIGN_RECORDS', 'VoterRecord', undefined, { geographicAreaId, assignedUserId, count: assigned });

    res.json({ success: true, assigned });
  } catch (err) {
    next(err);
  }
}
