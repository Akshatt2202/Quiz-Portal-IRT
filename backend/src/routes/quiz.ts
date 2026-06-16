import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { listActiveQuizzes, startSession, getSessionStatus, submitSession, mySessionHistory } from '../controllers/session.controller';
import { batchEvents } from '../controllers/tracking.controller';

const router = Router();
router.use(authenticate);

router.get('/quizzes', listActiveQuizzes);
router.post('/sessions', startSession);
router.get('/sessions/:id/status', getSessionStatus);
router.post('/sessions/:id/submit', submitSession);
router.post('/sessions/:sessionId/events', batchEvents);
router.get('/my-sessions', mySessionHistory);

export default router;
