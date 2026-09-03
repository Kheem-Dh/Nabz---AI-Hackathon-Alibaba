from __future__ import annotations

import voice_stt


def test_mock_voice_transcription_is_marked_mock(client, auth):
    headers, _account, _profile_id = auth
    response = client.post(
        "/api/voice/transcribe",
        headers=headers,
        data={"lang": "ur"},
        files={"file": ("speech.webm", b"mock-audio", "audio/webm")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["provider"] == "mock"
    assert response.json()["language"] == "ur"


def test_guest_voice_transcription_does_not_require_an_account(client):
    response = client.post(
        "/api/voice/transcribe",
        data={"lang": "ur"},
        files={"file": ("speech.webm", b"mock-audio", "audio/webm")},
    )

    assert response.status_code == 200, response.text
    assert response.json()["provider"] == "mock"


def test_android_native_wav_is_accepted(client):
    response = client.post(
        "/api/voice/transcribe",
        data={"lang": "ur"},
        files={"file": ("nabz.wav", b"RIFF-native-pcm-audio", "audio/wav")},
    )

    assert response.status_code == 200, response.text
    assert response.json()["provider"] == "mock"


def test_live_voice_failure_never_returns_a_canned_transcript(client, auth, monkeypatch):
    """When BOTH STT providers are unavailable, return 503 —
    never fabricate patient speech."""
    headers, _account, _profile_id = auth
    monkeypatch.setattr(voice_stt, "is_mock_mode", lambda: False)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/api/voice/transcribe",
        headers=headers,
        data={"lang": "ur"},
        files={"file": ("speech.webm", b"real-audio", "audio/webm")},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "voice_transcription_unavailable"


def test_openai_whisper_fallback_fires_when_qwen_fails(client, auth, monkeypatch):
    """When Qwen STT raises (quota exhausted, timeout, etc.) but an OpenAI
    key is configured, the endpoint must transparently fall back to Whisper
    rather than returning 503 — this is the production bug we hit on Render
    when the DashScope free tier ran out mid-demo."""
    headers, _account, _profile_id = auth
    monkeypatch.setattr(voice_stt, "is_mock_mode", lambda: False)
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-qwen-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")

    def _qwen_dead(*_args, **_kwargs):
        raise RuntimeError("AllocationQuota.FreeTierOnly: free quota exhausted")

    def _whisper_ok(*_args, **_kwargs):
        return "میں ٹھیک ہوں"  # what a real Whisper call would return

    monkeypatch.setattr(voice_stt, "_transcribe_qwen", _qwen_dead)
    monkeypatch.setattr(voice_stt, "_transcribe_whisper", _whisper_ok)

    response = client.post(
        "/api/voice/transcribe",
        headers=headers,
        data={"lang": "ur"},
        files={"file": ("speech.webm", b"real-audio", "audio/webm")},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["transcript"] == "میں ٹھیک ہوں"
    assert body["provider"] == "openai_whisper"
