import prisma from '../config/db';

/** BKT Constants */
const P_INITIAL = 0.20;  // Pre-test probability (default 20% knowledge)
const P_LEARN = 0.10;    // Prob. of transitioning from "Not Known" to "Known"
const P_GUESS = 0.25;    // Prob. of guessing correctly if "Not Known"
const P_SLIP = 0.10;     // Prob. of slipping (incorrect) if "Known"
// Note: These are standard defaults; they can be tuned for each concept.

/** Guess-detection (IRT-based) constants */
const RT_GUESS_THRESHOLD_MS = 1500; // answers faster than this are "too fast"
const SURPRISE_THRESHOLD = 0.30;    // P(correct) below this => model didn't expect success
const P_GUESS_INFLATED = 0.75;      // effective guess prob used when a correct answer looks like a guess
// A correct answer is treated as a probable guess only when it is BOTH
// surprising (low IRT-predicted P(correct)) AND too fast. When flagged, we
// raise the effective P_GUESS for that single observation so the correct
// answer counts as weaker evidence of mastery (a smaller upward update).

export interface MasteryUpdateOptions {
  responseTimeMs?: number;   // time spent on the question (SessionAnswer.time_spent_ms)
  theta?: number | null;     // student IRT ability (StudentProfile.theta)
  difficulty?: number | null;      // question IRT difficulty b (Question.irt_difficulty)
  discrimination?: number | null;  // question IRT discrimination a (Question.irt_discrimination)
}

/**
 * 2PL probability of a correct response. Falls back to discrimination = 1 (1PL)
 * when no discrimination is supplied.
 */
export function irtPCorrect(theta: number, b: number, a: number = 1): number {
  return 1 / (1 + Math.exp(-a * (theta - b)));
}

/**
 * A correct answer is a probable guess when the model did not expect the
 * student to get it right AND it was answered very fast. If IRT parameters
 * are missing we fall back to a response-time-only rule.
 */
export function isProbableGuess(opts: MasteryUpdateOptions): boolean {
  const tooFast =
    opts.responseTimeMs !== undefined &&
    opts.responseTimeMs > 0 &&
    opts.responseTimeMs < RT_GUESS_THRESHOLD_MS;
  if (!tooFast) return false;

  // If we have IRT params, require the answer to also be "surprising".
  if (opts.theta != null && opts.difficulty != null) {
    const p = irtPCorrect(opts.theta, opts.difficulty, opts.discrimination ?? 1);
    return p < SURPRISE_THRESHOLD;
  }
  // No IRT params yet (e.g. before the first diagnostic fit): time-only fallback.
  return true;
}

export class KnowledgeService {

  /** Update Mastery based on Bayesian Knowledge Tracing.
   *  Optionally accepts response time + IRT params to down-weight probable guesses. */
  static async updateMastery(
    studentId: string,
    conceptId: string,
    isCorrect: boolean,
    opts: MasteryUpdateOptions = {}
  ) {
    const current = await prisma.studentMastery.findUnique({
      where: { student_id_concept_id: { student_id: studentId, concept_id: conceptId } },
    });

    const pOld = current ? current.mastery_prob : P_INITIAL;

    // Guess detection: a correct-but-suspicious answer uses an inflated guess
    // probability, so it produces a smaller upward mastery update.
    const flaggedGuess = isCorrect && isProbableGuess(opts);
    const pGuessEff = flaggedGuess ? P_GUESS_INFLATED : P_GUESS;

    /** BKT Update Rule
     * P(K_t | Obs) = P(K_t-1) * P(Obs | K) / [ P(K_t-1) * P(Obs | K) + (1-P(K_t-1)) * P(Obs | not-K) ]
     * then, P(K_t+1) = P(K_t | Obs) + (1 - P(K_t | Obs)) * P_LEARN
     */
    let pConditional: number;
    if (isCorrect) {
      // Correct: P(correct | K) = 1 - slip ; P(correct | not-K) = guess
      pConditional = (pOld * (1 - P_SLIP)) / (pOld * (1 - P_SLIP) + (1 - pOld) * pGuessEff);
    } else {
      // Incorrect: P(incorrect | K) = slip ; P(incorrect | not-K) = 1 - guess
      // (denominator now correctly grouped — previously a parenthesis bug made
      //  wrong answers push mastery UP instead of down.)
      pConditional = (pOld * P_SLIP) / (pOld * P_SLIP + (1 - pOld) * (1 - P_GUESS));
    }

    const pNew = pConditional + (1 - pConditional) * P_LEARN;

    // Clamp between 0.001 and 0.999 to avoid math edge cases
    const clampedP = Math.min(Math.max(pNew, 0.001), 0.999);

    return await prisma.studentMastery.upsert({
      where: { student_id_concept_id: { student_id: studentId, concept_id: conceptId } },
      update: {
        mastery_prob: clampedP,
        attempt_count: { increment: 1 },
        correct_count: isCorrect ? { increment: 1 } : undefined,
        last_seen: new Date(),
      },
      create: {
        student_id: studentId,
        concept_id: conceptId,
        mastery_prob: clampedP,
        attempt_count: 1,
        correct_count: isCorrect ? 1 : 0,
        last_seen: new Date(),
      }
    });
  }

  /** Identify the root cause of a knowledge gap by traversing the graph */
  static async identifyGaps(studentId: string, targetConceptId: string) {
    const concept = await prisma.concept.findUnique({
      where: { concept_id: targetConceptId },
      include: { 
        prerequisites: {
          include: { studentMasteries: { where: { student_id: studentId } } }
        }
      }
    });

    if (!concept || !concept.prerequisites.length) return null;

    // Filter prerequisites where the student's mastery is below 60%
    const gaps = concept.prerequisites.filter(p => {
      const mastery = p.studentMasteries[0]?.mastery_prob || P_INITIAL;
      return mastery < 0.60;
    });

    return gaps;
  }

  /** Get the "Student Knowledge Graph" - concepts with mastery colors */
  static async getStudentGraph(studentId: string) {
    const concepts = await prisma.concept.findMany({
      include: {
        prerequisites: { select: { concept_id: true } },
        studentMasteries: { where: { student_id: studentId } }
      }
    });

    return concepts.map(c => ({
      id: c.concept_id,
      name: c.concept_name,
      chapter: c.chapter,
      mastery: c.studentMasteries[0]?.mastery_prob || P_INITIAL,
      prerequisites: c.prerequisites.map(p => p.concept_id)
    }));
  }

  /**
   * Cold-start seeding: replace the flat P_INITIAL prior with an IRT-informed
   * per-concept prior derived from the student's theta and each concept's
   * fitted item difficulty. Only seeds concepts the student hasn't attempted,
   * so it never overwrites mastery the student has already earned.
   * Run this once per student right after the diagnostic IRT fit.
   */
  static async seedMasteryFromTheta(studentId: string) {
    const profile = await prisma.studentProfile.findUnique({ where: { user_id: studentId } });
    if (!profile || profile.theta == null) return { seeded: 0, reason: 'no theta — run the IRT fit first' };
    const theta = profile.theta;

    const concepts = await prisma.concept.findMany({
      include: { questions: { select: { irt_difficulty: true, irt_discrimination: true } } },
    });

    let seeded = 0;
    for (const c of concepts) {
      const fitted = c.questions.filter(q => q.irt_difficulty != null);
      if (fitted.length === 0) continue; // no IRT data for this concept yet

      const b = fitted.reduce((s, q) => s + (q.irt_difficulty as number), 0) / fitted.length;
      const aVals = fitted.filter(q => q.irt_discrimination != null);
      const a = aVals.length
        ? aVals.reduce((s, q) => s + (q.irt_discrimination as number), 0) / aVals.length
        : 1;

      const prior = Math.min(Math.max(irtPCorrect(theta, b, a), 0.05), 0.95);

      const existing = await prisma.studentMastery.findUnique({
        where: { student_id_concept_id: { student_id: studentId, concept_id: c.concept_id } },
      });
      if (existing && existing.attempt_count > 0) continue; // don't clobber earned mastery

      await prisma.studentMastery.upsert({
        where: { student_id_concept_id: { student_id: studentId, concept_id: c.concept_id } },
        update: { mastery_prob: prior, last_seen: new Date() },
        create: { student_id: studentId, concept_id: c.concept_id, mastery_prob: prior, attempt_count: 0, correct_count: 0, last_seen: new Date() },
      });
      seeded++;
    }
    return { seeded };
  }
}
