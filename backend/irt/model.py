"""
model.py — the pure IRT math. No database, no I/O, no portal knowledge.
Everything here is a plain function over numpy arrays, so it can be unit-tested
on synthetic data with zero setup. This is the heart of the module.
"""

from dataclasses import dataclass

import numpy as np

try:
    from girth import twopl_mml, ability_eap, tag_missing_data
except ImportError:  # pragma: no cover
    raise ImportError("girth not installed. Run: pip install girth numpy")

MISSING_SENTINEL = -9999  # any value not in {0,1}; tag_missing_data masks these


@dataclass
class FitResult:
    """Output of a 2PL fit, in the module's own vocabulary (not the DB's)."""
    question_ids: list[str]
    difficulty: np.ndarray       # b, per question (aligned with question_ids)
    discrimination: np.ndarray   # a, per question
    student_ids: list[str]
    theta: np.ndarray            # latent ability, per student (aligned with student_ids)


def p_correct(theta: float, b: float, a: float = 1.0) -> float:
    """2PL probability of a correct response. a defaults to 1 (=> 1PL/Rasch)."""
    return 1.0 / (1.0 + np.exp(-a * (theta - b)))


def build_matrix(responses: list[tuple[str, str, bool]]):
    """responses: (student_id, question_id, is_correct) triples.
    Returns (data[items x persons], question_ids, student_ids).
    girth expects responses oriented as items (rows) x persons (cols)."""
    student_ids = sorted({r[0] for r in responses})
    question_ids = sorted({r[1] for r in responses})
    s_idx = {s: i for i, s in enumerate(student_ids)}
    q_idx = {q: i for i, q in enumerate(question_ids)}

    data = np.full((len(question_ids), len(student_ids)), MISSING_SENTINEL, dtype=int)
    for student_id, question_id, is_correct in responses:
        data[q_idx[question_id], s_idx[student_id]] = 1 if is_correct else 0

    data = tag_missing_data(data, [0, 1])
    return data, question_ids, student_ids


def fit_2pl(responses: list[tuple[str, str, bool]]) -> FitResult:
    """Fit a 2PL model and estimate per-student ability. Pure: in -> out."""
    data, question_ids, student_ids = build_matrix(responses)
    est = twopl_mml(data)
    b = est["Difficulty"]
    a = est["Discrimination"]
    theta = ability_eap(data, b, a)
    return FitResult(question_ids, b, a, student_ids, theta)
