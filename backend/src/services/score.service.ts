import prisma from '../config/db';

export const computeScore = async (sessionId: string, quizId: string) => {
  const questions = await prisma.question.findMany({ where: { quiz_id: quizId } });
  const answers = await prisma.sessionAnswer.findMany({ where: { session_id: sessionId } });

  const answerMap = new Map(answers.map(a => [a.question_id, a.selected_answer]));

  let score = 0;
  let totalMarks = 0;

  for (const question of questions) {
    totalMarks += question.marks;
    const studentAnswer = answerMap.get(question.question_id);
    const isCorrect = studentAnswer === question.correct_answer;

    if (isCorrect) score += question.marks;

    // Update isCorrect in session_answers
    await prisma.sessionAnswer.upsert({
      where: { session_id_question_id: { session_id: sessionId, question_id: question.question_id } },
      update: { is_correct: isCorrect },
      create: { session_id: sessionId, question_id: question.question_id, selected_answer: studentAnswer ?? null, is_correct: isCorrect },
    });
  }

  return { score, totalMarks };
};
