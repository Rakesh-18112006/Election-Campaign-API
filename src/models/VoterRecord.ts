import mongoose, { Schema, Document } from 'mongoose';

export type RecordStatus = 'unassigned' | 'assigned' | 'visited' | 'not_visited';
export type VoterRelation = 'father' | 'husband' | 'mother' | 'self' | 'other';
export type VoterGender = 'male' | 'female' | 'other';

export interface IVoterRecord extends Document {
  _id: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  geographicAreaId: mongoose.Types.ObjectId;
  partyId?: mongoose.Types.ObjectId;
  name: string;
  voterIdRef?: string;
  houseNumber?: string;
  phone?: string;
  address?: string;
  // వార్డు.ఓ.జా.వ.సం. — ward / electoral-roll serial number, distinct from houseNumber.
  wardSerialNumber?: string;
  // సంబంధం — relation of fatherOrHusbandName to the voter. Real electoral
  // rolls also carry "తల్లి పేరు" (mother's name) entries alongside father/husband.
  relation?: VoterRelation;
  // తండ్రి పేరు / భర్త పేరు — father's/husband's (or mother's, per `relation`) name.
  fatherOrHusbandName?: string;
  // వయస్సు
  age?: number;
  // లింగము
  gender?: VoterGender;
  currentAssignmentId?: mongoose.Types.ObjectId;
  recordStatus: RecordStatus;
  visitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const VoterRecordSchema = new Schema<IVoterRecord>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    geographicAreaId: { type: Schema.Types.ObjectId, ref: 'GeographicArea', required: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party' },
    name: { type: String, required: true, trim: true },
    voterIdRef: { type: String, trim: true },
    houseNumber: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    wardSerialNumber: { type: String, trim: true },
    relation: { type: String, enum: ['father', 'husband', 'mother', 'self', 'other'] },
    fatherOrHusbandName: { type: String, trim: true },
    age: { type: Number, min: 0, max: 130 },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    currentAssignmentId: { type: Schema.Types.ObjectId, ref: 'RecordAssignment' },
    recordStatus: {
      type: String,
      enum: ['unassigned', 'assigned', 'visited', 'not_visited'],
      default: 'unassigned',
    },
    visitCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

VoterRecordSchema.index({ campaignId: 1 });
VoterRecordSchema.index({ geographicAreaId: 1 });
VoterRecordSchema.index({ recordStatus: 1 });
VoterRecordSchema.index({ partyId: 1 });
VoterRecordSchema.index({ campaignId: 1, geographicAreaId: 1 });

export const VoterRecord = mongoose.model<IVoterRecord>('VoterRecord', VoterRecordSchema);
