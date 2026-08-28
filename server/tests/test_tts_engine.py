from __future__ import annotations

import tts_engine


def test_auto_prefers_qwen_for_urdu(monkeypatch):
    monkeypatch.setenv("NABZ_TTS_ENGINE", "auto")
    monkeypatch.setattr(tts_engine, "_qwen_failed", False)
    monkeypatch.setattr(tts_engine, "_synthesize_qwen_urdu", lambda text: b"qwen-wav")
    monkeypatch.setattr(
        tts_engine,
        "_synthesize_gtts",
        lambda text, lang: (_ for _ in ()).throw(AssertionError("gTTS should not run")),
    )

    assert tts_engine.synthesize("آپ کیسے ہیں؟", "ur") == (b"qwen-wav", "audio/wav")


def test_auto_falls_back_to_urdu_gtts_without_wrong_language(monkeypatch):
    monkeypatch.setenv("NABZ_TTS_ENGINE", "auto")
    monkeypatch.setattr(tts_engine, "_qwen_failed", False)
    monkeypatch.setattr(
        tts_engine,
        "_synthesize_qwen_urdu",
        lambda text: (_ for _ in ()).throw(RuntimeError("provider unavailable")),
    )
    seen = {}

    def fake_gtts(text, lang):
        seen["lang"] = lang
        return b"urdu-mp3", "audio/mpeg"

    monkeypatch.setattr(tts_engine, "_synthesize_gtts", fake_gtts)
    assert tts_engine.synthesize("سر میں درد کب سے ہے؟", "ur") == (b"urdu-mp3", "audio/mpeg")
    assert seen["lang"] == "ur"
    assert tts_engine._qwen_failed is True


def test_mms_is_only_used_when_explicitly_selected(monkeypatch):
    monkeypatch.setenv("NABZ_TTS_ENGINE", "mms")
    monkeypatch.setattr(tts_engine, "_synthesize_mms", lambda text: b"legacy-wav")
    monkeypatch.setattr(
        tts_engine,
        "_synthesize_qwen_urdu",
        lambda text: (_ for _ in ()).throw(AssertionError("Qwen should not run")),
    )

    assert tts_engine.synthesize("متن", "ur") == (b"legacy-wav", "audio/wav")
