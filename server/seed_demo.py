"""Seed a complete, presentable demo account straight into the local database.

Why this exists: driving the live app to build demo data costs real AI calls and
depends on a provider quota that is currently exhausted. Every record here is
written directly, so seeding is free, instant and identical every time you run it.

The clinical content is fixed synthetic text written by hand — it is NOT model
output, and every triage result is stamped response_source="demo_fixture" so it
can never be mistaken for a live assessment in the audit trail.

    python seed_demo.py            # create or refresh the demo account
    python seed_demo.py --reset    # delete it first, then recreate

Login after seeding:  03001234567  ·  password NabzDemo2026
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone

from db import SessionLocal, init_db
from models_db import Account, Medicine, Profile, TimelineEntry, TriageSession
from schemas import (
    ClinicalState, PossibleCause, TriageAnalysis, TriageLevel, TriageTurn,
)
from security import hash_password

# Stored in canonical form — auth.canonical_phone() normalises the typed
# number to this before looking the account up, so the raw string would
# never match. You still TYPE 03001234567 on the login screen.
PHONE = "+923001234567"
PASSWORD = "NabzDemo2026"
NOW = datetime.now(timezone.utc).replace(tzinfo=None)


def ago(days=0, hours=0):
    return NOW - timedelta(days=days, hours=hours)


def analysis(summary_ur, summary_en, confidence, questions, red_flags=()):
    return TriageAnalysis(
        still_checking_urdu=summary_ur,
        still_checking_english=summary_en,
        confidence=confidence,
        questions_asked=questions,
        clinical_state=ClinicalState(red_flags_present=list(red_flags)),
    )


def cause(name_en, name_ur, what_en, what_ur, likelihood):
    return PossibleCause(
        name_english=name_en, name_urdu=name_ur,
        what_it_is_english=what_en, what_it_is_urdu=what_ur,
        likelihood=likelihood,
    )


# ── the five encounters ──────────────────────────────────────────────────────
# Each is (profile, initial text, turns, TriageTurn kwargs, days_ago).
def encounters():
    return [
        dict(
            who="Ayesha", days=2,
            initial="بچی کو تین دن سے بخار ہے اور وہ کم کھا رہی ہے",
            turns=[
                {"role": "user", "text": "بچی کو تین دن سے بخار ہے اور وہ کم کھا رہی ہے"},
                {"role": "assistant", "text": "بخار کتنے دن سے ہے؟", "question_goal": "duration"},
                {"role": "user", "text": "تین دن سے"},
                {"role": "assistant", "text": "کیا جسم پر دانے یا قے ہے؟", "question_goal": "red_flags"},
                {"role": "user", "text": "نہیں، دانے نہیں ہیں اور قے بھی نہیں"},
            ],
            title="Child with fever for three days",
            level=TriageLevel.DOCTOR_24H,
            advice_ur="یہ بخار عام طور پر کسی وائرس کی وجہ سے ہو سکتا ہے۔ بچی کو آرام کرائیں، زیادہ پانی پلائیں، اور بخار کم کرنے کی دوا ضرورت کے مطابق دیں۔ اگر بخار پانچ دن سے زیادہ رہے یا علامات بگڑیں تو فوری ڈاکٹر سے رجوع کریں۔",
            advice_en="This fever may be due to a common viral infection. Ensure she rests, stays hydrated, and receives fever-reducing medication as needed. If the fever lasts more than five days or her symptoms worsen, consult a doctor.",
            reason="Three days of fever with reduced appetite and no alarm features.",
            sugg_ur=["آرام کرائیں اور تھوڑا تھوڑا کر کے پانی پلاتے رہیں۔",
                     "بخار ناپتے رہیں اور لکھتے جائیں۔",
                     "اگر بچی سست ہو جائے یا پانی نہ پیے تو فوراً ڈاکٹر کے پاس لے جائیں۔"],
            sugg_en=["Let her rest and keep offering small sips of water.",
                     "Keep measuring and noting the temperature.",
                     "If she becomes drowsy or stops drinking, see a doctor at once."],
            causes=[cause("Viral infection", "وائرس انفیکشن",
                          "This is a common illness often found in children.",
                          "یہ ایک عام بیماری ہے جو عام طور پر بچوں میں پائی جاتی ہے۔", "MORE_LIKELY"),
                    cause("Throat infection", "گلے کا انفیکشن",
                          "An infection of the throat that can cause fever.",
                          "گلے کا انفیکشن جو بخار کا سبب بن سکتا ہے۔", "POSSIBLE")],
            handoff="6-year-old female, 3 days of fever, reduced oral intake, no rash or vomiting, remains hydrated. No red flags elicited. Advised review within 24 hours.",
            escalate=["Fever beyond 5 days", "Drowsiness or unresponsiveness",
                      "Refusing all fluids", "New rash"],
        ),
        dict(
            who="Kheem", days=1,
            initial="Mujhe kal se gale mein kharash, halka bukhar aur sir dard hai",
            turns=[
                {"role": "user", "text": "Mujhe kal se gale mein kharash, halka bukhar aur sir dard hai"},
                {"role": "assistant", "text": "یہ علامات کب سے ہیں؟", "question_goal": "duration"},
                {"role": "user", "text": "Kal se"},
                {"role": "assistant", "text": "تکلیف کتنی شدید ہے؟", "question_goal": "severity"},
                {"role": "user", "text": "Halki hai"},
            ],
            title="Sore throat and mild fever",
            level=TriageLevel.HOME_CARE,
            advice_ur="یہ علامات عام طور پر ہلکے وائرل انفیکشن کی طرف اشارہ کرتی ہیں۔ آرام کریں، نیم گرم پانی پیتے رہیں، اور نمک ملے گرم پانی سے غرارے کریں۔ اگر تین دن میں بہتری نہ ہو تو ڈاکٹر سے رجوع کریں۔",
            advice_en="These symptoms usually point to a mild viral infection. Rest, keep drinking warm fluids, and gargle with warm salt water. If there is no improvement within three days, see a doctor.",
            reason="Mild, one-day history of upper respiratory symptoms without red flags.",
            sugg_ur=["آرام کریں اور کافی پانی پئیں۔", "نمک ملے گرم پانی سے غرارے کریں۔",
                     "اگر نگلنے میں شدید تکلیف ہو تو ڈاکٹر سے ملیں۔"],
            sugg_en=["Rest and drink plenty of fluids.", "Gargle with warm salt water.",
                     "See a doctor if swallowing becomes very painful."],
            causes=[cause("Viral sore throat", "وائرل گلے کی خراش",
                          "A common, self-limiting throat infection.",
                          "ایک عام انفیکشن جو خود ہی ٹھیک ہو جاتا ہے۔", "MORE_LIKELY")],
            handoff="27-year-old male, 1 day of sore throat, mild fever and headache. No dysphagia, no respiratory distress. Self-care advised.",
            escalate=["Difficulty swallowing or breathing", "Fever above 39°C",
                      "Symptoms beyond 3 days"],
        ),
        dict(
            who="Fatima", days=1, hours=3,
            initial="والدہ کو چکر آ رہے ہیں اور بہت کمزوری محسوس ہو رہی ہے",
            turns=[
                {"role": "user", "text": "والدہ کو چکر آ رہے ہیں اور بہت کمزوری محسوس ہو رہی ہے"},
                {"role": "assistant", "text": "یہ کیفیت کب سے ہے؟", "question_goal": "duration"},
                {"role": "user", "text": "دو دن سے"},
                {"role": "assistant", "text": "کیا انہیں ذیابیطس ہے؟", "question_goal": "history"},
                {"role": "user", "text": "جی ہاں، انہیں ذیابیطس ہے"},
            ],
            title="Dizziness and weakness with diabetes",
            level=TriageLevel.DOCTOR_24H,
            advice_ur="ذیابیطس اور بلند فشارِ خون کے ساتھ چکر اور کمزوری کو نظر انداز نہیں کرنا چاہیے۔ خون میں شکر کی مقدار چیک کروائیں اور چوبیس گھنٹے کے اندر ڈاکٹر سے رجوع کریں۔",
            advice_en="Dizziness and weakness alongside diabetes and high blood pressure should not be ignored. Check her blood sugar and see a doctor within twenty-four hours.",
            reason="Two days of dizziness in a diabetic, hypertensive 58-year-old.",
            sugg_ur=["خون میں شکر کی مقدار چیک کروائیں۔", "اچانک کھڑے ہونے سے گریز کریں۔",
                     "بلڈ پریشر ناپیں اور نوٹ کریں۔"],
            sugg_en=["Have her blood sugar checked.", "Avoid standing up suddenly.",
                     "Measure and record her blood pressure."],
            causes=[cause("Low blood sugar", "خون میں شکر کی کمی",
                          "Blood glucose falling below the normal range.",
                          "خون میں شکر کا معمول سے کم ہو جانا۔", "POSSIBLE"),
                    cause("Blood pressure change", "فشارِ خون میں تبدیلی",
                          "A drop in blood pressure on standing can cause dizziness.",
                          "کھڑے ہوتے وقت فشارِ خون کا گرنا چکر کا سبب بن سکتا ہے۔", "POSSIBLE")],
            handoff="58-year-old female, type 2 diabetes and hypertension on metformin and amlodipine. 2 days of dizziness and generalised weakness. Requires glucose and BP assessment within 24 hours.",
            escalate=["Fainting or collapse", "Chest pain", "Confusion",
                      "Blood sugar below 70 mg/dL"],
        ),
        dict(
            who="Hassan", days=0, hours=6,
            initial="I have body aches and a mild fever since this morning",
            turns=[
                {"role": "user", "text": "I have body aches and a mild fever since this morning"},
                {"role": "assistant", "text": "علامات کب سے ہیں؟", "question_goal": "duration"},
                {"role": "user", "text": "Since this morning"},
                {"role": "assistant", "text": "بخار کتنا ہے؟", "question_goal": "severity"},
                {"role": "user", "text": "Mild, around 38"},
            ],
            title="Mild fever and body aches",
            level=TriageLevel.HOME_CARE,
            advice_ur="بخار اور جسم میں درد ہلکے لگتے ہیں، جو ممکنہ طور پر کسی وائرل انفیکشن کی وجہ سے ہو سکتے ہیں۔ آرام کریں، پانی زیادہ پئیں، اور اگر علامات تین دن سے زیادہ رہیں تو ڈاکٹر سے رابطہ کریں۔",
            advice_en="This mild fever and body aches seem likely due to a viral infection. Rest, stay hydrated, and if symptoms persist beyond three days, consult a doctor.",
            reason="Same-day onset of mild systemic symptoms without red flags.",
            sugg_ur=["آرام کریں اور کافی پانی پئیں۔",
                     "دوا لینے سے پہلے اپنی الرجی کے بارے میں فارماسسٹ کو ضرور بتائیں۔"],
            sugg_en=["Rest and stay well-hydrated.",
                     "Tell the pharmacist about your ibuprofen allergy before taking anything."],
            causes=[cause("Viral infection", "وائرل انفیکشن",
                          "This is likely a sign of a mild viral illness.",
                          "یہ ممکنہ طور پر ہلکی وائرل بیماری کی علامت ہے۔", "MORE_LIKELY")],
            handoff="34-year-old male, documented ibuprofen allergy. Same-day mild fever and myalgia. NSAIDs withheld on allergy grounds. Self-care advised.",
            escalate=["Fever above 39°C", "Shortness of breath",
                      "Rash after any medication", "Symptoms beyond 3 days"],
            vault_used=["Allergy: Ibuprofen — reported rash", "Current medicine: Cetirizine 10 mg"],
        ),
    ]


def build_turn(enc, session_id, name):
    return TriageTurn(
        type="result", session_id=session_id, patient_name=name,
        analysis=analysis(enc["title"], enc["title"], 0.82, 2, enc.get("red_flags", ())),
        mock=False,
        # Never "live_ai" — these are hand-written fixtures, not model output.
        response_source="demo_fixture",
        encounter_title=enc["title"],
        level=enc["level"],
        advice_urdu=enc["advice_ur"], advice_english=enc["advice_en"],
        reason_english=enc["reason"],
        suggestions_urdu=enc["sugg_ur"], suggestions_english=enc["sugg_en"],
        doctor_handoff_english=enc["handoff"],
        possible_causes=enc["causes"],
        escalation_signs=enc["escalate"],
        vault_context_used=enc.get("vault_used", []),
    )


PROFILES = [
    dict(display_name="Kheem", relation="Self", age=27, gender="Male",
         dob=date(1999, 3, 23), is_self=True, conditions=[], allergies=[], meds=[]),
    dict(display_name="Ayesha", relation="Daughter", age=6, gender="Female",
         dob=date(2020, 3, 14), is_self=False, conditions=[], allergies=[], meds=[]),
    dict(display_name="Fatima", relation="Mother", age=58, gender="Female",
         dob=date(1968, 7, 2), is_self=False,
         conditions=["Type 2 diabetes", "High blood pressure"],
         allergies=["Penicillin — reported rash"],
         meds=[("Metformin", "500 mg", "Twice daily"), ("Amlodipine", "5 mg", "Once daily")]),
    dict(display_name="Hassan", relation="Brother", age=34, gender="Male",
         dob=date(1992, 1, 19), is_self=False, conditions=[],
         allergies=["Ibuprofen — reported rash"],
         meds=[("Cetirizine", "10 mg", "Once daily")]),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true",
                    help="delete the existing demo account before seeding")
    args = ap.parse_args()

    init_db()
    db = SessionLocal()
    try:
        existing = db.query(Account).filter(Account.phone == PHONE).one_or_none()
        if existing and args.reset:
            db.delete(existing)
            db.commit()
            existing = None
            print("removed previous demo account")
        if existing:
            print(f"demo account already present (id={existing.id}).")
            print("Run with --reset to rebuild it from scratch.")
            return 0

        account = Account(
            full_name="Kheem Parkash Dharmani", phone=PHONE,
            email="demo@nabz.pk", password_hash=hash_password(PASSWORD),
            # Pre-verified so the amber "verify your phone" banner stays off
            # the screen during the demo.
            phone_verified=True, phone_verified_at=NOW,
            email_verified=True, email_verified_at=NOW,
            created_at=ago(days=40),
        )
        db.add(account)
        db.flush()

        by_name = {}
        for spec in PROFILES:
            p = Profile(
                account_id=account.id, display_name=spec["display_name"],
                relation=spec["relation"], age=spec["age"], gender=spec["gender"],
                date_of_birth=spec["dob"], is_self=spec["is_self"],
                chronic_conditions=spec["conditions"], allergies=spec["allergies"],
                created_at=ago(days=40),
            )
            db.add(p)
            db.flush()
            by_name[spec["display_name"]] = p
            for name, strength, freq in spec["meds"]:
                db.add(Medicine(profile_id=p.id, name=name, strength=strength,
                                frequency=freq, source="manual", created_at=ago(days=30)))
            print(f"  profile  {spec['display_name']:8} {spec['relation']:10} "
                  f"{len(spec['meds'])} medicine(s)")

        for enc in encounters():
            profile = by_name[enc["who"]]
            when = ago(days=enc.get("days", 0), hours=enc.get("hours", 0))
            s = TriageSession(
                profile_id=profile.id, turns=enc["turns"], analysis={},
                status="closed", result_level=enc["level"].value,
                initial_text=enc["initial"], created_at=when, updated_at=when,
            )
            db.add(s)
            db.flush()

            turn = build_turn(enc, s.id, profile.display_name)
            s.result_payload = turn.model_dump(mode="json")

            payload = turn.model_dump(mode="json")
            payload["encounter_transcript"] = list(enc["turns"])
            payload["session_id"] = s.id
            db.add(TimelineEntry(
                profile_id=profile.id, kind="triage", title=enc["title"][:180],
                subtitle=enc["reason"], level=enc["level"].value,
                payload=payload, created_at=when,
            ))
            print(f"  session  {enc['who']:8} {enc['level'].value:12} {enc['title']}")

        db.commit()
        print(f"\nSeeded. Sign in with 03001234567 (stored as {PHONE}) / {PASSWORD}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
