"""Tests for the Qwen → OpenAI failover path and per-scope budget ledger.

The production code only touches OpenAI when Qwen is unavailable or returns an
unusable response. Those branches were previously exercised only by manual smoke
tests, so a Qwen refactor could silently break the paid fallback. These tests
patch the provider seams (`_call_qwen`, `_call_openai`) rather than the network.
"""
from __future__ import annotations

import json


def _profile():
    return {
        "id": 1,
        "display_name": "Hassan",
        "age": 34,
        "gender": "Male",
        "allergies": [],
        "chronic_conditions": [],
        "current_medicines": [],
        "recent_record": [],
    }


def _question_json():
    return {
        "type": "question",
        "question_urdu": "کب سے یہ درد ہے؟",
        "question_english": "Since when has this been happening?",
        "quick_replies": [
            {"urdu": "آج", "english": "Today"},
            {"urdu": "کل", "english": "Yesterday"},
            {"urdu": "ایک ہفتہ", "english": "One week"},
        ],
        "question_goal": "Duration",
        "why_this_matters": "Duration guides urgency.",
        "clinical_state": {
            "chief_complaint": "chest tightness",
            "body_location": "chest",
            "associated_symptoms": [],
            "pertinent_negatives": [],
            "exposures": [],
            "red_flags_present": [],
            "red_flags_denied": [],
            "unknowns": ["duration"],
        },
        "analysis": {
            "collected": [],
            "still_checking_urdu": "دورانیہ",
            "still_checking_english": "Duration",
            "confidence": 0.25,
        },
    }


def test_available_providers_reflects_configured_keys(monkeypatch):
    import triage

    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert triage._available_text_providers() == []

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    assert triage._available_text_providers() == ["qwen"]

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert triage._available_text_providers() == ["qwen", "openai"]

    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    assert triage._available_text_providers() == ["openai"]


def test_default_openai_fallback_model_is_a_real_openai_model():
    import triage

    # gpt-4o-mini is the stable, cheap OpenAI text model we chose.
    assert triage.get_openai_model_name() == "gpt-4o-mini"


def test_qwen_success_does_not_touch_openai(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(triage, "_call_qwen", lambda _m: json.dumps(_question_json()))

    def _fail_openai(_messages):
        raise AssertionError("OpenAI must not be called when Qwen succeeds")

    monkeypatch.setattr(triage, "_call_openai", _fail_openai)

    turn = triage.qwen_next_turn(_profile(), 101, [{"role": "user", "text": "seenay mein dard hai"}])
    assert turn.type == "question"
    assert turn.response_source == "live_ai"


def test_openai_fallback_runs_when_qwen_fails_with_quota_error(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    openai_calls: list[int] = []

    def _qwen_quota_fail(_messages):
        raise RuntimeError("Error code: 429 - AllocationQuota exhausted")

    def _openai_ok(_messages):
        openai_calls.append(1)
        return json.dumps(_question_json())

    monkeypatch.setattr(triage, "_call_qwen", _qwen_quota_fail)
    monkeypatch.setattr(triage, "_call_openai", _openai_ok)

    turn = triage.qwen_next_turn(_profile(), 102, [{"role": "user", "text": "seenay mein dard hai"}])
    assert turn.type == "question"
    assert turn.response_source == "live_ai"
    assert len(openai_calls) == 1


def test_openai_fallback_runs_when_qwen_response_is_unrepairable(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    qwen_calls = {"n": 0}

    def _qwen_bad_then_bad(_messages):
        qwen_calls["n"] += 1
        return "this is not JSON"

    def _openai_ok(_messages):
        return json.dumps(_question_json())

    monkeypatch.setattr(triage, "_call_qwen", _qwen_bad_then_bad)
    monkeypatch.setattr(triage, "_call_openai", _openai_ok)

    turn = triage.qwen_next_turn(_profile(), 103, [{"role": "user", "text": "seenay mein dard hai"}])
    # Qwen tried twice (initial + one JSON repair), then OpenAI won.
    assert qwen_calls["n"] == 2
    assert turn.type == "question"
    assert turn.response_source == "live_ai"


def test_both_providers_failing_returns_safe_unavailable_turn(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    monkeypatch.setattr(triage, "_call_qwen", lambda _m: (_ for _ in ()).throw(RuntimeError("Error code: 401")))
    monkeypatch.setattr(triage, "_call_openai", lambda _m: (_ for _ in ()).throw(RuntimeError("Error code: 500")))

    turn = triage.qwen_next_turn(_profile(), 104, [{"role": "user", "text": "seenay mein dard hai"}])
    assert turn.response_source == "ai_unavailable"


def test_openai_fallback_skipped_when_key_absent(monkeypatch):
    import triage

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    monkeypatch.setattr(triage, "_call_qwen", lambda _m: (_ for _ in ()).throw(RuntimeError("Error code: 429")))

    def _fail_openai(_messages):
        raise AssertionError("OpenAI must not be called when its key is unset")

    monkeypatch.setattr(triage, "_call_openai", _fail_openai)

    turn = triage.qwen_next_turn(_profile(), 105, [{"role": "user", "text": "seenay mein dard hai"}])
    assert turn.response_source == "ai_unavailable"
