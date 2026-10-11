import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { RefreshToken } from '../models/RefreshToken';
import mongoose from 'mongoose';

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

export async function saveRefreshToken(userId: string, token: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await RefreshToken.create({ userId: new mongoose.Types.ObjectId(userId), token, expiresAt });
}

export async function revokeRefreshTokensForUser(userId: string): Promise<void> {
  await RefreshToken.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string };
}
