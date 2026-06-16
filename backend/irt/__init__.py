"""
irt — IRT-Based Guess Detection Module for the quiz portal.

Public API (import these; treat everything else as internal):
    from irt import fit_quiz, p_correct, is_probable_guess, seed_prior

Layering:
    config.py      tunables + DB url             (no portal/DB logic)
    model.py       pure 2PL math                 (no DB)
    guess.py       pure guess + seeding logic    (no DB)
    repository.py  THE data contract             (only file touching portal tables)
    service.py     orchestration                 (wires contract to core)
    cli.py         command-line entrypoint
"""

from .model import p_correct, fit_2pl, FitResult
from .guess import is_probable_guess, seed_prior
from .service import fit_quiz

__all__ = [
    "p_correct",
    "fit_2pl",
    "FitResult",
    "is_probable_guess",
    "seed_prior",
    "fit_quiz",
]
