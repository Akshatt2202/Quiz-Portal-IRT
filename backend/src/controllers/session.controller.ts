import { Response } from 'express';
import prisma from '../config/db';
import redis from '../config/redis';
import { computeScore } from '../services/score.service';
import { KnowledgeService } from '../services/knowledge.service';

export const listActiveQuizzes = async (_req: any, res: Response) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { status: 'active' },
      include: { _count: { select: { questions: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(quizzes);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const startSession = async (req: any, res: Response) => {
  try {
    const { quizId } = req.body;
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: { orderBy: { order_index: 'asc' } } } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.status !== 'active') return res.status(400).json({ error: 'Quiz is not active' });

    const existing = await prisma.session.findFirst({ where: { student_id: req.user.id, quiz_id: quizId, status: 'active' } });

    // Normalize Prisma question fields into the shape the student client expects.
    const processQuestions = (qs: any[]) => {
      return qs.map(({ correct_answer: _ca, ...q }) => {
        let options = q.options;
        if (!options && q.option_a) {
          options = [
            { id: 'A', text: q.option_a },
            { id: 'B', text: q.option_b },
            { id: 'C', text: q.option_c },
            { id: 'D', text: q.option_d },
          ].filter(o => o.text);
        }

        return {
          id: q.question_id,
          text: q.stem,
          options,
          marks: q.marks,
          orderIndex: q.order_index ?? 0,
        };
      });
    };

    if (existing) {
      const elapsedSeconds = Math.floor((Date.now() - existing.started_at.getTime()) / 1000);
      const remainingSecs = Math.max(0, quiz.duration_seconds - elapsedSeconds);
      const questions = quiz.shuffle_questions ? shuffle(quiz.questions) : quiz.questions;
      return res.json({ session: existing, questions: processQuestions(questions), remaining_seconds: remainingSecs });
    }

    const session = await prisma.session.create({ data: { student_id: req.user.id, quiz_id: quizId, ip_address: req.ip } });

    const questions = quiz.shuffle_questions ? shuffle(quiz.questions) : quiz.questions;
    res.status(201).json({ session, questions: processQuestions(questions), remaining_seconds: quiz.duration_seconds });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

export const getSessionStatus = async (req: any, res: Response) => {
  try {
    const session = await prisma.session.findFirst({ where: { id: req.params.id, student_id: req.user.id }, include: { quiz: true } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const elapsedSeconds = Math.floor((Date.now() - session.started_at.getTime()) / 1000);
    const remainingSecs = Math.max(0, session.quiz.duration_seconds - elapsedSeconds);
    res.json({ status: session.status, remaining_seconds: remainingSecs, submitted_at: session.submitted_at });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const submitSession = async (req: any, res: Response) => {
  try {
    const session = await prisma.session.findFirst({ where: { id: req.params.id, student_id: req.user.id } });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status !== 'active') {
      return res.json({ message: 'Quiz already submitted', score: session.score, totalMarks: session.total_marks, session });
    }

    await flushRedisBuffer(session.id);
    const { score, totalMarks } = await computeScore(session.id, session.quiz_id);
    const updated = await prisma.session.update({ where: { id: session.id }, data: { status: 'submitted', submitted_at: new Date(), score, total_marks: totalMarks } });

    const firstQ = await prisma.question.findFirst({ where: { quiz_id: session.quiz_id } });
    if (firstQ) await prisma.questionEvent.create({ data: { session_id: session.id, question_id: firstQ.question_id, event_type: 'submitted', payload: { score, totalMarks } } });

    await redis.del(`session:${session.id}:buffer`);

    // --- Update Student Knowledge Graph (BKT) ---
    // Fetch all answers for this session, plus the student's theta and each
    // question's IRT params, so probable guesses get down-weighted.
    const profile = await prisma.studentProfile.findUnique({
      where: { user_id: session.student_id },
      select: { theta: true },
    });
    const studentTheta = profile?.theta ?? null;

    const sessionAnswers = await prisma.sessionAnswer.findMany({
      where: { session_id: session.id },
      select: {
        concept_id: true,
        is_correct: true,
        time_spent_ms: true,
        question: { select: { irt_difficulty: true, irt_discrimination: true } },
      },
    });

    for (const ans of sessionAnswers) {
      if (ans.concept_id && ans.is_correct !== null) {
        await KnowledgeService.updateMastery(session.student_id, ans.concept_id, ans.is_correct, {
          responseTimeMs: Number(ans.time_spent_ms),
          theta: studentTheta,
          difficulty: ans.question?.irt_difficulty ?? null,
          discrimination: ans.question?.irt_discrimination ?? null,
        });
      }
    }

    res.json({ message: 'Quiz submitted', score, totalMarks: totalMarks, session: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

export const mySessionHistory = async (req: any, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { student_id: req.user.id },
      include: { quiz: { select: { title: true, duration_seconds: true } } },
      orderBy: { started_at: 'desc' },
    });
    res.json(sessions);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const flushRedisBuffer = async (sessionId: string) => {
  const bufferKey = `session:${sessionId}:buffer`;
  const buffer = await redis.hGetAll(bufferKey);
  if (!buffer || Object.keys(buffer).length === 0) return;

  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { quiz_id: true } });
  if (!session) return;
  const questions = await prisma.question.findMany({
    where: { quiz_id: session.quiz_id },
    include: { concepts: { select: { concept_id: true } } }
  });
  const conceptMap = new Map(questions.map(q => [q.question_id, q.concepts[0]?.concept_id || null]));

  for (const [questionId, raw] of Object.entries(buffer)) {
    const data = JSON.parse(raw as string);
    const conceptId = conceptMap.get(questionId) || null;
    await prisma.sessionAnswer.upsert({
      where: { session_id_question_id: { session_id: sessionId, question_id: questionId } },
      update: { selected_answer: data.answer, change_count: data.changeCount, time_spent_ms: BigInt(data.timeSpentMs), marked_for_review: data.markedForReview, concept_id: conceptId },
      create: { session_id: sessionId, question_id: questionId, selected_answer: data.answer, change_count: data.changeCount, time_spent_ms: BigInt(data.timeSpentMs), marked_for_review: data.markedForReview, concept_id: conceptId },
    });
  }
};

function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }
