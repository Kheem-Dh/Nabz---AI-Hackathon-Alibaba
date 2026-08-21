"""Unit tests for the production AI orchestration and safety boundary."""
from __future__ import annotations

import json

from schemas import TriageLevel


def _profile(age=34):
    return {
        "id": 1,
        "display_name": "Hassan",
        "age": age,
        "gender": "Male",
        "allergies": ["Ibuprofen — reported rash"],
        "chronic_conditions": ["Migraine history"],
        "current_medicines": [],
        "recent_record": [],
    }


def _question_json(text="Has this changed since you first noticed it?"):
    return {
        "type": "question",
        "question_urdu": "حسن، جب سے آپ نے اسے دیکھا ہے کیا یہ بدلا ہے؟",
        "question_english": text,
        "quick_replies": [
            {"urdu": "بڑھا ہے", "english": "It has increased"},
            {"urdu": "ویسا ہی ہے", "english": "It is unchanged"},
            {"urdu": "کم ہوا ہے", "english": "It has reduced"},
        ],
        "question_goal": "Establish the symptom trajectory",
        "why_this_matters": "Change over time affects urgency.",
        "clinical_state": {
            "chief_complaint": "red mark on right arm",
            "body_location": "right arm",
            "laterality": "right",
            "associated_symptoms": [],
            "pertinent_negatives": [],
            "exposures": [],
            "red_flags_present": [],
            "red_flags_denied": [],
            "unknowns": ["trajectory"],
        },
        "analysis": {
            "collected": [{
                "label_urdu": "جگہ", "label_english": "Location",
                "value_urdu": "دایاں بازو", "value_english": "Right arm",
            }],
            "still_checking_urdu": "تبدیلی",
            "still_checking_english": "Trajectory",
            "confidence": 0.35,
        },
    }


def test_qwen_turn_uses_model_generated_clinical_state(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setattr(triage, "_call_qwen", lambda _messages: json.dumps(_question_json()))
    turn = triage.qwen_next_turn(
        _profile(), 77, [{"role": "user", "text": "mere right bazu pe surkh nishan hai"}],
    )
    assert turn.type == "question"
    assert turn.response_source == "live_ai"
    assert turn.clinical_state.laterality == "right"
    assert turn.clinical_state.body_location == "right arm"


def test_exact_repeated_model_question_gets_one_ai_repair(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    responses = iter([
        json.dumps(_question_json("How long has this been present?")),
        json.dumps(_question_json("Has the affected area changed in size?")),
    ])
    monkeypatch.setattr(triage, "_call_qwen", lambda _messages: next(responses))
    turn = triage.qwen_next_turn(
        _profile(), 78,
        [
            {"role": "user", "text": "red area on arm"},
            {"role": "assistant", "kind": "question", "text": "کب سے ہے؟", "text_english": "How long has this been present?"},
            {"role": "user", "text": "two days"},
        ],
    )
    assert turn.type == "question"
    assert turn.question_english == "Has the affected area changed in size?"


def test_model_identified_red_flag_forces_emergency_and_removes_medicine():
    import triage

    data = {
        "type": "result",
        "level": "HOME_CARE",
        "advice_urdu": "فوراً ہسپتال جائیں۔",
        "advice_english": "Go to a hospital now.",
        "reason_english": "A red flag is present.",
        "red_flags_present": ["new one-sided weakness"],
        "medication_options": [{
            "generic_name": "paracetamol", "condition_key": "mild_headache_adult",
            "why_it_is_relevant_to_this_patient": "headache",
        }],
        "clinical_state": {"red_flags_present": ["new one-sided weakness"]},
        "analysis": {"confidence": 0.9},
    }
    turn = triage._turn_from_qwen_json(data, _profile(), 79, [{"role": "user", "text": "headache and weakness"}])
    assert turn.level == TriageLevel.EMERGENCY
    assert turn.medication_options == []


def test_no_key_never_activates_a_canned_clinical_answer(monkeypatch):
    import triage

    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    turn = triage.qwen_next_turn(_profile(), 80, [{"role": "user", "text": "headache"}])
    assert turn.response_source == "ai_unavailable"
    assert turn.medication_options == []
    assert "unavailable" in turn.advice_english.lower()


def test_production_triage_module_contains_no_rule_engine_symbols():
    import triage

    forbidden = {"_mock_question", "_mock_result", "_complaint_kind", "_impression_for", "_mock_medication_candidates"}
    assert forbidden.isdisjoint(vars(triage))
