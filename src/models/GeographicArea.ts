import mongoose, { Schema, Document } from 'mongoose';

export type AreaType = 'district' | 'ward' | 'village' | 'street' | 'other';
export type AreaStatus = 'active' | 'inactive';

export interface IGeographicArea extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  areaType: AreaType;
  campaignId: mongoose.Types.ObjectId;
  parentAreaId?: mongoose.Types.ObjectId;
  managerIds: mongoose.Types.ObjectId[];
  status: AreaStatus;
  createdAt: Date;
  updatedAt: Date;
}

const GeographicAreaSchema = new Schema<IGeographicArea>(
  {
    name: { type: String, required: true, trim: true },
    areaType: { type: String, enum: ['district', 'ward', 'village', 'street', 'other'], required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    parentAreaId: { type: Schema.Types.ObjectId, ref: 'GeographicArea' },
    managerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

GeographicAreaSchema.index({ campaignId: 1 });
GeographicAreaSchema.index({ parentAreaId: 1 });
GeographicAreaSchema.index({ managerIds: 1 });

export const GeographicArea = mongoose.model<IGeographicArea>('GeographicArea', GeographicAreaSchema);
