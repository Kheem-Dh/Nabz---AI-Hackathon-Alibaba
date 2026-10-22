"""Self-harm and red-flag detection across scripts, spellings and phrasings.

Reported from a real device: "mujhe khudkushi karni hai" and "mujhe tarika
batao ke main marna chahta hoon" were interviewed instead of escalated. The
same spoken Urdu reaches the gate in Urdu script, Roman Urdu or Hindi
(Devanagari) script — Android voice typing in Hindi writes it in Devanagari —
and only some of those forms were covered. These cases pin every form.
"""
from __future__ import annotations

import pytest

from triage import _mental_health_turn, _safety_normalize, detect_physical_red_flag


def _gate(text: str) -> str:
    turn = _mental_health_turn({"display_name": "Test"}, 1, [{"role": "user", "text": text}])
    if turn is None:
        return "interview"
    if turn.type == "result" and turn.level.value == "EMERGENCY":
        return "emergency"
    return "safety_question" if turn.type == "question" else "support"


MUST_ESCALATE = [
    # Roman Urdu — spellings and forms
    "mujhe khudkushi karni hai",
    "mujhe khud kushi karni hai",
    "khudkhushi karna chahta hun",
    "mujhe marna hai",
    "main mar jana chahta hun",
    "matlab main marna chahta hun",          # "mat" inside "matlab" is not a negation
    # Urdu script
    "مجھے خودکشی کرنی ہے",
    "مجھے خود کشی کرنی ہے",                  # spaced compound
    "میں مرنا چاہتا ہوں",
    "مجھے مرنا ہے",
    # Hindi / Devanagari script
    "मुझे खुदकुशी करनी है",
    "मुझे ख़ुदकुशी करनी है",                 # with nukta
    "मैं मरना चाहता हूं",
    "मैं मरना चाहता हूँ",                    # chandrabindu
    "मुझे आत्महत्या करनी है",
    "मुझे suicide करना है",
    # English, including "not" hidden inside other words
    "i want to die",
    "i cannot go on, i want to die",
    "nothing matters anymore, i want to die",
]

# Asking for a method is the highest-risk signal: every one must escalate.
METHOD_SEEKING = [
    "mujhe tarika batao ke main marna chahta hoon",
    "marne ka tarika batao",
    "kaise marun",
    "مجھے طریقہ بتاؤ کہ میں مرنا چاہتا ہوں",
    "مرنے کا طریقہ بتاؤ",
    "मुझे तरीका बताओ कि मैं मरना चाहता हूं",
    "मरने का तरीका बताओ",
    "tell me how to kill myself",
    "what is the best way to end it",
    "what is a lethal dose",
]

# A negated plea is not an emergency — but it is not a fever either.
NEGATED_PLEA = [
    "i don't want to die please help me",
    "main nahi marna chahta mujhe help chahiye",
    "میں نہیں مرنا چاہتا",
    "मैं नहीं मरना चाहता",
]

ROUTINE = [
    "i have a fever and headache",
    "mujhe bukhar hai",
    "سر میں درد ہے",
    "सिर में दर्द है",
    "food poisoning since last night",
    "mujhe marna nahi hai",
]


@pytest.mark.parametrize("text", MUST_ESCALATE + METHOD_SEEKING)
def test_self_harm_escalates_in_every_script(text):
    assert _gate(text) == "emergency"


@pytest.mark.parametrize("text", NEGATED_PLEA)
def test_negated_plea_opens_the_safety_question(text):
    assert _gate(text) == "safety_question"


@pytest.mark.parametrize("text", ROUTINE)
def test_routine_complaint_reaches_the_interview(text):
    assert _gate(text) == "interview"


@pytest.mark.parametrize("answer", ["हां", "पता नहीं", "मालूम नहीं"])
def test_devanagari_uncertain_safety_answer_escalates(answer):
    profile = {"display_name": "Test"}
    turns = [{"role": "user", "text": "मुझे बहुत घबराहट हो रही है"}]
    q = _mental_health_turn(profile, 1, turns)
    assert q is not None and q.type == "question"
    turns += [{"role": "assistant", "text": q.question_english, "question_goal": q.question_goal},
              {"role": "user", "text": answer}]
    assert _mental_health_turn(profile, 1, turns).level.value == "EMERGENCY"


@pytest.mark.parametrize("category, text", [
    ("cardiac", "मुझे सीने में दर्द है और सांस फूल रही है"),
    ("breathing", "सांस नहीं आ रही"),
    ("stroke", "अब्बू का चेहरा टेढ़ा हो गया है"),
    ("unconscious", "भाई बेहोश हो गया है"),
    ("seizure", "बच्चे को झटके लग रहे हैं"),
    ("bleeding", "खून नहीं रुक रहा"),
    ("poisoning", "उसने ज़हर खा लिया"),
    ("snakebite", "सांप ने काट लिया"),
])
def test_physical_red_flags_in_devanagari(category, text):
    assert detect_physical_red_flag(text) == category


@pytest.mark.parametrize("text", [
    "सीने में दर्द नहीं है",
    "नाक बंद है, नाक से सांस नहीं आ रही",
    "मुझे बुखार है",
])
def test_devanagari_routine_is_not_a_red_flag(text):
    assert detect_physical_red_flag(text) is None


def test_normaliser_folds_scripts_to_one_form():
    assert _safety_normalize("ख़ुदकुशी") == _safety_normalize("खुदकुशी")
    assert _safety_normalize("हूँ") == _safety_normalize("हूं")
    assert _safety_normalize("ك ي ه") == "ک ی ہ"        # Arabic-keyboard letters → Urdu
    assert _safety_normalize("خودکُشی") == "خودکشی"      # diacritic stripped
    assert _safety_normalize("  I  WANT\nto die ") == "i want to die"
