import mongoose, { Schema, Document } from 'mongoose';

export type RecordStatus = 'unassigned' | 'assigned' | 'visited' | 'not_visited';

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
