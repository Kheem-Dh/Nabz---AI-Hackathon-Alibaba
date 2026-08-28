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


def test_live_voice_failure_never_returns_a_canned_transcript(client, auth, monkeypatch):
    headers, _account, _profile_id = auth
    monkeypatch.setattr(voice_stt, "is_mock_mode", lambda: False)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)

    response = client.post(
        "/api/voice/transcribe",
        headers=headers,
        data={"lang": "ur"},
        files={"file": ("speech.webm", b"real-audio", "audio/webm")},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "voice_transcription_unavailable"
