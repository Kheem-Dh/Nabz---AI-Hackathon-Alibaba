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
import time
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
- Every question must be directly related to the chief complaint or the
  patient's latest answer. Do not repeat information the patient already gave.
- Do NOT default to a breathing question for unrelated complaints. Ask about
  breathing only when the complaint makes it relevant (for example cough,
  chest symptoms, fever with systemic illness, or a reported breathing change).
- For a skin mark, rash, redness, or swelling, first clarify onset, pain/itch,
  spreading, warmth/swelling, and fever using familiar lay words.
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


def _has_skin_change(text: str) -> bool:
    """Recognize common lay descriptions of a visible skin change."""
    lo = _lower(text)
    return any(
        w in lo
        for w in [
            "rash", "red mark", "red spot", "redness", "skin mark",
            "itch", "itchy", "swelling", "spots", "spot",
            "surkh nishan", "laal nishan", "lal nishan", "nishan",
            "daane", "danay", "kharish", "soojan", "jild",
            "سرخ نشان", "لال نشان", "نشان", "دانے", "خارش", "سوجن", "جلد",
        ]
    )


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


def _has_known_duration(text: str) -> bool:
    lo = _lower(text)
    if re.search(r"\b\d+\s*(?:day|days|din|dinon|دن|week|weeks|hafta|ہفتہ)", lo):
        return True
    return any(
        marker in lo
        for marker in [
            "today", "aaj", "آج", "yesterday", "kal se", "کل سے",
            "week", "hafta", "ہفتہ", "month", "mahina", "مہینہ",
            "aik din", "ek din", "do din", "teen din", "char din", "panch din",
        ]
    )


def _complaint_kind(text: str) -> str:
    if _has_skin_change(text):
        return "skin"
    if _has_fever(text):
        return "fever"
    if _has_cough(text) or _has_mild_marker(text):
        return "respiratory"
    if _has_vomiting(text) or _has_diarrhea(text):
        return "stomach"
    if _has_pain(text):
        return "pain"
    return "general"


def _assistant_questions(turns: list[dict]) -> str:
    return " \n".join(
        t.get("text", "")
        for t in turns
        if t.get("role") == "assistant" and t.get("kind") == "question"
    ).lower()


def _latest_answer_affirms_breathing_problem(turns: list[dict]) -> bool:
    """Treat a plain "yes" to a breathing question as a deterministic red flag."""
    latest_user_index = next(
        (i for i in range(len(turns) - 1, -1, -1) if turns[i].get("role") == "user"),
        None,
    )
    if latest_user_index is None or latest_user_index == 0:
        return False

    answer = _lower(turns[latest_user_index].get("text", "")).strip(" .!?،")
    if any(negative in answer for negative in ["no", "nahi", "nahin", "نہیں", "نہيں"]):
        return False
    affirmative = answer in {"yes", "haan", "han", "ha", "ہاں", "جی", "جی ہاں"}
    if not affirmative:
        return False

    previous = turns[latest_user_index - 1]
    if previous.get("role") != "assistant" or previous.get("kind") != "question":
        return False
    question = _lower(previous.get("text", ""))
    return any(
        marker in question
        for marker in ["سانس", "breath", "دم گھٹ", "shortness of breath"]
    )


def _body_location(text: str) -> tuple[str, str] | None:
    lo = _lower(text)
    locations = [
        (["right arm", "right bazu", "daya bazu", "dahna bazu", "دایاں بازو"], "دایاں بازو", "Right arm"),
        (["left arm", "left bazu", "baya bazu", "بایاں بازو"], "بایاں بازو", "Left arm"),
        (["right leg", "right tang", "dayi tang", "دایاں ٹانگ", "دائیں ٹانگ"], "دائیں ٹانگ", "Right leg"),
        (["left leg", "left tang", "bayi tang", "بایاں ٹانگ", "بائیں ٹانگ"], "بائیں ٹانگ", "Left leg"),
        (["face", "chehra", "چہر"], "چہرہ", "Face"),
        (["hand", "haath", "ہاتھ"], "ہاتھ", "Hand"),
        (["foot", "paon", "paaon", "پاؤں"], "پاؤں", "Foot"),
    ]
    for markers, urdu, english in locations:
        if any(marker in lo for marker in markers):
            return urdu, english
    return None


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
    if _has_skin_change(text):
        out.append(
            CollectedFact(
                label_urdu="علامت", label_english="Symptom",
                value_urdu="جلد پر نشان یا سرخی", value_english="Skin mark or redness",
            )
        )

    location = _body_location(text)
    if location:
        location_urdu, location_english = location
        out.append(
            CollectedFact(
                label_urdu="جگہ", label_english="Location",
                value_urdu=location_urdu, value_english=location_english,
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
    """Pick a complaint-specific next question from the conversation so far."""
    name = _name_ur(profile)
    asked = _count_questions(turns)
    initial = _first_symptom(turns)
    text_so_far = _joined_answers(turns)
    kind = _complaint_kind(initial)
    asked_text = _assistant_questions(turns)

    if not _has_known_duration(text_so_far) and not any(
        marker in asked_text for marker in ["کب سے", "کتنے دن", "how long"]
    ):
        if kind == "skin":
            q_ur = f"{name}، یہ سرخ نشان کب سے ہے؟"
            q_en = f"{profile.get('display_name','You')}, how long has this red mark been there?"
        else:
            q_ur = f"{name}، یہ تکلیف کب سے ہے؟"
            q_en = f"{profile.get('display_name','You')}, how long has this problem been present?"
        quick = _DURATION_REPLIES
        still_ur = "دورانیہ معلوم کر رہا ہوں۔"
        still_en = "Establishing the duration of this complaint."
        conf = 0.18
    else:
        skin_replies = [
            QuickReply(urdu="صرف نشان ہے", english="Just a mark"),
            QuickReply(urdu="خارش ہے", english="Itchy"),
            QuickReply(urdu="درد ہے", english="Painful"),
            QuickReply(urdu="پھیل رہا ہے", english="Spreading"),
        ]
        severity_replies = [
            QuickReply(urdu="ہلکی", english="Mild"),
            QuickReply(urdu="درمیانی", english="Moderate"),
            QuickReply(urdu="شدید", english="Severe"),
            QuickReply(urdu="پتہ نہیں", english="Don't know"),
        ]
        question_sets: dict[str, list[tuple[list[str], str, str, list[QuickReply], str, str]]] = {
            "skin": [
                (
                    ["خارش", "itch", "پھیل", "spread"],
                    f"{name}، کیا اس نشان میں خارش یا درد ہے، یا یہ پھیل رہا ہے؟",
                    f"{profile.get('display_name','You')}, is the mark itchy, painful, or spreading?",
                    skin_replies,
                    "نشان کی تکلیف اور پھیلاؤ دیکھ رہا ہوں۔",
                    "Checking discomfort and whether the mark is spreading.",
                ),
                (
                    ["گرم", "warm", "سوج", "swollen"],
                    f"{name}، کیا یہ جگہ گرم یا سوجی ہوئی ہے، یا ساتھ بخار ہے؟",
                    f"{profile.get('display_name','You')}, is the area warm or swollen, or is there a fever?",
                    [
                        QuickReply(urdu="نہیں", english="No"),
                        QuickReply(urdu="گرم ہے", english="Warm"),
                        QuickReply(urdu="سوجن ہے", english="Swollen"),
                        QuickReply(urdu="بخار بھی ہے", english="Also fever"),
                    ],
                    "سوجن، گرمی اور بخار دیکھ رہا ہوں۔",
                    "Checking for swelling, warmth, and fever.",
                ),
                (
                    ["چوٹ", "injury", "کیڑے", "insect"],
                    f"{name}، کیا وہاں چوٹ لگی تھی یا کیڑے نے کاٹا تھا؟",
                    f"{profile.get('display_name','You')}, was there an injury or an insect bite there?",
                    _YES_NO,
                    "نشان سے پہلے ہونے والی بات معلوم کر رہا ہوں۔",
                    "Checking what happened before the mark appeared.",
                ),
            ],
            "fever": [
                (
                    ["درجہ حرارت", "temperature"],
                    f"{name}، کیا بخار ناپا ہے، اور کتنا تھا؟",
                    f"{profile.get('display_name','You')}, was the temperature measured, and how high was it?",
                    [
                        QuickReply(urdu="نہیں ناپا", english="Not measured"),
                        QuickReply(urdu="100°F سے کم", english="Below 100°F"),
                        QuickReply(urdu="100–102°F", english="100–102°F"),
                        QuickReply(urdu="102°F سے زیادہ", english="Above 102°F"),
                    ],
                    "بخار کی شدت معلوم کر رہا ہوں۔",
                    "Checking how high the fever is.",
                ),
                (
                    ["پانی", "water", "پیشاب", "urine"],
                    f"{name}، کیا پانی پی رہے ہیں اور پیشاب معمول کے مطابق آ رہا ہے؟",
                    f"{profile.get('display_name','You')}, are you drinking fluids and passing urine normally?",
                    _YES_NO,
                    "پانی کی کمی کی علامات دیکھ رہا ہوں۔",
                    "Checking hydration.",
                ),
                (
                    ["کھانسی", "cough", "دانے", "rash"],
                    f"{name}، کیا بخار کے ساتھ کھانسی، درد یا جلد پر دانے بھی ہیں؟",
                    f"{profile.get('display_name','You')}, is there also cough, pain, or a skin rash with the fever?",
                    _YES_NO,
                    "بخار کے ساتھ دوسری علامات دیکھ رہا ہوں۔",
                    "Checking symptoms accompanying the fever.",
                ),
            ],
            "respiratory": [
                (
                    ["سانس", "breath"],
                    f"{name}، کیا کھانسی کے ساتھ سانس لینے میں دشواری ہے؟",
                    f"{profile.get('display_name','You')}, is the cough accompanied by difficulty breathing?",
                    _YES_NO,
                    "سانس کی حالت دیکھ رہا ہوں۔",
                    "Checking breathing because of the respiratory complaint.",
                ),
                (
                    ["بخار", "fever", "بلغم", "phlegm"],
                    f"{name}، کیا ساتھ بخار یا بلغم بھی ہے؟",
                    f"{profile.get('display_name','You')}, is there also fever or phlegm?",
                    _YES_NO,
                    "کھانسی کے ساتھ دوسری علامات دیکھ رہا ہوں۔",
                    "Checking symptoms accompanying the cough.",
                ),
                (
                    ["بڑھ", "worse"],
                    f"{name}، کیا کھانسی بڑھ رہی ہے یا کم ہو رہی ہے؟",
                    f"{profile.get('display_name','You')}, is the cough getting worse or improving?",
                    severity_replies,
                    "کھانسی کی تبدیلی دیکھ رہا ہوں۔",
                    "Checking how the cough is changing.",
                ),
            ],
            "stomach": [
                (
                    ["پانی", "water", "پیشاب", "urine"],
                    f"{name}، کیا پانی رک رہا ہے اور پیشاب معمول کے مطابق آ رہا ہے؟",
                    f"{profile.get('display_name','You')}, can you keep fluids down and pass urine normally?",
                    _YES_NO,
                    "پانی کی کمی کی علامات دیکھ رہا ہوں۔",
                    "Checking hydration.",
                ),
                (
                    ["خون", "blood", "شدید درد", "severe pain"],
                    f"{name}، کیا الٹی یا پاخانے میں خون، یا پیٹ میں شدید درد ہے؟",
                    f"{profile.get('display_name','You')}, is there blood in vomit or stool, or severe stomach pain?",
                    _YES_NO,
                    "سنگین علامات دیکھ رہا ہوں۔",
                    "Checking for serious associated symptoms.",
                ),
                (
                    ["کتنی بار", "how many times"],
                    f"{name}، آج الٹی یا دست کتنی بار ہوئے؟",
                    f"{profile.get('display_name','You')}, how many times have vomiting or diarrhoea occurred today?",
                    severity_replies,
                    "علامات کی تعداد معلوم کر رہا ہوں۔",
                    "Checking how frequent the symptoms are.",
                ),
            ],
            "pain": [
                (
                    ["کتنا شدید", "how severe"],
                    f"{name}، درد کتنا شدید ہے؟",
                    f"{profile.get('display_name','You')}, how severe is the pain?",
                    severity_replies,
                    "درد کی شدت معلوم کر رہا ہوں۔",
                    "Checking pain severity.",
                ),
                (
                    ["حرکت", "movement", "سوج", "swelling"],
                    f"{name}، کیا حرکت کرنے میں مشکل یا وہاں سوجن ہے؟",
                    f"{profile.get('display_name','You')}, is movement difficult or is there swelling?",
                    _YES_NO,
                    "حرکت اور سوجن دیکھ رہا ہوں۔",
                    "Checking movement and swelling.",
                ),
                (
                    ["بڑھ", "worse"],
                    f"{name}، کیا درد بڑھ رہا ہے یا کم ہو رہا ہے؟",
                    f"{profile.get('display_name','You')}, is the pain getting worse or improving?",
                    severity_replies,
                    "درد کی تبدیلی دیکھ رہا ہوں۔",
                    "Checking how the pain is changing.",
                ),
            ],
            "general": [
                (
                    ["کتنی تکلیف", "how much"],
                    f"{name}، اس سے کتنی تکلیف ہو رہی ہے یا روزمرہ کام میں کیا فرق پڑا ہے؟",
                    f"{profile.get('display_name','You')}, how uncomfortable is it, or how is it affecting normal activity?",
                    severity_replies,
                    "تکلیف کی شدت معلوم کر رہا ہوں۔",
                    "Checking severity and effect on normal activity.",
                ),
                (
                    ["بڑھ", "worse"],
                    f"{name}، کیا یہ بڑھ رہا ہے یا کم ہو رہا ہے؟",
                    f"{profile.get('display_name','You')}, is it getting worse or improving?",
                    severity_replies,
                    "علامت کی تبدیلی دیکھ رہا ہوں۔",
                    "Checking how the symptom is changing.",
                ),
                (
                    ["ساتھ کوئی", "anything else"],
                    f"{name}، کیا اس کے ساتھ کوئی اور تکلیف بھی ہے؟",
                    f"{profile.get('display_name','You')}, is there any other symptom with it?",
                    _YES_NO,
                    "ساتھ کی علامات دیکھ رہا ہوں۔",
                    "Checking for related symptoms.",
                ),
            ],
        }

        selected = next(
            (
                item
                for item in question_sets[kind]
                if not any(marker in asked_text for marker in item[0])
            ),
            question_sets["general"][1],
        )
        _markers, q_ur, q_en, quick, still_ur, still_en = selected
        conf = min(0.32 + (asked * 0.18), 0.82)

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
    has_skin_change = _has_skin_change(text)
    skin_concerning = has_skin_change and any(
        marker in lo
        for marker in [
            "pain", "dard", "درد", "spread", "phail", "پھیل",
            "warm", "garam", "گرم", "swelling", "sooj", "سوج",
            "fever", "bukhar", "بخار", "pus", "peep", "پیپ",
        ]
    )

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

    if skin_concerning:
        level = TriageLevel.DOCTOR_24H
        reason = (
            "The skin change is painful, spreading, warm, swollen, or accompanied "
            "by fever and should be reviewed by a clinician within 24 hours."
        )

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

    if level == TriageLevel.HOME_CARE and has_skin_change:
        advice_ur = (
            f"{name}، نشان کو صاف اور خشک رکھیں اور اسے نہ کھجائیں۔ اگر نشان "
            "پھیلے، گرم یا سوجا ہوا ہو، بخار آئے، یا تکلیف بڑھے تو ڈاکٹر سے "
            "ملیں۔ یاد رکھیں، یہ ڈاکٹر کا متبادل نہیں ہے۔"
        )
        advice_en = (
            f"{profile.get('display_name','You')}, keep the area clean and dry "
            "and avoid scratching it. If it spreads, becomes warm or swollen, "
            "fever appears, or discomfort increases, see a doctor. This is not "
            "a substitute for a doctor."
        )
    elif level == TriageLevel.HOME_CARE:
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
        if has_skin_change:
            advice_ur = (
                f"{name}، اس نشان کو آج یا اگلے 24 گھنٹوں میں ڈاکٹر کو دکھائیں۔ "
                "جگہ کو صاف رکھیں اور اگر سرخی یا سوجن تیزی سے بڑھے یا حالت "
                "بگڑے تو فوراً ہسپتال جائیں۔ یہ ڈاکٹر کا متبادل نہیں ہے۔"
            )
            advice_en = (
                f"{profile.get('display_name','You')}, show this mark to a "
                "clinician today or within 24 hours. Keep the area clean, and "
                "seek urgent care if redness or swelling spreads quickly or the "
                "condition worsens. This is not a substitute for a doctor."
            )
        else:
            advice_ur = (
                f"{name}، کل صبح تک قریبی کلینک جائیں۔ پانی پیتے رہیں اور حالت "
                "پر نظر رکھیں۔ یاد رکھیں، یہ ڈاکٹر کا متبادل نہیں ہے۔"
            )
            advice_en = (
                f"{profile.get('display_name','You')} — visit a nearby clinic by "
                "tomorrow morning. Keep drinking fluids and monitor the condition. "
                "Remember, this is not a substitute for a doctor."
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
    if _latest_answer_affirms_breathing_problem(turns):
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
        "rash", "red mark", "red spot", "redness", "skin", "itch", "swelling",
        "surkh nishan", "laal nishan", "lal nishan", "nishan", "kharish",
        "soojan", "daane", "danay", "jild",
        "بخار", "درد", "کھانسی", "الٹی", "دست", "چکر", "بیمار", "زخم",
        "زکام", "نشان", "سرخی", "خارش", "سوجن", "دانے", "جلد",
        "cold", "zukam",
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
    if _latest_answer_affirms_breathing_problem(turns):
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

    call_started = time.perf_counter()
    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key,
            base_url=DASHSCOPE_BASE_URL,
            timeout=REQUEST_TIMEOUT_SECONDS,
            # A triage turn must fail conservatively within the advertised
            # timeout.  The SDK otherwise retries twice, turning a 20-second
            # timeout into roughly a one-minute wait before our safe fallback.
            max_retries=0,
        )
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,
            response_format={"type": "json_object"},
            # Qwen3.7 enables hybrid thinking by default.  Triage needs a
            # short structured turn, not a long reasoning trace.
            extra_body={"enable_thinking": False},
        )
        raw = completion.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        call_latency = time.perf_counter() - call_started
        logger.error(
            "Qwen call failed (model=%s latency_seconds=%.3f): %s",
            model,
            call_latency,
            exc,
            exc_info=True,
        )
        return _safe_fallback(profile, session_id, turns)

    call_latency = time.perf_counter() - call_started
    try:
        data = json.loads(_strip_fences(raw))
        turn = _turn_from_qwen_json(data, profile, session_id, turns)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Qwen parse failed (model=%s latency_seconds=%.3f; %s). Raw: %s",
            model,
            call_latency,
            exc,
            raw,
        )
        return _safe_fallback(profile, session_id, turns)

    logger.info(
        "Qwen turn completed (model=%s latency_seconds=%.3f type=%s)",
        model,
        call_latency,
        turn.type,
    )

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
