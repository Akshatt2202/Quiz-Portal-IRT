# IRT Module — IRT-Based Guess Detection

A self-contained module that takes response data from the quiz portal, fits a
**2PL IRT model**, detects probable guesses, and seeds cold-start mastery. It
talks to the rest of the app through **two narrow seams only**, so it can be
built and tested on its own (synthetic data, no database required).

## Layering (dependencies point downward only)

```
cli.py          command-line entrypoint
  └ service.py  orchestration: read → fit → write → seed
      ├ repository.py   ← THE DATA CONTRACT (only file that knows portal tables)
      ├ model.py        ← pure 2PL math (no DB)
      ├ guess.py        ← pure guess + seeding logic (no DB)
      └ config.py       ← tunables + DB url
```

`model.py` and `guess.py` never import `repository.py`. That is what keeps the
core pure and unit-testable.

## The data contract with the quiz portal

The module touches the portal in exactly one file, `repository.py`:

**Reads (portal → module)**
- `session_answers` joined to `sessions`: `(student_id, question_id, is_correct)`
  for completed sessions of one quiz.

**Writes (module → portal)**
- `questions.irt_difficulty` (b), `questions.irt_discrimination` (a)
- `student_profiles.theta`
- `student_masteries.mastery_prob` (cold-start seed, only where `attempt_count = 0`)

If the portal's schema ever changes, **only `repository.py` changes.** Nothing
else in the module knows a database exists.

## Usage

```bash
pip install -r requirements.txt

# Offline self-test — no database needed
python -m irt.cli --synthetic

# Fit one diagnostic quiz, print results, write nothing
python -m irt.cli --quiz-id <QUIZ_UUID> --dry-run

# Full run: fit, write item params + theta, seed mastery
python -m irt.cli --quiz-id <QUIZ_UUID>
```

Run it as a batch job whenever a diagnostic quiz closes — it is not on the
request path.

## How it connects to the live app

IRT fitting is offline (Python, here). The **live** guess-detection runs in the
TypeScript backend at submit time (`services/knowledge.service.ts`), reading the
`theta`, `irt_difficulty`, and `irt_discrimination` this module wrote. So the
flow is:

```
diagnostic quiz closes
   → python -m irt.cli --quiz-id ...   (this module: writes theta, a, b; seeds mastery)
   → students take more quizzes
   → TS submit path reads theta/a/b, down-weights probable guesses in BKT
```

## Keeping the two sides in sync

`is_probable_guess` exists here (Python, for offline analysis/eval) and in the
TS submit path (live). They share the same constants: `RT_GUESS_THRESHOLD_MS`,
`SURPRISE_THRESHOLD`. If you change one, change the other — or promote both to a
small settings table so there is a single source of truth.

## Public API

```python
from irt import fit_quiz, fit_2pl, p_correct, is_probable_guess, seed_prior
```

Everything not exported in `__init__.py` is internal.
