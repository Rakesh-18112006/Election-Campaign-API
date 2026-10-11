import mongoose, { Schema, Document } from 'mongoose';

export type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';

export interface ICampaign extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  status: CampaignStatus;
  startDate?: Date;
  endDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['active', 'paused', 'completed', 'draft'], default: 'draft' },
    startDate: { type: Date },
    endDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CampaignSchema.index({ status: 1 });
CampaignSchema.index({ createdBy: 1 });

export const Campaign = mongoose.model<ICampaign>('Campaign', CampaignSchema);
