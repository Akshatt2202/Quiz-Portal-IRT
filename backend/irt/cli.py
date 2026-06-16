"""
cli.py — command-line entrypoint for the IRT module.

    python -m irt.cli --quiz-id <UUID>            # fit, write, seed
    python -m irt.cli --quiz-id <UUID> --dry-run  # fit and print only
    python -m irt.cli --synthetic                 # offline self-test (no DB)
"""

import argparse

import numpy as np

from .config import load_database_url
from .model import fit_2pl
from .service import fit_quiz


def run_synthetic():
    from girth.synthetic import create_synthetic_irt_dichotomous
    print("Synthetic self-test (no database)...")
    rng = np.random.default_rng(0)
    true_b = np.linspace(-2, 2, 10)
    true_a = rng.random(10) + 0.5
    true_theta = rng.standard_normal(120)
    data = create_synthetic_irt_dichotomous(true_b, true_a, true_theta)
    # feed the matrix straight to girth via a tiny responses list
    responses = []
    for qi in range(data.shape[0]):
        for si in range(data.shape[1]):
            responses.append((f"s{si}", f"q{qi}", bool(data[qi, si] == 1)))
    fit = fit_2pl(responses)
    order_b = [int(q[1:]) for q in fit.question_ids]
    est_b = fit.difficulty[np.argsort(order_b)]
    print(f"  corr(true_b, est_b) = {np.corrcoef(true_b, est_b)[0,1]:.3f}  (want ~0.9+)")
    print("  module wiring OK.")


def main():
    p = argparse.ArgumentParser(description="IRT (2PL) module for the quiz portal.")
    p.add_argument("--quiz-id", help="Quiz UUID to fit on (required unless --synthetic).")
    p.add_argument("--database-url", help="Override DATABASE_URL.")
    p.add_argument("--dry-run", action="store_true", help="Fit and print, don't write.")
    p.add_argument("--no-seed", action="store_true", help="Skip cold-start seeding.")
    p.add_argument("--synthetic", action="store_true", help="Offline self-test.")
    args = p.parse_args()

    if args.synthetic:
        run_synthetic()
        return
    if not args.quiz_id:
        p.error("--quiz-id is required (or use --synthetic).")

    url = load_database_url(args.database_url)
    summary = fit_quiz(url, args.quiz_id, write=not args.dry_run, seed=not args.no_seed)

    if summary.get("error"):
        raise SystemExit(summary["error"])
    print(f"Loaded {summary['students']} students x {summary['questions']} questions.")
    if summary["warning"]:
        print(f"  WARNING: {summary['warning']}")
    print("Sample fitted items:")
    for it in summary["sample_items"]:
        print(f"  {it['question_id'][:8]}...  b={it['b']:+.2f}  a={it['a']:.2f}")
    if summary["written"]:
        print(f"Wrote item params + theta. Seeded {summary['seeded']} mastery rows.")
    else:
        print("--dry-run: nothing written.")


if __name__ == "__main__":
    main()
