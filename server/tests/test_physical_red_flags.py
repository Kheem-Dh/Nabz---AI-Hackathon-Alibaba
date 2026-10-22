"""Deterministic physical red-flag gate.

Physical emergencies used to depend on the model returning an EMERGENCY band;
in a dry run the fallback model met "severe chest pain and difficulty
breathing" with an ordinary first question. These tests pin the gate that now
runs before any model call — what must escalate, and what must not.
"""
from __future__ import annotations

import pytest

import triage
from triage import detect_physical_red_flag, next_turn, set_turn_provider_for_tests

MUST_ESCALATE = [
    # cardiac — chest pain only counts with a companion sign
    ("cardiac", "mujhe seene mein dard hai aur saans phool rahi hai"),
    ("cardiac", "امی کو سینے میں شدید درد ہے اور سانس لینے میں دشواری ہو رہی ہے"),
    ("cardiac", "chest pain and sweating, pain going to my left arm"),
    ("cardiac", "I think I am having a heart attack"),
    ("cardiac", "abbu ko dil ka daura pad raha hai"),
    # "nahi" negates the verb here (the pain is NOT stopping), not the pain
    ("cardiac", "seene mein dard nahi ruk raha aur paseena aa raha hai"),
    ("breathing", "mujhe saans nahi aa rahi"),
    ("breathing", "my baby is not breathing"),
    ("breathing", "سانس نہیں آ رہی"),
    ("breathing", "his lips are blue and he is gasping for air"),
    ("stroke", "her face is drooping and speech is slurred"),
    ("stroke", "abbu ka chehra terha ho gaya hai aur zaban larkhara rahi hai"),
    ("stroke", "دادی کو فالج کا حملہ ہوا ہے"),
    ("stroke", "aik taraf kamzori ho gayi hai achanak"),
    ("unconscious", "my father is unconscious"),
    ("unconscious", "bhai behosh ho gaya hai"),
    ("unconscious", "بچہ بے ہوش ہے"),
    ("seizure", "my son is having a seizure"),
    ("seizure", "bachay ko jhatke lag rahe hain"),
    ("seizure", "مرگی کا دورہ پڑ رہا ہے"),
    ("bleeding", "bleeding won't stop after the accident"),
    ("bleeding", "khoon nahi ruk raha"),
    ("bleeding", "khoon ki ulti aa rahi hai"),
    ("anaphylaxis", "throat is closing after eating peanuts"),
    ("anaphylaxis", "honth sooj gaye hain aur saans lene mein mushkil hai"),
    ("poisoning", "my child swallowed poison"),
    ("poisoning", "usne keeray maar dawa pi li"),
    ("poisoning", "زہر کھا لیا ہے"),
    ("snakebite", "saanp ne kaat liya hai"),
    ("snakebite", "snake bite on the leg"),
    # Choking is escalated even when the patient adds "fine now": over-
    # escalating a choking episode is the safe direction to be wrong in.
    ("breathing", "i was choking on food earlier but fine now"),
]

MUST_NOT_ESCALATE = [
    "no chest pain, just a cough",
    "seene mein dard nahi hai",
    "i have chest pain after gym",  # chest pain alone is left to the interview
    "mujhe halka bukhar aur gale mein kharash hai",
    "food poisoning since last night",
    "gala sooja hua hai aur bukhar hai",  # tonsillitis, not anaphylaxis
    "mujhe bohat khoon ki kami hai doctor ne kaha",  # anaemia
    "my father had a heart attack last year",
    "abbu ko dil ka daura hua tha 2019 mein",  # family history
    "i can breathe fine",
    "slight shortness of breath with my asthma",
    "mild headache and fever",
    "i am not unconscious, just tired",
    "saans lene mein koi masla nahi",
    "koi jhatke nahi hain",
    "not bleeding heavily, small cut",
    "bachay ko halka sa khansi hai",
    "i don't have any chest pain or breathlessness",
    "she fainted yesterday but is fine now",
    "i keep sweating at night",
    # blocked nose — one of the commonest cold complaints
    "i can't breathe through my nose, it is blocked",
    "naak band hai, naak se saans nahi aa rahi",
    "ناک بند ہے، ناک سے سانس نہیں آ رہی",
    "she has a history of seizures and now has fever",
    "my new shoes are not fitting well",
    "i am having trouble breathing at night due to cough",
]


@pytest.mark.parametrize("category, text", MUST_ESCALATE)
def test_red_flag_is_detected(category, text):
    assert detect_physical_red_flag(text) == category


@pytest.mark.parametrize("text", MUST_NOT_ESCALATE)
def test_routine_complaint_is_not_a_red_flag(text):
    assert detect_physical_red_flag(text) is None


@pytest.fixture
def model_must_not_be_called():
    calls = []

    def provider(profile, session_id, turns):
        calls.append(turns)
        raise AssertionError("the model was called for a deterministic red flag")

    previous = triage._turn_provider_override
    set_turn_provider_for_tests(provider)
    yield calls
    set_turn_provider_for_tests(previous)


@pytest.mark.parametrize("text", [
    "امی کو سینے میں شدید درد ہے اور سانس لینے میں دشواری ہو رہی ہے",
    "mujhe saans nahi aa rahi",
    "my son is having a seizure",
])
def test_gate_short_circuits_before_any_model_call(text, model_must_not_be_called):
    turn = next_turn({"display_name": "Fatima"}, 1, [{"role": "user", "text": text}])
    assert model_must_not_be_called == []
    assert turn.type == "result"
    assert turn.level.value == "EMERGENCY"
    assert turn.response_source == "safety_protocol"
    assert turn.medication_options == []
    assert turn.medication_plan.status == "EMERGENCY_NO_MEDICATION"
    assert "1122" in turn.advice_english and "1122" in turn.advice_urdu
    assert turn.facility_intent == "emergency_hospital"


def test_red_flag_raised_mid_interview_escalates(model_must_not_be_called):
    """A red flag in a later answer escalates too, not only the first message."""
    turns = [
        {"role": "user", "text": "mujhe bukhar hai"},
        {"role": "assistant", "text": "kab se?", "question_goal": "duration"},
        {"role": "user", "text": "do din se, aur ab bachay ko jhatke lag rahe hain"},
    ]
    turn = next_turn({"display_name": "Ayesha"}, 1, turns)
    assert turn.level.value == "EMERGENCY"
    assert model_must_not_be_called == []


def test_guest_placeholder_name_is_not_used_as_a_vocative(model_must_not_be_called):
    turn = next_turn({"display_name": "آپ"}, 1, [{"role": "user", "text": "my baby is not breathing"}])
    assert not turn.advice_english.startswith("آپ")
    assert turn.advice_english.startswith("This may be a medical emergency")


def test_routine_complaint_still_reaches_the_model():
    calls = []

    def provider(profile, session_id, turns):
        calls.append(turns)
        from tests.fake_ai_provider import fake_ai_turn
        return fake_ai_turn(profile, session_id, turns)

    previous = triage._turn_provider_override
    set_turn_provider_for_tests(provider)
    try:
        next_turn({"display_name": "Kheem"}, 1, [{"role": "user", "text": "mild headache and fever"}])
    finally:
        set_turn_provider_for_tests(previous)
    assert len(calls) == 1
