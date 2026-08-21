"""Live-Qwen adaptive-triage evaluation.

Runs the right-arm skin transcript through the live Qwen path FIVE times to
show that:

  * every session asks a skin-specific question,
  * no session defaults to a breathing question on turn 1,
  * questions vary across sessions (not identical wording),
  * no session immediately recommends a medicine on turn 1.

Self-SKIPs (exit 0) when DASHSCOPE_API_KEY is not set — CI must never depend
on network / credentials. Hard-capped at 25 total Qwen calls in one run.

Usage:

    python scripts/live_triage_eval.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "server"))

MAX_TOTAL_CALLS = 25
SESSIONS = 5
COMPLAINT = "mere right bazu pe surkh nishan hai"

BREATHING_MARKERS = ("breath", "سانس", "shortness of breath")


def _tick(ok: bool) -> str:
    return "PASS" if ok else "FAIL"


def main() -> int:
    key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if not key:
        print("SKIPPED — DASHSCOPE_API_KEY is not set. No live calls made.")
        return 0

    os.environ.setdefault("MOCK_MODE", "false")
    # Import late so the environment is honoured.
    from triage import qwen_next_turn

    profile = {
        "display_name": "Hassan",
        "relation": "Demo patient",
        "age": 34,
        "gender": "Male",
        "chronic_conditions": ["Seasonal asthma", "Migraine history"],
        "allergies": ["Ibuprofen — reported rash"],
        "current_medicines": [
            {"name": "Cetirizine", "strength": "10 mg", "source": "prescription"}
        ],
    }

    calls_used = 0
    seen_questions: set[str] = set()
    results: list[dict] = []

    for i in range(SESSIONS):
        if calls_used >= MAX_TOTAL_CALLS:
            print(f"Reached call cap of {MAX_TOTAL_CALLS}; stopping.")
            break

        turns = [{"role": "user", "text": COMPLAINT}]
        turn = qwen_next_turn(profile, session_id=1000 + i, turns=turns)
        calls_used += 1

        q_urdu = turn.question_urdu or turn.advice_urdu or ""
        q_english = (turn.question_english or turn.advice_english or "").lower()
        low = q_urdu.lower() + " " + q_english

        skin_specific = any(
            m in low for m in ["red", "mark", "skin", "sursh", "نشان", "سرخ", "جلد"]
        )
        breathing_default = any(m in low for m in BREATHING_MARKERS)
        no_med_on_turn_one = not turn.medication_options

        results.append({
            "session": i + 1,
            "type": turn.type,
            "level": turn.level.value if turn.level else None,
            "skin_specific": skin_specific,
            "no_breathing_default": not breathing_default,
            "no_medication_on_turn_1": no_med_on_turn_one,
            "question_urdu": q_urdu,
        })
        seen_questions.add(q_urdu.strip())

    if not results:
        print("SKIPPED — no live sessions ran.")
        return 0

    print(f"\nLive Qwen adaptive-triage eval — {len(results)} sessions "
          f"({calls_used} calls used, cap {MAX_TOTAL_CALLS})\n")

    header = f"{'#':>2}  {'TYPE':<9} {'LEVEL':<11} {'SKIN':<5} {'NO-BREATH':<9} {'NO-MED':<7} QUESTION"
    print(header)
    print("-" * len(header))
    for row in results:
        print(
            f"{row['session']:>2}  {row['type']:<9} {row['level'] or '-':<11} "
            f"{_tick(row['skin_specific']):<5} "
            f"{_tick(row['no_breathing_default']):<9} "
            f"{_tick(row['no_medication_on_turn_1']):<7} "
            f"{row['question_urdu'][:80]}"
        )

    all_skin = all(r["skin_specific"] for r in results)
    no_default_breath = all(r["no_breathing_default"] for r in results)
    varied = len(seen_questions) >= max(2, len(results) // 2)
    no_med = all(r["no_medication_on_turn_1"] for r in results)

    print()
    print(f"All questions skin-specific ....... {_tick(all_skin)}")
    print(f"No breathing default on turn 1 .... {_tick(no_default_breath)}")
    print(f"Questions vary across sessions .... {_tick(varied)}  ({len(seen_questions)} distinct)")
    print(f"No medication on turn 1 ........... {_tick(no_med)}")

    return 0 if (all_skin and no_default_breath and no_med) else 1


if __name__ == "__main__":
    sys.exit(main())
