import cron from 'node-cron';
import prisma from '../config/db';
import { flushRedisBuffer } from '../controllers/session.controller';

export const startBufferFlushJob = () => {
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const activeSessions = await prisma.session.findMany({ where: { status: 'active' }, select: { id: true } });
      for (const s of activeSessions) {
        await flushRedisBuffer(s.id);
      }
    } catch (err) {
      console.error('Buffer flush job error:', err);
    }
  });
  console.log('Buffer flush job started');
};
