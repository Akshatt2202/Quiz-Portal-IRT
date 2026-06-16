import cron from 'node-cron';
import prisma from '../config/db';
import redis from '../config/redis';
import { computeScore } from '../services/score.service';
import { flushRedisBuffer } from '../controllers/session.controller';

export const startTimerExpiryJob = () => {
  cron.schedule('*/10 * * * * *', async () => {
    try {
      const activeSessions = await prisma.session.findMany({ where: { status: 'active' }, include: { quiz: true } });
      for (const session of activeSessions) {
        const elapsedSeconds = Math.floor((Date.now() - session.started_at.getTime()) / 1000);
        const isExpired = elapsedSeconds >= session.quiz.duration_seconds + 30; // 30-sec grace period

        if (isExpired) {
          console.log(`Auto-submitting expired session: ${session.id}`);
          await flushRedisBuffer(session.id);
          const { score, totalMarks } = await computeScore(session.id, session.quiz_id);
          await prisma.session.update({ where: { id: session.id }, data: { status: 'expired', submitted_at: new Date(), score, total_marks: totalMarks } });
          await redis.del(`session:${session.id}:buffer`);
          await redis.del(`session:${session.id}:remaining`);
        }
      }
    } catch (err) { console.error('Timer expiry job error:', err); }
  });
  console.log('Timer expiry job started');
};
