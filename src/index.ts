import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { connectDatabase } from './config/database';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import campaignsRoutes from './routes/campaigns.routes';
import areasRoutes from './routes/areas.routes';
import recordsRoutes from './routes/records.routes';
import dashboardRoutes from './routes/dashboard.routes';
import partiesRoutes from './routes/parties.routes';

const app = express();

app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (env.isDev) app.use(morgan('dev'));

// On Vercel (serverless), ensure DB is connected before each request
if (process.env.VERCEL) {
  app.use(async (_req, _res, next) => {
    try {
      await connectDatabase();
      next();
    } catch (err) {
      next(err);
    }
  });
}

app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, message: 'Election Campaign API is running', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/parties', partiesRoutes);
app.use('/api/v1/campaigns', campaignsRoutes);
app.use('/api/v1/areas', areasRoutes);
app.use('/api/v1/records', recordsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

if (!process.env.VERCEL) {
  connectDatabase().then(() => {
    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  });
}

export default app;
