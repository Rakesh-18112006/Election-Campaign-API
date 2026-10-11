import mongoose, { Schema, Document } from 'mongoose';

export type AssignmentStatus = 'active' | 'unassigned' | 'reassigned';

export interface IRecordAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  voterRecordId: mongoose.Types.ObjectId;
  assignedUserId: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  assignmentStatus: AssignmentStatus;
  assignedAt: Date;
  unassignedAt?: Date;
  reassignmentReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RecordAssignmentSchema = new Schema<IRecordAssignment>(
  {
    voterRecordId: { type: Schema.Types.ObjectId, ref: 'VoterRecord', required: true },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignmentStatus: { type: String, enum: ['active', 'unassigned', 'reassigned'], default: 'active' },
    assignedAt: { type: Date, default: Date.now },
    unassignedAt: { type: Date },
    reassignmentReason: { type: String, trim: true },
  },
  { timestamps: true }
);

RecordAssignmentSchema.index({ voterRecordId: 1, assignmentStatus: 1 });
RecordAssignmentSchema.index({ assignedUserId: 1, assignmentStatus: 1 });
RecordAssignmentSchema.index({ assignedBy: 1 });

export const RecordAssignment = mongoose.model<IRecordAssignment>('RecordAssignment', RecordAssignmentSchema);
