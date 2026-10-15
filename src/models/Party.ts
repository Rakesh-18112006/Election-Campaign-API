import mongoose, { Schema, Document } from 'mongoose';
import { PARTY_TYPES, PartyType, PartyTheme } from '../config/partyThemes';

export interface IParty extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  partyType: PartyType;
  theme?: PartyTheme;
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
    partyType: { type: String, enum: PARTY_TYPES, default: 'OTHER' },
    theme: {
      primary: { type: String },
      dark: { type: String },
      tint: { type: String },
      accent: { type: String },
    },
    adminUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

export const Party = mongoose.model<IParty>('Party', PartySchema);
