import { useEffect, useRef, useState } from 'react'
import MicButton from './MicButton'
import AnalysisPanel from './AnalysisPanel'
import TriageResult from './TriageResult'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useTextToSpeech } from '../hooks/useTextToSpeech'
import { triageStart, triageAnswer } from '../api'

// Full conversational triage lifecycle for the active profile.
// Phases: idle -> (starting) -> question <-> answering -> result | error
export default function TriageConversation({ profile, onExit }) {
  const [phase, setPhase] = useState('idle')
  const [turn, setTurn] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')

  // Winning plan §7: initial-complaint silence window is generous so a slow
  // Urdu narration is not cut off; follow-up answers can be shorter.
  const speech = useSpeechRecognition({ lang: 'ur-PK', silenceMs: 8000 })
  const tts = useTextToSpeech()
  const spokenRef = useRef(null)
  const submittedRef = useRef(false)
  const [reviewText, setReviewText] = useState('')
  const [reviewOrigin, setReviewOrigin] = useState(null) // 'start' | 'answer'

  // Auto-speak each new assistant turn once.
  useEffect(() => {
    if (!turn) return
    const key = `${turn.session_id}:${turn.type}:${turn.analysis?.questions_asked}`
    const text = turn.type === 'question' ? turn.question_urdu : turn.advice_urdu
    if (text && spokenRef.current !== key) {
      spokenRef.current = key
      tts.speak(text)
    }
  }, [turn, tts])

  // When listening stops with a transcript, move the user into a REVIEW state
  // so they can edit / confirm / retry before we send anything.
  useEffect(() => {
    if (
      (phase === 'listening' || phase === 'answering-voice') &&
      !speech.listening &&
      speech.transcript.trim() &&
      !submittedRef.current
    ) {
      submittedRef.current = true
      setReviewText(speech.transcript.trim())
      setReviewOrigin(phase === 'listening' ? 'start' : 'answer')
      setPhase('reviewing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening, speech.transcript, phase])

  async function doStart(text) {
    if (!text || !text.trim()) return
    setPhase('starting')
    setError('')
    try {
      const t = await triageStart(profile.id, text.trim())
      setSessionId(t.session_id)
      setTurn(t)
      setPhase(t.type === 'result' ? 'result' : 'question')
    } catch (e) {
      setError(e.message || 'Could not reach the triage service.')
      setPhase('error')
    }
  }

  async function doAnswer(text) {
    if (!text || !text.trim()) return
    setPhase('thinking')
    setError('')
    try {
      const t = await triageAnswer(sessionId, text.trim())
      setTurn(t)
      setPhase(t.type === 'result' ? 'result' : 'question')
      setTyped('')
    } catch (e) {
      setError(e.message || 'Could not send your answer.')
      setPhase('error')
    }
  }

  function startVoice() {
    if (!speech.supported) return
    // Stop any spoken assistant reply before capturing — otherwise the mic
    // hears Nabz talking to itself.
    tts.cancel()
    tts.prime()
    submittedRef.current = false
    speech.start()
    setPhase('listening')
  }

  function answerVoice() {
    if (!speech.supported) return
    tts.cancel()
    submittedRef.current = false
    speech.start()
    setPhase('answering-voice')
  }

  function retryVoice() {
    submittedRef.current = false
    setReviewText('')
    speech.reset()
    speech.start()
    setPhase(reviewOrigin === 'answer' ? 'answering-voice' : 'listening')
  }

  function confirmReview() {
    const text = reviewText.trim()
    if (!text) return
    if (reviewOrigin === 'answer') doAnswer(text)
    else doStart(text)
  }

  function reset() {
    tts.cancel()
    speech.reset()
    submittedRef.current = false
    setTurn(null)
    setSessionId(null)
    setTyped('')
    setError('')
    setPhase('idle')
  }

  // --- Idle: capture the first symptom -----------------------------------
  if (phase === 'idle') {
    return (
      <div className="hero-card">
        <div className="hero-greet-ur urdu">
          {profile.display_name}، آپ کیسا محسوس کر رہے ہیں؟
        </div>
        <div className="hero-greet-en">Tell Nabz how {profile.display_name} feels</div>

        <div className="mic-wrap">
          {speech.supported ? (
            <MicButton listening={false} onClick={startVoice} />
          ) : (
            <div className="notice notice-info">
              <span className="ur urdu">اس براؤزر میں آواز دستیاب نہیں — نیچے لکھیں۔</span>
              Voice input isn’t supported here. Please type below.
            </div>
          )}
          <p className="hero-hint-ur urdu">مائیک دبائیں اور اپنی تکلیف بتائیں</p>
          <p className="hero-hint-en">Tap the mic and describe the problem</p>
        </div>

        {speech.error === 'not-allowed' && (
          <div className="notice notice-warn" style={{ marginTop: 8 }}>
            <span className="ur urdu">مائیک کی اجازت درکار ہے — یا نیچے لکھیں۔</span>
            Microphone permission denied. Allow it, or type below.
          </div>
        )}

        <form
          className="answer-bar"
          style={{ marginTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault()
            tts.prime()
            doStart(typed)
          }}
        >
          <input
            className="input urdu"
            dir="auto"
            placeholder="مثلاً: تین دن سے بخار ہے…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button className="mini-mic" type="submit" disabled={!typed.trim()} aria-label="Send">
            ➤
          </button>
        </form>
      </div>
    )
  }

  // --- Listening (initial symptom) ---------------------------------------
  if (phase === 'listening' || phase === 'answering-voice') {
    return (
      <div className="q-card">
        <MicButton listening onClick={() => speech.stop()} />
        <p className="hero-hint-ur urdu" style={{ marginTop: 12 }}>
          آرام سے پوری بات بتائیں — نبض آپ کے رکنے کا انتظار کرے گا۔
        </p>
        <p className="hero-hint-en">
          Speak naturally — Nabz waits through short pauses.
          Tap <strong>Done speaking</strong> when finished.
        </p>
        <div className="live-transcript urdu" dir="auto" style={{ marginTop: 12 }}>
          {speech.transcript || <span className="placeholder">…</span>}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => speech.stop()}>
            Done speaking · مکمل
          </button>
          <button className="btn btn-outline" onClick={reset}>
            منسوخ · Cancel
          </button>
        </div>
      </div>
    )
  }

  // --- Reviewing (transcript confirmation) -------------------------------
  if (phase === 'reviewing') {
    return (
      <div className="q-card">
        <div className="section-title">
          <span className="ur urdu">اپنی بات دیکھیں</span>
          <span className="en">Review before sending</span>
        </div>
        <textarea
          className="input urdu"
          dir="auto"
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          rows={3}
          style={{ marginTop: 8 }}
        />
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            className="btn btn-primary"
            onClick={confirmReview}
            disabled={!reviewText.trim()}
          >
            Send · بھیجیں
          </button>
          <button className="btn btn-outline" onClick={retryVoice}>
            Retry · دوبارہ بولیں
          </button>
          <button className="btn btn-ghost" onClick={reset}>
            منسوخ · Cancel
          </button>
        </div>
        <p className="hero-hint-en" style={{ marginTop: 8 }}>
          Nabz will not send anything until you confirm this transcript.
        </p>
      </div>
    )
  }

  // --- Starting / thinking spinners --------------------------------------
  if (phase === 'starting' || phase === 'thinking') {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p className="cs-ur urdu">نبض سوچ رہا ہے…</p>
        <p className="cs-en">Nabz is thinking…</p>
      </div>
    )
  }

  // --- Error -------------------------------------------------------------
  if (phase === 'error') {
    return (
      <div className="center-state">
        <div style={{ fontSize: 40 }}>⚠️</div>
        <p className="cs-ur urdu">معذرت، مسئلہ پیش آیا۔</p>
        <p className="cs-en">{error}</p>
        <div className="btn-row" style={{ width: '100%' }}>
          <button className="btn btn-outline" onClick={reset}>
            نئی بات · Restart
          </button>
        </div>
      </div>
    )
  }

  // --- Result ------------------------------------------------------------
  if (phase === 'result' && turn) {
    return (
      <div className="stack">
        <TriageResult
          turn={turn}
          onReplay={() => tts.speak(turn.advice_urdu)}
          speaking={tts.speaking}
          onNew={reset}
          ttsSupported={tts.supported}
        />
        {turn.analysis?.collected?.length > 0 && <AnalysisPanel analysis={turn.analysis} />}
      </div>
    )
  }

  // --- Question (with live analysis + answering) -------------------------
  const answeringByVoice = phase === 'answering-voice'
  return (
    <div className="conv">
      <div className="q-card">
        <div className="q-bot" aria-hidden="true">
          🩺
        </div>
        <div className="q-urdu urdu" dir="rtl">
          {turn.question_urdu}
        </div>
        {turn.question_english && <div className="q-en">{turn.question_english}</div>}
        <button className="q-speak" onClick={() => tts.speak(turn.question_urdu)}>
          🔊 دوبارہ سنیں · Replay
        </button>

        <div className="chips">
          {(turn.quick_replies || []).map((qr, i) => (
            <button key={i} className="chip" onClick={() => doAnswer(qr.urdu)}>
              {qr.urdu}
              <span className="chip-en">{qr.english}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="answer-bar">
        <input
          className="input urdu"
          dir="auto"
          placeholder={answeringByVoice ? speech.transcript || 'سن رہے ہیں…' : 'یا یہاں جواب لکھیں…'}
          value={answeringByVoice ? speech.transcript : typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed.trim()) doAnswer(typed)
          }}
          disabled={answeringByVoice}
        />
        {speech.supported ? (
          <button
            className={`mini-mic ${answeringByVoice && speech.listening ? 'listening' : ''}`}
            onClick={() => (answeringByVoice && speech.listening ? speech.stop() : answerVoice())}
            aria-label="Answer by voice"
          >
            {answeringByVoice && speech.listening ? '⏹' : '🎤'}
          </button>
        ) : (
          <button
            className="mini-mic"
            onClick={() => doAnswer(typed)}
            disabled={!typed.trim()}
            aria-label="Send"
          >
            ➤
          </button>
        )}
      </div>

      <AnalysisPanel analysis={turn.analysis} />

      <button className="btn btn-outline no-print" onClick={reset}>
        نئی بات · Start over
      </button>
    </div>
  )
}
