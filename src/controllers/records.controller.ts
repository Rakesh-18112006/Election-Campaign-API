import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { VoterRecord, VoterRelation, VoterGender } from '../models/VoterRecord';
import { RecordAssignment } from '../models/RecordAssignment';
import { GeographicArea } from '../models/GeographicArea';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { User, IUser } from '../models/User';
import { logAudit } from '../utils/audit';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

// Managers may only write voters into areas of their own party and campaign, and a Divisional
// Incharge only into the areas assigned to them.
async function assertWritableArea(user: IUser, campaignId: string, areaId: string) {
  const area = await GeographicArea.findOne({ _id: areaId, partyId: user.partyId });
  if (!area) throw new AppError('Geographic area not found', 404);
  if (area.campaignId.toString() !== campaignId) {
    throw new AppError('The selected area does not belong to the selected campaign', 400);
  }
  if (user.role === 'DIVISIONAL_INCHARGE' && user.assignedScopeIds.length > 0) {
    const inScope = user.assignedScopeIds.some((id) => id.toString() === areaId);
    if (!inScope) throw new AppError('This area is outside your assigned scope', 403);
  }
  return area;
}

const clean = (v: unknown): string | undefined => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t || undefined;
};

export async function listRecords(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { campaignId, geographicAreaId, recordStatus, search, page = '1', limit = '20' } = req.query;
    const filter: Record<string, unknown> = {};

    if (campaignId) filter.campaignId = campaignId;
    if (geographicAreaId) filter.geographicAreaId = geographicAreaId;
    if (recordStatus) filter.recordStatus = recordStatus;

    if (req.user.role === 'MAIN_ADMIN') throw new AppError('Access denied', 403);

    if (req.user.role === 'WARD_MEMBER') {
      const assignments = await RecordAssignment.find({
        assignedUserId: req.user._id,
        assignmentStatus: 'active',
      }).select('voterRecordId');
      const recordIds = assignments.map((a) => a.voterRecordId);
      filter._id = { $in: recordIds };
    } else {
      filter.partyId = req.user.partyId;
      if (req.user.role === 'DIVISIONAL_INCHARGE' && req.user.assignedScopeIds.length > 0) {
        filter.geographicAreaId = { $in: req.user.assignedScopeIds };
      }
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

const VALID_RELATIONS = ['father', 'husband', 'mother', 'self', 'other'];
const VALID_GENDERS = ['male', 'female', 'other'];

// Normalizes a relation/gender cell to our internal enum. Accepts English
// labels and the exact Telugu values real electoral-roll exports use
// (verified against a real reconciled roll, 42_guntur.xlsx: సంబంధం cells
// read "తండ్రి పేరు" / "భర్త పేరు" / "తల్లి పేరు"; లింగము cells read "పు" / "స్త్రీ").
function normalizeRelation(raw: string): VoterRelation | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (v.includes('తండ్రి') || v === 'father') return 'father';
  if (v.includes('భర్త') || v === 'husband') return 'husband';
  if (v.includes('తల్లి') || v === 'mother') return 'mother';
  if (v.includes('స్వయం') || v === 'self') return 'self';
  return VALID_RELATIONS.includes(v) ? (v as VoterRelation) : 'other';
}

function normalizeGender(raw: string): VoterGender | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'పు' || v.includes('పురుష') || v === 'male' || v === 'm') return 'male';
  if (v === 'స్త్రీ' || v.includes('ఆడ') || v === 'female' || v === 'f') return 'female';
  return VALID_GENDERS.includes(v) ? (v as VoterGender) : 'other';
}

export async function createRecord(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { campaignId, geographicAreaId } = req.body;
    const name = clean(req.body.name);
    const voterIdRef = clean(req.body.voterIdRef);
    const relation = clean(req.body.relation);
    const gender = clean(req.body.gender);
    const ageRaw = req.body.age;
    const age = ageRaw !== undefined && ageRaw !== '' ? Number(ageRaw) : undefined;

    if (!name) throw new AppError('Name is required', 400);
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new AppError('Invalid campaign ID', 400);
    if (!mongoose.Types.ObjectId.isValid(geographicAreaId)) throw new AppError('Invalid area ID', 400);
    if (relation && !VALID_RELATIONS.includes(relation)) throw new AppError('Invalid relation', 400);
    if (gender && !VALID_GENDERS.includes(gender)) throw new AppError('Invalid gender', 400);
    if (age !== undefined && (Number.isNaN(age) || age < 0 || age > 130)) throw new AppError('Invalid age', 400);

    await assertWritableArea(req.user, campaignId, geographicAreaId);

    if (voterIdRef) {
      const duplicate = await VoterRecord.exists({ partyId: req.user.partyId, campaignId, voterIdRef });
      if (duplicate) throw new AppError('A voter with this Voter ID already exists in this campaign', 409);
    }

    const record = await VoterRecord.create({
      campaignId,
      geographicAreaId,
      partyId: req.user.partyId,
      name,
      voterIdRef,
      houseNumber: clean(req.body.houseNumber),
      phone: clean(req.body.phone),
      address: clean(req.body.address),
      wardSerialNumber: clean(req.body.wardSerialNumber),
      relation: relation as VoterRelation | undefined,
      fatherOrHusbandName: clean(req.body.fatherOrHusbandName),
      age,
      gender: gender as VoterGender | undefined,
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

    await assertWritableArea(req.user, campaignId, geographicAreaId);

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
      const name = (row['name'] || row['Name'] || row['NAME'] || row['Voter Name'] || '').toString().trim();
      if (!name) {
        results.failed++;
        results.errors.push(`Row ${i + 2}: Name is required`);
        continue;
      }

      const relationRaw = (row['relation'] || row['Relation'] || row['సంబంధం'] || '').toString();
      const genderRaw = (row['gender'] || row['Gender'] || row['లింగము'] || '').toString();
      const ageRaw = (row['age'] || row['Age'] || row['వయస్సు'] || '').toString().trim();

      records.push({
        campaignId: new mongoose.Types.ObjectId(campaignId),
        geographicAreaId: new mongoose.Types.ObjectId(geographicAreaId),
        partyId: req.user.partyId,
        name,
        voterIdRef:
          (row['voter_id'] || row['voterIdRef'] || row['Voter ID'] || row['ఓటరు ఐడి. కార్డు నెం.'] || '').toString().trim() ||
          undefined,
        houseNumber: (row['house_number'] || row['houseNumber'] || row['House Number'] || '').toString().trim() || undefined,
        phone: (row['phone'] || row['Phone'] || row['Mobile'] || '').toString().trim() || undefined,
        address: (row['address'] || row['Address'] || '').toString().trim() || undefined,
        wardSerialNumber:
          (row['ward_serial_number'] || row['wardSerialNumber'] || row['Ward Serial Number'] || row['వార్డు.ఓ.జా.వ.సం.'] || '')
            .toString()
            .trim() || undefined,
        relation: normalizeRelation(relationRaw),
        fatherOrHusbandName:
          (row['father_or_husband_name'] || row['fatherOrHusbandName'] || row['Father/Husband Name'] || row['తండ్రి పేరు / భర్త పేరు'] || '')
            .toString()
            .trim() || undefined,
        age: ageRaw && !Number.isNaN(Number(ageRaw)) ? Number(ageRaw) : undefined,
        gender: normalizeGender(genderRaw),
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

// Assigns currently-unassigned voter records in a geographic area (a
// "ward") to one Ward Member or Divisional Incharge in a single operation —
// this is how a Mayor/Corporator/Divisional Incharge hands a whole ward to
// the person who will walk it, instead of assigning voters one by one.
// An optional `count` randomly samples that many unassigned records instead
// of assigning the entire ward, so a large ward can be split into smaller
// random batches across several people (e.g. 100 at a time).
export async function bulkAssignRecords(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { geographicAreaId, assignedUserId, count } = req.body;
    if (!mongoose.Types.ObjectId.isValid(geographicAreaId)) throw new AppError('Invalid area ID', 400);
    if (!mongoose.Types.ObjectId.isValid(assignedUserId)) throw new AppError('Invalid user ID', 400);

    let sampleSize: number | undefined;
    if (count !== undefined && count !== null && count !== '') {
      sampleSize = Number(count);
      if (!Number.isInteger(sampleSize) || sampleSize <= 0) throw new AppError('Count must be a positive whole number', 400);
    }

    const area = await GeographicArea.findOne({ _id: geographicAreaId, partyId: req.user.partyId });
    if (!area) throw new AppError('Geographic area not found', 404);
    if (req.user.role === 'DIVISIONAL_INCHARGE' && req.user.assignedScopeIds.length > 0) {
      const inScope = req.user.assignedScopeIds.some((id) => id.toString() === geographicAreaId);
      if (!inScope) throw new AppError('This area is outside your assigned scope', 403);
    }

    const targetUser = await User.findOne({ _id: assignedUserId, partyId: req.user.partyId });
    if (!targetUser) throw new AppError('User not found', 404);
    if (!['WARD_MEMBER', 'DIVISIONAL_INCHARGE'].includes(targetUser.role)) {
      throw new AppError('Can only bulk-assign a ward to a Ward Member or Divisional Incharge', 400);
    }
    if (targetUser.status !== 'active') throw new AppError('Cannot assign to a suspended user', 400);

    const records = sampleSize
      ? await VoterRecord.aggregate([
          { $match: { geographicAreaId: new mongoose.Types.ObjectId(geographicAreaId), recordStatus: 'unassigned' } },
          { $sample: { size: sampleSize } },
          { $project: { _id: 1 } },
        ])
      : await VoterRecord.find({ geographicAreaId, recordStatus: 'unassigned' }).select('_id');

    if (records.length === 0) {
      res.json({ success: true, assigned: 0 });
      return;
    }

    const now = new Date();
    const createdAssignments = await RecordAssignment.insertMany(
      records.map((r) => ({
        voterRecordId: r._id,
        assignedUserId,
        assignedBy: req.user!._id,
        assignmentStatus: 'active' as const,
        assignedAt: now,
      }))
    );

    await VoterRecord.bulkWrite(
      records.map((r, i) => ({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { recordStatus: 'assigned', currentAssignmentId: createdAssignments[i]._id } },
        },
      }))
    );

    await logAudit(req.user._id, 'BULK_ASSIGN_RECORDS', 'VoterRecord', undefined, {
      geographicAreaId,
      assignedUserId,
      requestedSampleSize: sampleSize,
      count: records.length,
    });

    res.json({ success: true, assigned: records.length });
  } catch (err) {
    next(err);
  }
}
