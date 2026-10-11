import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'MAIN_ADMIN' | 'MAYOR' | 'SARPANCH' | 'WARD_SUPERVISOR' | 'WARD_MEMBER';
export type AccountStatus = 'active' | 'suspended' | 'pending';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  parentUserId?: mongoose.Types.ObjectId;
  assignedScopeIds: mongoose.Types.ObjectId[];
  mustChangePassword: boolean;
  createdBy?: mongoose.Types.ObjectId;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['MAIN_ADMIN', 'MAYOR', 'SARPANCH', 'WARD_SUPERVISOR', 'WARD_MEMBER'],
      required: true,
    },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
    parentUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedScopeIds: [{ type: Schema.Types.ObjectId, ref: 'GeographicArea' }],
    mustChangePassword: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });

UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

UserSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.passwordHash = undefined;
    return ret;
  },
});

export const User = mongoose.model<IUser>('User', UserSchema);
