"""
service.py — orchestration. Wires the data contract (repository) to the pure
core (model, guess). This is the function the CLI (or a cron job) calls.
"""

from . import repository as repo
from .config import load_database_url, MIN_STUDENTS_WARN
from .guess import seed_prior
from .model import fit_2pl, FitResult


def fit_quiz(database_url: str, quiz_id: str, write: bool = True, seed: bool = True) -> dict:
    """Full pipeline for one diagnostic quiz:
       read responses -> fit 2PL -> write item params + theta -> seed mastery.
    Returns a small summary dict. Set write=False for a dry run."""
    conn = repo._connect(database_url)
    try:
        responses = fetch = repo.fetch_responses(conn, quiz_id)
        if not responses:
            return {"error": "no completed responses for that quiz_id"}

        n_students = len({r[0] for r in responses})
        n_questions = len({r[1] for r in responses})
        warning = None
        if n_students < MIN_STUDENTS_WARN:
            warning = f"only {n_students} students; 2PL needs ~{MIN_STUDENTS_WARN}+ for stable fits"

        fit: FitResult = fit_2pl(responses)

        summary = {
            "students": n_students,
            "questions": n_questions,
            "warning": warning,
            "sample_items": [
                {"question_id": q, "b": round(float(b), 3), "a": round(float(a), 3)}
                for q, b, a in list(zip(fit.question_ids, fit.difficulty, fit.discrimination))[:5]
            ],
            "written": False,
            "seeded": 0,
        }

        if not write:
            return summary

        repo.persist_item_params(conn, fit)
        repo.persist_student_theta(conn, fit)
        repo.commit(conn)
        summary["written"] = True

        if seed:
            summary["seeded"] = seed_all_students(conn, fit)
            repo.commit(conn)
        return summary
    finally:
        conn.close()


def seed_all_students(conn, fit: FitResult) -> int:
    """Cold-start seeding for every student in the fit, across every concept
    that has fitted questions."""
    concept_diff = repo.fetch_concept_difficulty(conn)
    if not concept_diff:
        return 0
    theta_by_student = dict(zip(fit.student_ids, fit.theta))
    seeded = 0
    for sid, theta in theta_by_student.items():
        for concept_id, (b, a) in concept_diff.items():
            prior = seed_prior(float(theta), b, a)
            repo.persist_seed_mastery(conn, sid, concept_id, prior)
            seeded += 1
    return seeded
