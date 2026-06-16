"""
config.py — single source of truth for the IRT module's tunable constants
and database connection. Keeping these here (not scattered across the code)
means the rest of the module never hard-codes a threshold.
"""

import os
import sys

# ── IRT / guess-detection parameters ─────────────────────────────────────────
# These mirror the constants in the TypeScript guess-detection path. If you
# change them here, change them there too (or, better, load them from one place
# such as a small settings table — see README "Keeping the two sides in sync").
RT_GUESS_THRESHOLD_MS = 1500   # answers faster than this are "too fast"
SURPRISE_THRESHOLD = 0.30      # IRT P(correct) below this => "surprising"
MIN_STUDENTS_WARN = 50         # 2PL needs ~50+ students for stable estimates

# Bounds used when seeding cold-start mastery from theta.
SEED_PRIOR_MIN = 0.05
SEED_PRIOR_MAX = 0.95


def load_database_url(override: str | None = None) -> str:
    """Resolve DATABASE_URL: explicit override > backend/.env > environment."""
    if override:
        return override
    try:
        from dotenv import dotenv_values
        here = os.path.dirname(os.path.abspath(__file__))
        env = dotenv_values(os.path.join(here, "..", ".env"))
        if env.get("DATABASE_URL"):
            return env["DATABASE_URL"]
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("No DATABASE_URL found. Pass --database-url or set it in backend/.env")
    return url
