import mongoose, { Schema, Document } from 'mongoose';

export type VisitStatus = 'visited' | 'not_visited' | 'correction';
// person: the ward member spoke with the voter directly.
// family: the voter was unavailable, so a family member was spoken to on
// their behalf (relaying the household's likely voting intention).
export type VisitType = 'person' | 'family';

export interface IVisitEvent extends Document {
  _id: mongoose.Types.ObjectId;
  voterRecordId: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  actorUserId: mongoose.Types.ObjectId;
  previousStatus: string;
  newStatus: VisitStatus;
  visitType?: VisitType;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  capturedAt?: Date;
  receivedAt: Date;
  correctionReason?: string;
  createdAt: Date;
}

const VisitEventSchema = new Schema<IVisitEvent>(
  {
    voterRecordId: { type: Schema.Types.ObjectId, ref: 'VoterRecord', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, enum: ['visited', 'not_visited', 'correction'], required: true },
    visitType: { type: String, enum: ['person', 'family'] },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    accuracyMeters: { type: Number },
    capturedAt: { type: Date },
    receivedAt: { type: Date, default: Date.now },
    correctionReason: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VisitEventSchema.index({ voterRecordId: 1 });
VisitEventSchema.index({ campaignId: 1 });
VisitEventSchema.index({ actorUserId: 1 });
VisitEventSchema.index({ receivedAt: -1 });

export const VisitEvent = mongoose.model<IVisitEvent>('VisitEvent', VisitEventSchema);
