import { Response } from 'express';
import prisma from '../config/db';
import redis from '../config/redis';

interface TrackingEvent {
  question_id: string;
  event_type: 'focus' | 'blur' | 'answer_changed' | 'revisit' | 'submitted';
  payload: { answer?: string; added_time_ms?: number; visit_count?: number; change_count?: number; marked_for_review?: boolean; };
  client_ts: number;
}

export const batchEvents = async (req: any, res: Response) => {
  try {
    const { events } = req.body as { events: TrackingEvent[] };
    const sessionId: string = req.params.sessionId;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, student_id: req.user.id },
      include: { quiz: true }
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'expired' || session.status === 'submitted') {
      return res.status(400).json({ error: 'Quiz time has expired', remainingSeconds: 0 });
    }
    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is no longer active', remainingSeconds: 0 });
    }

    const elapsedSeconds = Math.floor((Date.now() - session.started_at.getTime()) / 1000);
    let remainingSecs = Math.max(0, session.quiz.duration_seconds - elapsedSeconds);

    if (remainingSecs <= 0) return res.status(400).json({ error: 'Quiz time has expired', remainingSeconds: 0 });

    const bufferKey = `session:${sessionId}:buffer`;
    const dbEvents: any[] = [];

    for (const event of events) {
      dbEvents.push({ session_id: sessionId, question_id: event.question_id, event_type: event.event_type, payload: event.payload });

      if (event.event_type === 'answer_changed' || event.event_type === 'blur') {
        const currentRaw = await redis.hGet(bufferKey, event.question_id);
        const current = currentRaw ? JSON.parse(currentRaw as string) : { answer: null, changeCount: 0, timeSpentMs: 0, markedForReview: false };

        if (event.event_type === 'answer_changed' && event.payload.answer !== undefined) {
          current.answer = event.payload.answer;
          current.changeCount += 1;
        }
        if (event.payload.added_time_ms) current.timeSpentMs += event.payload.added_time_ms;
        if (event.payload.marked_for_review !== undefined) current.markedForReview = event.payload.marked_for_review;

        await redis.hSet(bufferKey, event.question_id, JSON.stringify(current));
        await redis.expire(bufferKey, remainingSecs + 300);
      }
    }

    if (dbEvents.length > 0) await prisma.questionEvent.createMany({ data: dbEvents });

    res.json({ status: 'ok', remaining_seconds: remainingSecs });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};
