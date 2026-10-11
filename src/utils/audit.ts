import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog';

export async function logAudit(
  actorUserId: string | mongoose.Types.ObjectId,
  action: string,
  entityType: string,
  entityId?: string | mongoose.Types.ObjectId,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await AuditLog.create({
      actorUserId: new mongoose.Types.ObjectId(actorUserId.toString()),
      action,
      entityType,
      entityId: entityId ? new mongoose.Types.ObjectId(entityId.toString()) : undefined,
      relevantMetadata: metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
