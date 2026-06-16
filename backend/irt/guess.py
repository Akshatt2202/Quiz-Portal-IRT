"""
guess.py — pure guess-detection and seeding logic. No DB.
This mirrors the live TypeScript path (services/knowledge.service.ts) so that
offline analysis and the running app agree on what counts as a guess.
"""

from .config import (
    RT_GUESS_THRESHOLD_MS,
    SURPRISE_THRESHOLD,
    SEED_PRIOR_MIN,
    SEED_PRIOR_MAX,
)
from .model import p_correct


def is_probable_guess(
    response_time_ms: float | None,
    theta: float | None = None,
    difficulty: float | None = None,
    discrimination: float | None = 1.0,
) -> bool:
    """A correct answer is a probable guess when it is BOTH surprising
    (low IRT-predicted P(correct)) AND too fast. Falls back to a time-only
    rule when IRT params aren't available yet."""
    too_fast = (
        response_time_ms is not None
        and response_time_ms > 0
        and response_time_ms < RT_GUESS_THRESHOLD_MS
    )
    if not too_fast:
        return False
    if theta is not None and difficulty is not None:
        return bool(p_correct(theta, difficulty, discrimination or 1.0) < SURPRISE_THRESHOLD)
    return True  # time-only fallback


def seed_prior(theta: float, b: float, a: float = 1.0) -> float:
    """Cold-start prior for a concept: the IRT-predicted chance the student
    answers it correctly, clamped away from 0/1."""
    return min(max(p_correct(theta, b, a), SEED_PRIOR_MIN), SEED_PRIOR_MAX)
