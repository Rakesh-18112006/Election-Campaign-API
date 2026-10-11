import mongoose from 'mongoose';
import { env } from './env';

// Cache connection across serverless invocations
let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected && mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isConnected = true;
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    if (!process.env.VERCEL) process.exit(1);
    throw err;
  }
}
