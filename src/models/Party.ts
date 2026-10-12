import mongoose, { Schema, Document } from 'mongoose';

export interface IParty extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  adminUserId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

const PartySchema = new Schema<IParty>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    adminUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

export const Party = mongoose.model<IParty>('Party', PartySchema);
