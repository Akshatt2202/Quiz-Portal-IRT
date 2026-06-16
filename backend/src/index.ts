import 'dotenv/config';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};
import express from 'express';
import cors from 'cors';
import { connectRedis } from './config/redis';
import authRoutes from './routes/auth';
import quizRoutes from './routes/quiz';
import adminRoutes from './routes/admin';
import { startTimerExpiryJob } from './jobs/timerExpiry.job';
import { startBufferFlushJob } from './jobs/bufferFlush.job';

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use('/api/auth', authRoutes);
app.use('/api', quizRoutes);
app.use('/api/admin', adminRoutes);

const start = async () => {
  try {
   await connectRedis();
  } catch (err) {
    console.warn('Redis unavailable, starting without Redis');
  }

  startTimerExpiryJob();
  startBufferFlushJob();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start().catch(console.error);
