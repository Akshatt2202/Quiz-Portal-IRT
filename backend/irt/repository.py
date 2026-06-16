"""
repository.py — THE DATA CONTRACT with the quiz portal.

This is the ONLY file in the module that knows the portal's table and column
names. Everything else speaks in plain (student_id, question_id, correct)
tuples and numpy arrays. If the portal's schema changes, this file is the only
thing that changes — that is what makes the module decoupled.

Read side  (portal -> module):  fetch_responses()
Write side (module -> portal):  persist_item_params(), persist_student_theta(),
                                fetch_concept_difficulty(), persist_seed_mastery()
"""

from .model import FitResult


def _connect(database_url: str):
    import psycopg2  # imported lazily so model.py/guess.py stay DB-free
    return psycopg2.connect(database_url)


# ── READ: pull responses out of the portal ──────────────────────────────────
def fetch_responses(conn, quiz_id: str) -> list[tuple[str, str, bool]]:
    """Completed (student, question, correct) responses for one quiz.
    Only finished sessions count, and only graded answers."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.student_id, sa.question_id, sa.is_correct
            FROM session_answers sa
            JOIN sessions s ON sa.session_id = s.id
            WHERE s.quiz_id = %s
              AND s.status IN ('submitted', 'expired')
              AND sa.is_correct IS NOT NULL
            """,
            (quiz_id,),
        )
        return [(r[0], r[1], bool(r[2])) for r in cur.fetchall()]


# ── WRITE: push results back into the portal ────────────────────────────────
def persist_item_params(conn, fit: FitResult) -> int:
    with conn.cursor() as cur:
        for qid, b, a in zip(fit.question_ids, fit.difficulty, fit.discrimination):
            cur.execute(
                "UPDATE questions SET irt_difficulty = %s, irt_discrimination = %s "
                "WHERE question_id = %s",
                (float(b), float(a), qid),
            )
    return len(fit.question_ids)


def persist_student_theta(conn, fit: FitResult) -> int:
    with conn.cursor() as cur:
        for sid, th in zip(fit.student_ids, fit.theta):
            cur.execute(
                "INSERT INTO student_profiles (user_id, theta) VALUES (%s, %s) "
                "ON CONFLICT (user_id) DO UPDATE SET theta = EXCLUDED.theta",
                (sid, float(th)),
            )
    return len(fit.student_ids)


def fetch_concept_difficulty(conn) -> dict[str, tuple[float, float]]:
    """Mean fitted (b, a) per concept, for seeding. Concepts with no fitted
    questions are omitted."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT sa.concept_id,
                   AVG(q.irt_difficulty),
                   AVG(COALESCE(q.irt_discrimination, 1))
            FROM session_answers sa
            JOIN questions q ON sa.question_id = q.question_id
            WHERE sa.concept_id IS NOT NULL AND q.irt_difficulty IS NOT NULL
            GROUP BY sa.concept_id
            """
        )
        return {r[0]: (float(r[1]), float(r[2])) for r in cur.fetchall()}


def persist_seed_mastery(conn, student_id: str, concept_id: str, prior: float) -> None:
    """Seed initial mastery only when the student hasn't attempted the concept."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO student_masteries
                (student_id, concept_id, mastery_prob, attempt_count, correct_count, last_seen)
            VALUES (%s, %s, %s, 0, 0, NOW())
            ON CONFLICT (student_id, concept_id) DO UPDATE
                SET mastery_prob = EXCLUDED.mastery_prob, last_seen = NOW()
                WHERE student_masteries.attempt_count = 0
            """,
            (student_id, concept_id, prior),
        )


def commit(conn):
    conn.commit()
