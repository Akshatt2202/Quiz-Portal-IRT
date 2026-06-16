import { Response } from 'express';
import prisma from '../config/db';
import { KnowledgeService } from '../services/knowledge.service';
import { exec } from 'child_process';
import path from 'path';

export const listConcepts = async (_req: any, res: Response) => {
  try {
    const concepts = await prisma.concept.findMany({ orderBy: { concept_name: 'asc' } });
    res.json(concepts);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const createQuiz = async (req: any, res: Response) => {
  try {
    const {
    title,
    description,
    duration_seconds,
    shuffle_questions,
    startTime
      } = req.body;
    console.log("REQ BODY:", req.body);
    const quiz = await prisma.quiz.create({
      data: {
        title,
        description,
        duration_seconds: Number(duration_seconds),
        shuffle_questions: Boolean(shuffle_questions),
        start_time: startTime ? new Date(startTime) : null,
        created_by: req.user.id,
      },
    });
    res.status(201).json(quiz);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

export const listQuizzes = async (_req: any, res: Response) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      include: { _count: { select: { questions: true, sessions: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(quizzes);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const getQuiz = async (req: any, res: Response) => {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: String(req.params.id) },
      include: { questions: { orderBy: { order_index: 'asc' }, include: { concepts: true } } },
    });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Process questions to ensure they have the 'options' array
    const questions = quiz.questions.map(q => {
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
        text: q.stem,                 // <-- FIX
        options,
        correct_option: q.correct_answer, // <-- FIX
        marks: q.marks,
        order_index: q.order_index,
        concepts: q.concepts?.map(c => ({
          id: c.concept_id,
          name: c.concept_name
        })) || []
      };
    });

    res.json({ ...quiz, questions });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const updateQuiz = async (req: any, res: Response) => {
  try {
    const { title, description, durationSeconds, shuffleQuestions, status, startTime } = req.body;
    const quiz = await prisma.quiz.update({
      where: { id: String(req.params.id) },
      data: { title, description, duration_seconds: durationSeconds, shuffle_questions: shuffleQuestions, status, start_time: startTime ? new Date(startTime) : undefined },
    });
    res.json(quiz);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const deleteQuiz = async (req: any, res: Response) => {
  try {
    await prisma.quiz.delete({ where: { id: String(req.params.id) } });
    res.json({ message: 'Quiz deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const addQuestion = async (req: any, res: Response) => {
  try {
    const {
      text,
      options,
      correct_option,
      marks,
      order_index,
      conceptIds
    } = req.body;

    const question = await prisma.question.create({
      data: {
        quiz_id: String(req.params.quizId),
        stem: text,
        options,
        correct_answer: correct_option,
        marks: marks || 1,
        order_index: order_index || 0,
        question_type: 'mcq',
        concepts: conceptIds?.length > 0
          ? { connect: conceptIds.map((id: string) => ({ concept_id: id })) }
          : undefined
      },
    });

    res.status(201).json(question);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateQuestion = async (req: any, res: Response) => {
  try {
    const {
      text,
      options,
      correct_option,
      marks,
      order_index,
      conceptIds
    } = req.body;

    const question = await prisma.question.update({
      where: { question_id: String(req.params.id) },
      data: {
        stem: text,
        options,
        correct_answer: correct_option,
        marks,
        order_index: order_index || 0,
        concepts: conceptIds
          ? { set: conceptIds.map((id: string) => ({ concept_id: id })) }
          : { set: [] }
      },
    });

    res.json(question);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteQuestion = async (req: any, res: Response) => {
  try {
    await prisma.question.delete({ where: { question_id: String(req.params.id) } });
    res.json({ message: 'Question deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const getQuizSessions = async (req: any, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { quiz_id: String(req.params.quizId) },
      include: { student: { select: { name: true, email: true, roll_no: true } } },
      orderBy: { started_at: 'desc' },
    });
    res.json(sessions);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const getSessionReport = async (req: any, res: Response) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: String(req.params.sessionId) },
      include: {
        student: { select: { name: true, email: true, roll_no: true } },
        quiz: { select: { title: true, duration_seconds: true } },
        answers: { include: { question: true } },
        events: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Process answer questions to ensure they have the 'options' array
    const processedAnswers = session.answers.map(ans => {
      const q = ans.question;
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
        ...ans, 
        answer: ans.selected_answer,
        question: { 
          ...q, 
          options,
          text: q.stem,
          correct_option: q.correct_answer 
        } 
      };
    });

    res.json({ ...session, answers: processedAnswers });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const getStudentHistory = async (req: any, res: Response) => {
  try {
    const student = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      include: {
        sessions: {
          include: { quiz: { select: { title: true } } },
          orderBy: { started_at: 'desc' },
        },
      },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const answers = await prisma.sessionAnswer.findMany({
      where: {
        session_id: { in: student.sessions.map(s => s.id) },
        session: { status: 'submitted' },
        concept_id: { not: null }
      },
      include: { concept: true, question: true }
    });

    const conceptStats: Record<string, { conceptName: string, correct: number, total: number, score: number, totalMarks: number }> = {};
    for (const a of answers) {
      if (!a.concept_id || !a.concept) continue;
      if (!conceptStats[a.concept_id]) conceptStats[a.concept_id] = { conceptName: a.concept.concept_name, correct: 0, total: 0, score: 0, totalMarks: 0 };
      conceptStats[a.concept_id].total += 1;
      conceptStats[a.concept_id].totalMarks += a.question.marks;
      if (a.is_correct) {
        conceptStats[a.concept_id].correct += 1;
        conceptStats[a.concept_id].score += a.question.marks;
      }
    }

    res.json({ ...student, conceptProgress: Object.values(conceptStats) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

export const getQuizResults = async (req: any, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { quiz_id: String(req.params.quizId), status: { in: ['submitted', 'expired'] } },
      include: { student: { select: { name: true, email: true, roll_no: true } }, answers: true },
      orderBy: { score: 'desc' },
    });
    const quiz = await prisma.quiz.findUnique({ where: { id: String(req.params.quizId) }, include: { _count: { select: { questions: true } } } });
    res.json({ quiz, sessions });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const getAllStudents = async (_req: any, res: Response) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'student' },
      select: { id: true, name: true, email: true, roll_no: true, created_at: true, _count: { select: { sessions: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(students);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

export const syncKnowledgeGraph = async (_req: any, res: Response) => {
  try {
    // Run the sync script using ts-node
    const scriptPath = path.join(__dirname, '../scripts/sync-data.ts');
    exec(`npx ts-node ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Sync error: ${error}`);
        return res.status(500).json({ error: 'Sync failed' });
      }
      res.json({ message: 'Sync started', output: stdout });
    });
  } catch (e) { res.status(500).json({ error: 'Could not trigger sync' }); }
};

export const getMasteryGraph = async (req: any, res: Response) => {
  try {
    const studentId = req.query.studentId || null;
    if (studentId) {
      const graph = await KnowledgeService.getStudentGraph(String(studentId));
      return res.json(graph);
    }
    // Return base graph if no student specified
    const concepts = await prisma.concept.findMany({
      include: { prerequisites: { select: { concept_id: true } } }
    });
    res.json(concepts);
  } catch { res.status(500).json({ error: 'Server error' }); }
};
