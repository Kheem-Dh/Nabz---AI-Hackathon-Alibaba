"""Conversational triage engine.

The assistant asks ONE follow-up question at a time (in simple Urdu, addressed
to the active profile by name) and only produces a final urgency verdict when
it has enough information — with two hard rules:

1) EMERGENCY red-flags short-circuit the whole conversation. If anything the
   user says at any turn matches a red-flag (chest pain, difficulty breathing,
   unconscious, seizures, stroke signs, severe bleeding, poisoning, suicidal
   thoughts, etc.), we STOP asking and return EMERGENCY immediately.

2) At most 5 questions per session. If we're not confident by then, we force a
   RESULT and escalate to DOCTOR_24H when uncertain — never HOME_CARE.

The engine has two backends: a self-contained mock (used automatically without
credentials so the whole app is demoable) and a real Qwen call via the OpenAI-
compatible DashScope endpoint. All AI output is strict JSON, parsed safely,
and falls back to a conservative DOCTOR_24H card on any error.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from schemas import (
    CollectedFact,
    QuickReply,
    TriageAnalysis,
    TriageLevel,
    TriageTurn,
)

logger = logging.getLogger("nabz.triage")

DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"

# Model routing (winning plan §6). Env-configurable so we can flip between
# current-flagship IDs (qwen3.7-plus / qwen3.5-omni-plus) and the legacy
# defaults without editing code. If a specific env is unset, we fall back
# through a chain instead of hard-failing.
_TEXT_MODEL_CHAIN = (
    "NABZ_TEXT_MODEL",
    "QWEN_MODEL",  # kept for backwards compatibility with earlier .env files
)
_DEFAULT_TEXT_MODEL = "qwen-plus"

REQUEST_TIMEOUT_SECONDS = 20
MAX_QUESTIONS = 5


def get_model_name() -> str:
    for env_var in _TEXT_MODEL_CHAIN:
        val = os.getenv(env_var, "").strip()
        if val:
            return val
    return _DEFAULT_TEXT_MODEL


def is_mock_mode() -> bool:
    """Mock mode when explicitly requested OR no API key is present."""
    explicit = os.getenv("MOCK_MODE", "").strip().lower() in {"1", "true", "yes", "on"}
    no_key = not os.getenv("DASHSCOPE_API_KEY", "").strip()
    return explicit or no_key


# --- Emergency detection -----------------------------------------------------

_EMERGENCY_KEYWORDS = [
    # English
    "chest pain", "chest hurt", "can't breathe", "cant breathe",
    "difficulty breathing", "shortness of breath", "not breathing",
    "unconscious", "unresponsive", "severe bleeding", "bleeding a lot",
    "heavy bleeding", "seizure", "seizures", "fit", "fits", "convulsion",
    "stroke", "face drooping", "slurred speech", "one-sided weakness",
    "poison", "poisoning", "suicide", "suicidal", "kill myself",
    "end my life", "want to die", "harm myself", "hurt myself",
    "accident", "unconscious child", "heart attack",
    "not moving", "will not wake up", "won't wake up",
    "severe dehydration", "no urine",
    "pregnant" "bleeding", "reduced fetal movement", "baby not moving",
    # Roman Urdu
    "seenay mein dard", "seene mein dard", "seenay", "seene",
    "saans nahi", "saans nai", "saans nahin", "dam ghut", "dam ghutt",
    "behosh", "khoon beh", "bohot khoon", "zyada khoon",
    "daura", "mirgi", "falij", "zeher", "khudkushi", "khud kushi",
    "hadsa", "dil ka daura",
    # Urdu script
    "سینے میں درد", "سینے", "سانس نہیں", "سانس نہيں", "بے ہوش", "بےہوش",
    "خون بہہ", "خون بہ", "دورہ", "مرگی", "فالج", "زہر", "خودکشی",
    "حادثہ", "دم گھٹ", "دل کا دورہ",
]

_SUICIDAL_KEYWORDS = [
    "suicide", "suicidal", "kill myself", "end my life", "want to die",
    "harm myself", "hurt myself", "khudkushi", "khud kushi",
    "خودکشی", "اپنی جان",
]


def _lower(text: str) -> str:
    return text.lower()


def is_emergency_text(text: str) -> bool:
    lo = _lower(text)
    return any(kw in lo for kw in _EMERGENCY_KEYWORDS)


def is_suicidal_text(text: str) -> bool:
    lo = _lower(text)
    return any(kw in lo for kw in _SUICIDAL_KEYWORDS)


# --- Profile context helpers -------------------------------------------------

def _profile_context(profile: dict[str, Any]) -> str:
    """Format the active profile so the model can address them by name."""
    parts = [f"Patient name: {profile.get('display_name', 'the patient')}"]
    if profile.get("relation"):
        parts.append(f"Relation to caller: {profile['relation']}")
    if profile.get("age") is not None:
        parts.append(f"Age: {profile['age']}")
    if profile.get("gender"):
        parts.append(f"Gender: {profile['gender']}")
    if profile.get("chronic_conditions"):
        parts.append("Chronic conditions: " + ", ".join(profile["chronic_conditions"]))
    if profile.get("allergies"):
        parts.append("Allergies: " + ", ".join(profile["allergies"]))
    if profile.get("current_medicines"):
        parts.append("Current medicines: " + ", ".join(profile["current_medicines"]))
    return "\n".join(parts)


# --- System prompt (real Qwen path) ------------------------------------------

SYSTEM_PROMPT = """\
You are "Nabz" (نبض) — a caring health-triage assistant for Pakistani families,
communicating primarily in simple spoken Urdu. Your job is to gather just
enough information to classify how urgently the patient needs a real clinician,
then either ask ONE more question or return a final result.

STRICT RULES:
- Always ADDRESS THE PATIENT BY NAME in Urdu. The name is given below.
- Ask ONE question at a time — the single most useful question given what you
  already know. Keep it short and simple, in spoken Urdu.
- Provide 2–4 tappable quick replies for low-literacy users
  (e.g., ہاں / نہیں / پتہ نہیں), each with its English label too.
- NEVER diagnose a disease. NEVER prescribe or name a medicine.
- Only three urgency levels: EMERGENCY, DOCTOR_24H, HOME_CARE.
- When uncertain, escalate to the more urgent level.
- Do NOT keep asking after 5 total questions — force a result.
- If the patient description contains any red-flag (chest pain, difficulty
  breathing, unconsciousness, severe bleeding, seizures, stroke signs,
  severe dehydration in a child, high fever in an infant under 3 months,
  pregnancy complications, poisoning, suicidal thoughts, or serious injury),
  return EMERGENCY immediately — do not ask more questions.

For SUICIDAL THOUGHTS: respond with warmth. Urge the person to contact a
trusted person and local emergency services right now. Do NOT lecture. Do NOT
discuss methods.

INPUT: You receive the patient profile, the conversation so far, and a running
analysis. You may see Urdu, Roman Urdu, or English.

OUTPUT — STRICT JSON only, no markdown, no commentary. Two shapes:

Question turn:
{
  "type": "question",
  "question_urdu": "…one short spoken-Urdu question, addressed by name…",
  "question_english": "…faithful English translation…",
  "quick_replies": [ {"urdu":"ہاں","english":"Yes"}, {"urdu":"نہیں","english":"No"} ],
  "analysis": {
    "collected": [
      {"label_urdu":"…","label_english":"…","value_urdu":"…","value_english":"…"}
    ],
    "still_checking_urdu": "…what you're still trying to establish, in Urdu…",
    "still_checking_english": "…same in English…",
    "confidence": 0.0
  }
}

Result turn:
{
  "type": "result",
  "level": "EMERGENCY" | "DOCTOR_24H" | "HOME_CARE",
  "advice_urdu": "2–4 short spoken-Urdu sentences addressed by name, ending with a reminder to see a real doctor",
  "advice_english": "faithful English translation of advice_urdu",
  "reason_english": "ONE sentence explaining the classification, referencing the profile where relevant",
  "analysis": {
    "collected": [ ... same shape as above ... ],
    "still_checking_urdu": "",
    "still_checking_english": "",
    "confidence": 0.0-1.0
  }
}

Reason_english MUST visibly reflect any personalization (e.g., existing
diabetes, age, pregnancy, chronic condition). Never give generic un-addressed
advice when a profile is provided.
"""


# --- Mock conversational engine ---------------------------------------------

# Canonical Urdu bits we reuse a lot.
_YES_NO = [
    QuickReply(urdu="ہاں", english="Yes"),
    QuickReply(urdu="نہیں", english="No"),
    QuickReply(urdu="پتہ نہیں", english="Don't know"),
]

_DURATION_REPLIES = [
    QuickReply(urdu="آج ہی", english="Today"),
    QuickReply(urdu="2–3 دن", english="2–3 days"),
    QuickReply(urdu="ایک ہفتہ سے", english="A week"),
    QuickReply(urdu="زیادہ دن", english="Longer"),
]


def _name_ur(profile: dict[str, Any]) -> str:
    return profile.get("display_name") or "آپ"


def _addressed(profile: dict[str, Any], sentence_ur: str) -> str:
    name = _name_ur(profile)
    return f"{name}، {sentence_ur}"


def _looks_severe(text: str) -> bool:
    lo = _lower(text)
    return any(
        w in lo
        for w in [
            "severe", "very high", "bohot", "بہت", "شدید", "tez", "تیز",
            "worse", "worst", "cant sleep", "won't eat", "not eating",
        ]
    )


def _has_fever(text: str) -> bool:
    lo = _lower(text)
    return any(w in lo for w in ["fever", "bukhar", "بخار", "temperature"])


def _has_cough(text: str) -> bool:
    lo = _lower(text)
    return any(w in lo for w in ["cough", "khansi", "کھانسی"])


def _has_vomiting(text: str) -> bool:
    lo = _lower(text)
    return any(w in lo for w in ["vomit", "ulti", "الٹی"])


def _has_diarrhea(text: str) -> bool:
    lo = _lower(text)
    return any(w in lo for w in ["diarr", "dast", "دست"])


def _has_pain(text: str) -> bool:
    lo = _lower(text)
    return any(w in lo for w in ["pain", "dard", "درد", "ache"])


def _has_mild_marker(text: str) -> bool:
    lo = _lower(text)
    return any(
        w in lo for w in [
            "mild", "slight", "halka", "ہلکا", "zukam", "زکام", "runny nose",
            "sneez", "چھینک", "cold",
        ]
    )


def _joined_answers(turns: list[dict]) -> str:
    parts = [t.get("text", "") for t in turns if t.get("role") == "user"]
    return " \n".join(parts)


def _first_symptom(turns: list[dict]) -> str:
    for t in turns:
        if t.get("role") == "user":
            return t.get("text", "")
    return ""


def _emergency_turn(profile: dict[str, Any], session_id: int, turns: list[dict], suicidal: bool) -> TriageTurn:
    name = _name_ur(profile)
    if suicidal:
        advice_ur = (
            f"{name}, آپ اکیلے نہیں ہیں اور آپ کی زندگی قیمتی ہے۔ ابھی کسی "
            "قابلِ اعتماد شخص سے بات کریں اور ریسکیو 1122 کو کال کریں۔ برائے "
            "مہربانی فوراً کسی ڈاکٹر یا ہسپتال سے رابطہ کریں۔"
        )
        advice_en = (
            f"{profile.get('display_name', 'You')} — you are not alone and "
            "your life matters. Please reach out to someone you trust right "
            "now and call Rescue 1122. Please contact a doctor or hospital "
            "immediately."
        )
        reason = (
            f"Expressed suicidal thoughts — always an emergency requiring "
            "immediate human and medical support."
        )
    else:
        advice_ur = (
            f"{name}، یہ ہنگامی صورتحال لگتی ہے۔ فوراً قریبی ہسپتال جائیں یا "
            "ریسکیو 1122 کو کال کریں۔ دوا یا انتظار پر وقت ضائع نہ کریں۔ "
            "براہِ کرم فوراً ڈاکٹر سے رجوع کریں۔"
        )
        advice_en = (
            f"{profile.get('display_name', 'You')} — this looks like an "
            "emergency. Go to the nearest hospital right now or call Rescue "
            "1122. Do not delay on medicine or waiting. Please see a doctor "
            "immediately."
        )
        reason = (
            "A red-flag symptom (e.g. chest pain, difficulty breathing, "
            "unconsciousness, severe bleeding, seizures, stroke signs, "
            "poisoning) was reported — auto-escalated to EMERGENCY without "
            "further questions."
        )

    analysis = TriageAnalysis(
        collected=_collect_from_turns(turns),
        still_checking_urdu="",
        still_checking_english="",
        confidence=0.98,
        questions_asked=_count_questions(turns),
    )
    return TriageTurn(
        type="result",
        session_id=session_id,
        patient_name=profile.get("display_name", ""),
        level=TriageLevel.EMERGENCY,
        advice_urdu=advice_ur,
        advice_english=advice_en,
        reason_english=reason,
        analysis=analysis,
        mock=True,
    )


def _collect_from_turns(turns: list[dict]) -> list[CollectedFact]:
    """Best-effort mock analysis: pull duration / symptoms from the transcript."""
    text = _joined_answers(turns)
    lo = _lower(text)
    out: list[CollectedFact] = []

    if _has_fever(text):
        out.append(
            CollectedFact(
                label_urdu="علامت", label_english="Symptom",
                value_urdu="بخار", value_english="Fever",
            )
        )
    if _has_cough(text):
        out.append(
            CollectedFact(
                label_urdu="علامت", label_english="Symptom",
                value_urdu="کھانسی", value_english="Cough",
            )
        )
    if _has_vomiting(text):
        out.append(
            CollectedFact(
                label_urdu="علامت", label_english="Symptom",
                value_urdu="الٹی", value_english="Vomiting",
            )
        )
    if _has_diarrhea(text):
        out.append(
            CollectedFact(
                label_urdu="علامت", label_english="Symptom",
                value_urdu="دست", value_english="Diarrhoea",
            )
        )
    if _has_pain(text):
        out.append(
            CollectedFact(
                label_urdu="علامت", label_english="Symptom",
                value_urdu="درد", value_english="Pain",
            )
        )

    m = re.search(r"(\d+)\s*(?:day|din|dinon|days|دن)", lo)
    if m:
        n = m.group(1)
        out.append(
            CollectedFact(
                label_urdu="دورانیہ", label_english="Duration",
                value_urdu=f"{n} دن", value_english=f"{n} days",
            )
        )
    elif "week" in lo or "hafta" in lo or "ہفتہ" in lo:
        out.append(
            CollectedFact(
                label_urdu="دورانیہ", label_english="Duration",
                value_urdu="ایک ہفتہ", value_english="A week",
            )
        )
    elif "today" in lo or "aaj" in lo or "آج" in lo:
        out.append(
            CollectedFact(
                label_urdu="دورانیہ", label_english="Duration",
                value_urdu="آج", value_english="Today",
            )
        )

    # Deduplicate while preserving order.
    seen = set()
    unique: list[CollectedFact] = []
    for f in out:
        key = (f.label_english, f.value_english)
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique


def _count_questions(turns: list[dict]) -> int:
    return sum(1 for t in turns if t.get("role") == "assistant" and t.get("kind") == "question")


def _mock_question(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    """Pick the next best mock question given what we know so far."""
    name = _name_ur(profile)
    asked = _count_questions(turns)
    text_so_far = _joined_answers(turns) + " " + _first_symptom(turns)
    lo = _lower(text_so_far)

    known_duration = bool(re.search(r"(\d+)\s*(day|din|days|دن)", lo)) or any(
        w in lo for w in ["today", "aaj", "آج", "week", "hafta", "ہفتہ"]
    )
    asked_breathing = any(
        "سانس" in (t.get("text") or "") or "breath" in (t.get("text", "")).lower()
        for t in turns if t.get("role") == "assistant"
    )
    asked_vomit = any(
        "الٹی" in (t.get("text") or "") or "vomit" in (t.get("text", "")).lower()
        for t in turns if t.get("role") == "assistant"
    )

    # Choose the question.
    if not known_duration:
        q_ur = f"{name}، یہ تکلیف کتنے دن سے ہے؟"
        q_en = f"{profile.get('display_name','You')}, how many days has this been going on?"
        quick = _DURATION_REPLIES
        still_ur = "دورانیہ معلوم کر رہا ہوں۔"
        still_en = "Establishing how long this has been going on."
        conf = 0.15
    elif not asked_breathing:
        q_ur = f"{name}، کیا سانس لینے میں دشواری یا سینے میں بھاری پن ہے؟"
        q_en = (
            f"{profile.get('display_name','You')}, is there any difficulty "
            "breathing or heaviness in the chest?"
        )
        quick = _YES_NO
        still_ur = "خطرے کی علامات جانچ رہا ہوں۔"
        still_en = "Checking for red-flag symptoms."
        conf = 0.35
    elif not asked_vomit:
        q_ur = f"{name}، کیا الٹی، دست یا کچھ کھانے پینے میں دقت ہے؟"
        q_en = (
            f"{profile.get('display_name','You')}, is there vomiting, "
            "diarrhoea, or trouble eating and drinking?"
        )
        quick = _YES_NO
        still_ur = "پانی کی کمی کا خطرہ جانچ رہا ہوں۔"
        still_en = "Checking dehydration risk."
        conf = 0.5
    else:
        # Ask about worsening / associated pain as the last narrowing question.
        q_ur = f"{name}، کیا تکلیف بڑھ رہی ہے یا وقت کے ساتھ کم ہو رہی ہے؟"
        q_en = (
            f"{profile.get('display_name','You')}, is this getting worse over "
            "time or slowly getting better?"
        )
        quick = [
            QuickReply(urdu="بڑھ رہی ہے", english="Getting worse"),
            QuickReply(urdu="جیسی تھی ویسی ہے", english="About the same"),
            QuickReply(urdu="کم ہو رہی ہے", english="Getting better"),
        ]
        still_ur = "شدت کا اندازہ لگا رہا ہوں۔"
        still_en = "Judging severity trend."
        conf = 0.65

    analysis = TriageAnalysis(
        collected=_collect_from_turns(turns),
        still_checking_urdu=still_ur,
        still_checking_english=still_en,
        confidence=conf,
        questions_asked=asked,
    )
    return TriageTurn(
        type="question",
        session_id=session_id,
        patient_name=profile.get("display_name", ""),
        question_urdu=q_ur,
        question_english=q_en,
        quick_replies=quick,
        analysis=analysis,
        mock=True,
    )


def _mock_result(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    """Decide the final level from mock collected evidence."""
    name = _name_ur(profile)
    text = _joined_answers(turns) + " " + _first_symptom(turns)
    lo = _lower(text)

    chronic = [c.lower() for c in profile.get("chronic_conditions", [])]
    is_diabetic = any("diabet" in c or "شوگر" in c for c in chronic)
    is_hypertensive = any("hyper" in c or "bp" in c or "بلڈ" in c for c in chronic)

    breathing_answered_yes = any(
        (
            "سانس" in (t.get("text") or "") or "breath" in (t.get("text", "")).lower()
        )
        and any(w in _lower(t.get("text", "")) for w in ["yes", "ہاں", "haan"])
        for t in turns
        if t.get("role") == "user"
    )
    worsening = "worse" in lo or "بڑھ" in lo

    # Late-turn escalation via new info.
    if breathing_answered_yes:
        return _emergency_turn(profile, session_id, turns, suicidal=False)

    level = TriageLevel.HOME_CARE
    reason = "Only mild symptoms reported with no red flags."

    if _has_fever(text) or _has_pain(text) or _has_vomiting(text) or _has_diarrhea(text):
        level = TriageLevel.DOCTOR_24H
        reason = "Fever / pain / GI symptoms warrant clinical review within 24 hours."

    if _has_mild_marker(text) and not (_has_pain(text) or _has_vomiting(text)):
        level = TriageLevel.HOME_CARE
        reason = "Mild cold-type symptoms with no red flags — suitable for home care."

    if _looks_severe(text) and level == TriageLevel.HOME_CARE:
        level = TriageLevel.DOCTOR_24H
        reason = "Patient described symptoms as severe / worsening."

    # Personalized escalation from chronic conditions.
    if level == TriageLevel.HOME_CARE and (is_diabetic or is_hypertensive):
        level = TriageLevel.DOCTOR_24H
        reason = (
            f"Escalated because {profile.get('display_name','the patient')} has "
            f"{', '.join(profile.get('chronic_conditions', []))} — even mild "
            "illness deserves earlier medical review."
        )

    if worsening and level != TriageLevel.EMERGENCY:
        level = TriageLevel.DOCTOR_24H
        reason = f"{profile.get('display_name','The patient')} reports symptoms are worsening."

    if level == TriageLevel.HOME_CARE:
        advice_ur = (
            f"{name}، یہ ایک معمولی مسئلہ لگتا ہے۔ آرام کریں، زیادہ پانی پئیں اور "
            "ہلکی غذا کھائیں۔ اگر دو دن میں بہتر نہ ہو تو ڈاکٹر سے ملیں۔ یاد "
            "رکھیں، یہ ڈاکٹر کا متبادل نہیں ہے۔"
        )
        advice_en = (
            f"{profile.get('display_name','You')}, this looks like a minor "
            "issue. Rest, drink plenty of water, and eat light food. If it "
            "doesn't improve in two days, see a doctor. Remember, this is not "
            "a substitute for a doctor."
        )
    elif level == TriageLevel.DOCTOR_24H:
        advice_ur = (
            f"{name}، کل صبح تک قریبی کلینک جائیں۔ زیادہ پانی پلائیں اور بخار "
            "یا درد کی دوا وقت پر دیں۔ یاد رکھیں، یہ ڈاکٹر کا متبادل نہیں ہے۔"
        )
        advice_en = (
            f"{profile.get('display_name','You')} — visit a nearby clinic by "
            "tomorrow morning. Give plenty of water and fever medicine on "
            "time. Remember, this is not a substitute for a doctor."
        )
    else:  # EMERGENCY handled above; safety net:
        return _emergency_turn(profile, session_id, turns, suicidal=False)

    analysis = TriageAnalysis(
        collected=_collect_from_turns(turns),
        still_checking_urdu="",
        still_checking_english="",
        confidence=0.9,
        questions_asked=_count_questions(turns),
    )
    return TriageTurn(
        type="result",
        session_id=session_id,
        patient_name=profile.get("display_name", ""),
        level=level,
        advice_urdu=advice_ur,
        advice_english=advice_en,
        reason_english=reason,
        analysis=analysis,
        mock=True,
    )


def _mock_non_health_result(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    name = _name_ur(profile)
    advice_ur = (
        f"{name}، یہ ایپ صحت کے مشورے کے لیے ہے۔ برائے مہربانی اپنی علامت "
        "بیان کریں، جیسے بخار، درد یا کھانسی۔ کسی بھی پریشانی میں ڈاکٹر سے "
        "رجوع کریں۔"
    )
    advice_en = (
        f"{profile.get('display_name','You')} — this app is for health "
        "advice. Please describe your symptoms, e.g., fever, pain, or cough. "
        "For any concern, consult a doctor."
    )
    return TriageTurn(
        type="result",
        session_id=session_id,
        patient_name=profile.get("display_name", ""),
        level=TriageLevel.HOME_CARE,
        advice_urdu=advice_ur,
        advice_english=advice_en,
        reason_english="Input did not describe a clear health symptom.",
        analysis=TriageAnalysis(
            collected=[], still_checking_urdu="", still_checking_english="",
            confidence=0.4, questions_asked=_count_questions(turns),
        ),
        mock=True,
    )


def mock_next_turn(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    """Decide the next mock turn: emergency short-circuit → question → result."""
    latest_user = ""
    for t in reversed(turns):
        if t.get("role") == "user":
            latest_user = t.get("text", "")
            break
    all_user = _joined_answers(turns)

    if is_suicidal_text(all_user):
        return _emergency_turn(profile, session_id, turns, suicidal=True)
    if is_emergency_text(all_user):
        return _emergency_turn(profile, session_id, turns, suicidal=False)

    asked = _count_questions(turns)

    # Non-health input on the very first turn: gently redirect.
    if asked == 0:
        if not _has_any_health_keyword(latest_user):
            return _mock_non_health_result(profile, session_id, turns)

    # Question ceiling: force a result on the 5th question or later.
    if asked >= MAX_QUESTIONS:
        return _mock_result(profile, session_id, turns)

    # Enough info once we have 3 answered questions or clear picture.
    answered = sum(1 for t in turns if t.get("role") == "user") - 1  # minus initial symptom
    if answered >= 3:
        return _mock_result(profile, session_id, turns)

    return _mock_question(profile, session_id, turns)


def _has_any_health_keyword(text: str) -> bool:
    lo = _lower(text)
    keywords = [
        "fever", "pain", "cough", "vomit", "diarr", "sick", "hurt", "ache",
        "breath", "dizzy", "rash", "bleed", "swell", "burn", "faint", "child",
        "baby", "pregnan", "wound", "injur",
        "bukhar", "dard", "khansi", "ulti", "dast", "chakkar", "beemar",
        "بخار", "درد", "کھانسی", "الٹی", "دست", "چکر", "بیمار", "زخم",
        "زکام", "cold", "zukam",
    ]
    return any(k in lo for k in keywords)


# --- Real Qwen path ----------------------------------------------------------

def _strip_fences(raw: str) -> str:
    t = raw.strip()
    t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _safe_fallback(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    name = _name_ur(profile)
    return TriageTurn(
        type="result",
        session_id=session_id,
        patient_name=profile.get("display_name", ""),
        level=TriageLevel.DOCTOR_24H,
        advice_urdu=(
            f"{name}، حفاظت کے لیے کسی ڈاکٹر یا قریبی کلینک سے رجوع کریں۔ اگر "
            "حالت بگڑے تو فوراً ہسپتال جائیں۔ یاد رکھیں، یہ ڈاکٹر کا متبادل "
            "نہیں ہے۔"
        ),
        advice_english=(
            f"{profile.get('display_name','You')} — to be safe, please see a "
            "doctor or a nearby clinic. If things get worse, go to a hospital "
            "immediately."
        ),
        reason_english="Fallback response used because the model output could not be trusted.",
        analysis=TriageAnalysis(
            collected=_collect_from_turns(turns),
            still_checking_urdu="", still_checking_english="",
            confidence=0.3, questions_asked=_count_questions(turns),
        ),
        mock=False,
    )


def _turn_from_qwen_json(
    data: dict, profile: dict[str, Any], session_id: int, turns: list[dict]
) -> TriageTurn:
    ttype = str(data.get("type", "")).lower().strip()
    if ttype not in {"question", "result"}:
        raise ValueError(f"invalid_type:{ttype}")

    raw_analysis = data.get("analysis") or {}
    collected_raw = raw_analysis.get("collected") or []
    collected: list[CollectedFact] = []
    for c in collected_raw:
        try:
            collected.append(
                CollectedFact(
                    label_urdu=str(c.get("label_urdu", "")).strip(),
                    label_english=str(c.get("label_english", "")).strip(),
                    value_urdu=str(c.get("value_urdu", "")).strip(),
                    value_english=str(c.get("value_english", "")).strip(),
                )
            )
        except Exception:  # noqa: BLE001
            continue

    analysis = TriageAnalysis(
        collected=collected,
        still_checking_urdu=str(raw_analysis.get("still_checking_urdu", "")).strip(),
        still_checking_english=str(raw_analysis.get("still_checking_english", "")).strip(),
        confidence=float(raw_analysis.get("confidence", 0.0) or 0.0),
        questions_asked=_count_questions(turns),
    )

    if ttype == "question":
        q_ur = str(data.get("question_urdu", "")).strip()
        q_en = str(data.get("question_english", "")).strip()
        if not q_ur:
            raise ValueError("missing_question_urdu")
        quick: list[QuickReply] = []
        for q in data.get("quick_replies") or []:
            try:
                quick.append(
                    QuickReply(
                        urdu=str(q.get("urdu", "")).strip(),
                        english=str(q.get("english", "")).strip(),
                    )
                )
            except Exception:  # noqa: BLE001
                continue
        return TriageTurn(
            type="question",
            session_id=session_id,
            patient_name=profile.get("display_name", ""),
            question_urdu=q_ur,
            question_english=q_en,
            quick_replies=quick,
            analysis=analysis,
            mock=False,
        )

    level_raw = str(data.get("level", "")).upper().strip()
    if level_raw not in {l.value for l in TriageLevel}:
        raise ValueError(f"invalid_level:{level_raw}")
    return TriageTurn(
        type="result",
        session_id=session_id,
        patient_name=profile.get("display_name", ""),
        level=TriageLevel(level_raw),
        advice_urdu=str(data.get("advice_urdu", "")).strip(),
        advice_english=str(data.get("advice_english", "")).strip(),
        reason_english=str(data.get("reason_english", "")).strip(),
        analysis=analysis,
        mock=False,
    )


def qwen_next_turn(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    """Ask Qwen for the next conversational turn."""
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    model = get_model_name()

    # Client-side emergency short-circuit — never let the model delay a red-flag.
    all_user = _joined_answers(turns)
    if is_suicidal_text(all_user):
        return _emergency_turn(profile, session_id, turns, suicidal=True)
    if is_emergency_text(all_user):
        return _emergency_turn(profile, session_id, turns, suicidal=False)

    asked = _count_questions(turns)
    # Hard question ceiling regardless of what the model wants.
    force_result = asked >= MAX_QUESTIONS

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.append(
        {
            "role": "system",
            "content": (
                "Active patient profile (address the patient by name in Urdu):\n"
                + _profile_context(profile)
                + (
                    "\n\nThis is the final allowed turn — you MUST respond "
                    "with a result (not a question)."
                    if force_result
                    else ""
                )
            ),
        }
    )
    for t in turns:
        role = "assistant" if t.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": t.get("text", "")})

    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key,
            base_url=DASHSCOPE_BASE_URL,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        logger.error("Qwen call failed: %s", exc, exc_info=True)
        return _safe_fallback(profile, session_id, turns)

    try:
        data = json.loads(_strip_fences(raw))
        turn = _turn_from_qwen_json(data, profile, session_id, turns)
    except Exception as exc:  # noqa: BLE001
        logger.error("Qwen parse failed (%s). Raw: %s", exc, raw)
        return _safe_fallback(profile, session_id, turns)

    # Enforce the question ceiling on the server side even if the model missed.
    if force_result and turn.type == "question":
        logger.info("Forcing result on turn ceiling; converting question to safe fallback.")
        return _safe_fallback(profile, session_id, turns)

    return turn


# --- Public entry point ------------------------------------------------------

_FACILITY_INTENT_BY_LEVEL = {
    TriageLevel.EMERGENCY: "emergency_hospital",
    TriageLevel.DOCTOR_24H: "clinic_or_bhu",
    TriageLevel.HOME_CARE: "optional",
}


def _attach_facility_intent(turn: TriageTurn) -> TriageTurn:
    if turn.type == "result" and turn.level and not turn.facility_intent:
        turn.facility_intent = _FACILITY_INTENT_BY_LEVEL.get(turn.level, "optional")
    return turn


def next_turn(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    """Route to the mock or real backend based on config."""
    turn = (
        mock_next_turn(profile, session_id, turns)
        if is_mock_mode()
        else qwen_next_turn(profile, session_id, turns)
    )
    return _attach_facility_intent(turn)
