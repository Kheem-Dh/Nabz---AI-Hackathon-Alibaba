"""Small model double for API contract tests.

This file is test-only. It is injected through ``set_turn_provider_for_tests``
and is never imported by the application. Production triage has no offline
clinical rule engine and cannot silently fall back to these fixtures.
"""
from __future__ import annotations

from typing import Any

from medicine_evidence import resolve_medication_candidates
from schemas import (
    ClinicalState,
    CollectedFact,
    QuickReply,
    TriageAnalysis,
    TriageLevel,
    TriageTurn,
)


def _questions(turns: list[dict]) -> int:
    return sum(1 for turn in turns if turn.get("role") == "assistant")


def _users(turns: list[dict]) -> str:
    return " ".join(turn.get("text", "") for turn in turns if turn.get("role") == "user").lower()


def _question(
    profile: dict[str, Any], session_id: int, turns: list[dict],
    urdu: str, english: str, replies: list[tuple[str, str]],
    *, state: ClinicalState | None = None,
) -> TriageTurn:
    return TriageTurn(
        type="question", session_id=session_id,
        patient_name=profile.get("display_name", ""),
        question_urdu=f"{profile.get('display_name', 'آپ')}، {urdu}",
        question_english=f"{profile.get('display_name', 'You')}, {english}",
        quick_replies=[QuickReply(urdu=u, english=e) for u, e in replies],
        question_goal="Test-model clinical clarification",
        why_this_matters="This answer changes urgency or the doctor handoff.",
        clinical_state=state or ClinicalState(chief_complaint=turns[0].get("text")),
        analysis=TriageAnalysis(
            collected=[], still_checking_urdu="مزید معلومات", still_checking_english="Clarifying",
            confidence=min(0.2 + _questions(turns) * 0.2, 0.8),
            questions_asked=_questions(turns),
        ),
        response_source="test_model", mock=True,
    )


def _result(
    profile: dict[str, Any], session_id: int, turns: list[dict],
    level: TriageLevel = TriageLevel.DOCTOR_24H, *, headache: bool = False,
) -> TriageTurn:
    candidates = []
    if headache:
        candidates = [{
            "generic_name": "paracetamol",
            "condition_key": "mild_headache_adult",
            "why_it_is_relevant_to_this_patient": "Test-model candidate for a non-red-flag adult headache.",
        }]
    medications = resolve_medication_candidates(candidates, profile=profile, urgency=level.value)
    vault_used = [f"Allergy: {item}" for item in profile.get("allergies", [])]
    return TriageTurn(
        type="result", session_id=session_id,
        patient_name=profile.get("display_name", ""), level=level,
        advice_urdu="ڈاکٹر سے مناسب وقت میں معائنہ کروائیں اور حالت بگڑنے پر فوری مدد لیں۔",
        advice_english="Arrange an appropriate clinician review and seek urgent help if symptoms worsen.",
        reason_english="The injected test model produced this contract-test result.",
        suggestions_urdu=["علامات میں تبدیلی نوٹ کریں اور والٹ ریکارڈ ڈاکٹر کو دکھائیں۔"],
        suggestions_english=["Track symptom changes and show the clinician the Vault record."],
        patient_facing_impression_urdu="یہ ایک ممکنہ وجہ سے مطابقت رکھ سکتا ہے، حتمی تشخیص نہیں۔",
        patient_facing_impression_english=(
            "This may be consistent with a tension-type or migraine headache; it is not a confirmed diagnosis."
            if headache else "This is a test-model impression, not a confirmed diagnosis."
        ),
        possible_causes=["Tension-type headache", "Migraine"] if headache else [],
        doctor_differential=["Primary headache assessment"] if headache else [],
        escalation_signs=["Any sudden, severe, or rapidly worsening symptom"],
        doctor_handoff_english="Review the recorded transcript and patient Vault.",
        vault_context_used=vault_used,
        clinical_state=ClinicalState(chief_complaint=turns[0].get("text")),
        medication_options=medications,
        analysis=TriageAnalysis(confidence=0.8, questions_asked=_questions(turns)),
        response_source="test_model", mock=True,
    )


def fake_ai_turn(profile: dict[str, Any], session_id: int, turns: list[dict]) -> TriageTurn:
    text = _users(turns)
    asked = _questions(turns)
    last_question = next(
        (turn.get("text", "") for turn in reversed(turns) if turn.get("role") == "assistant"), ""
    )
    latest = next(
        (turn.get("text", "").lower() for turn in reversed(turns) if turn.get("role") == "user"), ""
    )

    emergency_markers = (
        "chest pain", "seenay mein dard", "seene mein dard", "سینے میں", "saans nahi",
        "difficulty breathing", "unconscious", "seizure", "severe bleeding", "bohot zyada khoon",
        "face drooping", "slurred speech", "zeher", "suicidal", "thunderclap", "worst headache",
    )
    affirmative = latest.strip(" .!?،") in {"yes", "haan", "ہاں", "جی", "جی ہاں"}
    breathing_answer = affirmative and ("سانس" in last_question or "breath" in last_question.lower())
    if any(marker in text for marker in emergency_markers) or breathing_answer:
        result = _result(profile, session_id, turns, TriageLevel.EMERGENCY)
        result.medication_options = []
        result.red_flags_present = ["Emergency feature identified by the injected test model."]
        return result

    is_skin = any(marker in text for marker in ("surkh nishan", "red mark", "redness", "سرخ نشان"))
    is_headache = any(marker in text for marker in ("sar m dard", "sar mein dard", "headache", "سر درد"))
    is_cough = any(marker in text for marker in ("khansi", "cough", "کھانسی"))
    is_fever = any(marker in text for marker in ("bukhar", "fever", "بخار"))
    is_mild_cold = any(marker in text for marker in ("zukam", "mild cold", "runny nose", "زکام"))

    if is_skin:
        state = ClinicalState(
            chief_complaint=turns[0].get("text"), body_location="Right arm", laterality="right",
            unknowns=["onset", "itch/pain/spread", "systemic symptoms"],
        )
        if asked == 0:
            turn = _question(profile, session_id, turns, "یہ سرخ نشان کب سے ہے؟", "how long has this red mark been present?", [("آج", "Today"), ("2–3 دن", "2–3 days"), ("زیادہ دن", "Longer")], state=state)
            turn.analysis.collected = [
                CollectedFact(label_urdu="علامت", label_english="Symptom", value_urdu="جلد پر سرخ نشان", value_english="Skin mark or redness"),
                CollectedFact(label_urdu="جگہ", label_english="Location", value_urdu="دایاں بازو", value_english="Right arm"),
            ]
            return turn
        if asked == 1:
            return _question(profile, session_id, turns, "کیا نشان میں خارش یا درد ہے، یا یہ پھیل رہا ہے؟", "is the mark itchy, painful, or spreading?", [("صرف نشان", "Just a mark"), ("خارش", "Itchy"), ("درد", "Painful"), ("پھیل رہا ہے", "Spreading")], state=state)
        if asked == 2:
            return _question(profile, session_id, turns, "کیا جگہ گرم یا سوجی ہے، یا بخار ہے؟", "is the area warm or swollen, or is there fever?", [("نہیں", "No"), ("گرم", "Warm"), ("سوجن", "Swollen"), ("بخار", "Fever")], state=state)
        return _result(profile, session_id, turns)

    if is_headache:
        if asked == 0:
            return _question(profile, session_id, turns, "یہ سر درد کب سے ہے؟", "how long has this headache been present?", [("آج", "Today"), ("2–3 دن", "2–3 days"), ("زیادہ دن", "Longer")])
        if asked == 1:
            return _question(profile, session_id, turns, "کیا درد اچانک شروع ہوا یا زندگی کا شدید ترین درد ہے؟", "did it start suddenly or is it the worst headache of your life?", [("آہستہ", "Gradual"), ("اچانک", "Sudden"), ("شدید ترین", "Worst ever")])
        if asked == 2:
            return _question(profile, session_id, turns, "درد سر میں کہاں ہے؟", "where in the head is the pain?", [("پیشانی", "Front"), ("ایک طرف", "One side"), ("پیچھے", "Back"), ("پورا سر", "All over")])
        return _result(profile, session_id, turns, headache=True)

    if is_cough and asked == 0:
        return _question(profile, session_id, turns, "کیا سانس لینے میں دشواری ہے؟", "is there difficulty breathing?", [("ہاں", "Yes"), ("نہیں", "No"), ("پتہ نہیں", "Not sure")])

    if asked < 3:
        label = "یہ تکلیف بڑھ رہی ہے، کم ہو رہی ہے، یا ویسی ہی ہے؟"
        english = "is the problem worsening, improving, or unchanged?"
        if asked == 0 and (is_fever or is_mild_cold):
            label, english = "یہ تکلیف کب سے ہے؟", "how long has this problem been present?"
        return _question(profile, session_id, turns, label, english, [("بڑھ رہی ہے", "Worsening"), ("ویسی ہی", "Unchanged"), ("کم ہو رہی ہے", "Improving")])

    level = TriageLevel.HOME_CARE if is_mild_cold and not is_fever else TriageLevel.DOCTOR_24H
    return _result(profile, session_id, turns, level)
