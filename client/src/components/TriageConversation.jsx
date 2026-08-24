import { useEffect, useRef, useState } from 'react'
import MicButton from './MicButton'
import AnalysisPanel from './AnalysisPanel'
import TriageResult from './TriageResult'
import EncounterChat from './EncounterChat'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useTextToSpeech } from '../hooks/useTextToSpeech'
import {
  attachChatImage,
  retryTriageAssessment,
  triageAnswer,
  triageImage,
  triageStart,
  triageStreamAnswer,
  triageStreamStart,
} from '../api'

// Full conversational triage lifecycle for the active profile.
// Phases: idle -> (starting) -> question <-> answering -> result | error
export default function TriageConversation({ profile, onSessionChanged, initialTurn = null }) {
  const [phase, setPhase] = useState(
    initialTurn ? (initialTurn.type === 'result' ? 'result' : 'question') : 'idle',
  )
  const [turn, setTurn] = useState(initialTurn)
  const [sessionId, setSessionId] = useState(initialTurn?.session_id || null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const imageInputRef = useRef(null)
  const [clinicalImage, setClinicalImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')

  // Winning plan §7: initial-complaint silence window is generous so a slow
  // Urdu narration is not cut off; follow-up answers can be shorter.
  const speech = useSpeechRecognition({ lang: 'ur-PK', silenceMs: 8000 })
  const tts = useTextToSpeech()
  const spokenRef = useRef(null)
  const submittedRef = useRef(false)
  const [reviewText, setReviewText] = useState('')
  const [reviewOrigin, setReviewOrigin] = useState(null) // 'start' | 'answer'
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState('')
  const requestControllerRef = useRef(null)
  const lastRequestRef = useRef(null)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [streamStage, setStreamStage] = useState(null) // {stage, message, latency_ms?}
  const streamCtrlRef = useRef(null)

  const processing = ['starting', 'thinking', 'analyzing-image'].includes(phase)
  useEffect(() => {
    if (!processing) {
      setWaitSeconds(0)
      return undefined
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      setWaitSeconds(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [processing])

  function beginRequest() {
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller
    return controller
  }

  function endRequest(controller) {
    if (requestControllerRef.current === controller) requestControllerRef.current = null
  }

  function cancelPending() {
    requestControllerRef.current?.abort()
  }

  // Stop mic + TTS the moment we reach a terminal state so the microphone
  // indicator never stays on after the assistant has answered.
  useEffect(() => {
    if (phase === 'result' || phase === 'error' || phase === 'idle') {
      try { speech.stop() } catch { /* ignore */ }
      try { speech.reset() } catch { /* ignore */ }
      submittedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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

  function _cancelStream() {
    try { streamCtrlRef.current?.cancel() } catch { /* ignore */ }
    streamCtrlRef.current = null
    setStreamStage(null)
  }

  async function doStart(text) {
    if (!text || !text.trim()) return
    setPhase('starting')
    setError('')
    setStreamStage({ stage: 'queued', message: 'Sending…' })
    lastRequestRef.current = { kind: 'start', text: text.trim() }
    _cancelStream()
    return new Promise((resolve) => {
      streamCtrlRef.current = triageStreamStart(profile.id, text.trim(), {
        onProgress: (evt) => setStreamStage(evt),
        onTurn: (t) => {
          setSessionId(t.session_id)
          setTurn(t)
          setPhase(t.type === 'result' ? 'result' : 'question')
          setStreamStage(null)
          onSessionChanged?.(t)
          resolve()
        },
        onError: async (err) => {
          if (err?.name === 'AbortError') {
            setStreamStage(null)
            setPhase('idle')
            resolve()
            return
          }
          // Fallback to non-streaming JSON on any SSE failure so demos never freeze.
          const controller = beginRequest()
          try {
            const t = await triageStart(profile.id, text.trim(), controller.signal)
            setSessionId(t.session_id)
            setTurn(t)
            setPhase(t.type === 'result' ? 'result' : 'question')
            onSessionChanged?.(t)
          } catch (e) {
            setError(e.message || 'Could not reach the triage service.')
            setPhase(e.name === 'AbortError' && !e.timedOut ? 'idle' : 'error')
          } finally {
            endRequest(controller)
            setStreamStage(null)
            resolve()
          }
        },
      })
    })
  }

  async function doAnswer(text) {
    if (!text || !text.trim()) return
    setPhase('thinking')
    setError('')
    setStreamStage({ stage: 'queued', message: 'Sending…' })
    lastRequestRef.current = { kind: 'answer', text: text.trim() }
    _cancelStream()
    return new Promise((resolve) => {
      streamCtrlRef.current = triageStreamAnswer(sessionId, text.trim(), {
        onProgress: (evt) => setStreamStage(evt),
        onTurn: (t) => {
          setTurn(t)
          setPhase(t.type === 'result' ? 'result' : 'question')
          setTyped('')
          setStreamStage(null)
          onSessionChanged?.(t)
          resolve()
        },
        onError: async (err) => {
          if (err?.name === 'AbortError') {
            setStreamStage(null)
            setPhase('question')
            resolve()
            return
          }
          const controller = beginRequest()
          try {
            const t = await triageAnswer(sessionId, text.trim(), controller.signal)
            setTurn(t)
            setPhase(t.type === 'result' ? 'result' : 'question')
            setTyped('')
            onSessionChanged?.(t)
          } catch (e) {
            setError(e.message || 'Could not send your answer.')
            setPhase(e.name === 'AbortError' && !e.timedOut ? 'question' : 'error')
          } finally {
            endRequest(controller)
            setStreamStage(null)
            resolve()
          }
        },
      })
    })
  }

  async function retryAssessment() {
    if (!sessionId) return
    setPhase('thinking')
    setError('')
    lastRequestRef.current = { kind: 'retry' }
    const controller = beginRequest()
    try {
      const t = await retryTriageAssessment(sessionId, controller.signal)
      setTurn(t)
      setPhase(t.type === 'result' ? 'result' : 'question')
      onSessionChanged?.(t)
    } catch (e) {
      setError(e.message || 'Could not retry the live AI assessment.')
      setPhase(
        e.name === 'AbortError' && !e.timedOut
          ? turn?.type === 'result' ? 'result' : turn ? 'question' : 'idle'
          : 'error',
      )
    } finally {
      endRequest(controller)
    }
  }

  function selectClinicalImage(file) {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setClinicalImage(file || null)
    setImagePreview(file ? URL.createObjectURL(file) : '')
  }

  async function submitClinicalImage() {
    if (!sessionId || !clinicalImage) return
    tts.cancel()
    setPhase('analyzing-image')
    setError('')
    lastRequestRef.current = { kind: 'image' }
    const controller = beginRequest()
    try {
      const t = await triageImage(sessionId, clinicalImage, controller.signal)
      selectClinicalImage(null)
      setTurn(t)
      setPhase(t.type === 'result' ? 'result' : 'question')
      onSessionChanged?.(t)
    } catch (e) {
      setError(e.message || 'Could not analyze this image. You can skip it and continue.')
      setPhase('question')
    } finally {
      endRequest(controller)
    }
  }

  function retryLastRequest() {
    const last = lastRequestRef.current
    if (!last) return reset()
    if (last.kind === 'start') doStart(last.text)
    else if (last.kind === 'answer') doAnswer(last.text)
    else if (last.kind === 'retry') retryAssessment()
    else if (last.kind === 'image') submitClinicalImage()
  }

  function skipClinicalImage() {
    selectClinicalImage(null)
    doAnswer('I prefer not to upload a photo. Please continue using the information already provided.')
  }

  function startVoice() {
    if (!speech.supported) return
    // Stop any spoken assistant reply before capturing — otherwise the mic
    // hears Nabz talking to itself.
    tts.cancel()
    tts.prime()
    submittedRef.current = false
    requestControllerRef.current?.abort()
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
    selectClinicalImage(null)
    setError('')
    setPhase('idle')
  }

  // --- Idle: capture the first symptom -----------------------------------
  if (phase === 'idle') {
    return (
      <div className="hero-card">
        {error && <div className="notice notice-warn">{error}</div>}
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
          className="claude-composer symptom-composer"
          onSubmit={(e) => {
            e.preventDefault()
            tts.prime()
            doStart(typed)
          }}
        >
          <textarea
            className="urdu"
            dir="auto"
            rows={3}
            placeholder="اپنی علامات تفصیل سے لکھیں…  Describe your symptoms naturally"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && typed.trim()) {
                e.preventDefault()
                tts.prime()
                doStart(typed)
              }
            }}
          />
          <footer>
            <button className="composer-voice" type="button" onClick={startVoice} disabled={!speech.supported}>
              🎤 Voice
            </button>
            <span>Enter to send · Shift+Enter for a new line</span>
            <button className="composer-send" type="submit" disabled={!typed.trim()} aria-label="Send">↑</button>
          </footer>
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
  if (phase === 'starting' || phase === 'thinking' || phase === 'analyzing-image') {
    // Prefer real SSE stages when available; fall back to the time-based ramp
    // so the non-streaming JSON path still shows motion.
    const stageOrder = ['queued', 'safety_check', 'context', 'reasoning', 'structuring', 'complete']
    const streamIdx = streamStage ? stageOrder.indexOf(streamStage.stage) : -1
    const rampIdx = waitSeconds < 3 ? 1 : waitSeconds < 8 ? 2 : waitSeconds < 18 ? 3 : 4
    const active = streamIdx >= 0 ? streamIdx : rampIdx
    return (
      <div className="assessment-thinking" role="status" aria-live="polite">
        <div className="thinking-mark"><div className="spinner" /></div>
        <span className="thinking-kicker">PRIVATE CLINICAL REASONING</span>
        <p className="cs-ur urdu">
          {phase === 'analyzing-image' ? 'تصویر کا محتاط جائزہ لیا جا رہا ہے…' : 'نبض آپ کی معلومات کا جائزہ لے رہا ہے…'}
        </p>
        <p className="cs-en">
          {streamStage?.message || (phase === 'analyzing-image'
            ? 'Reviewing the image alongside your conversation and Vault context.'
            : 'Reviewing your conversation, safety signals, and relevant Vault context.')}
        </p>
        <div className="thinking-steps" aria-hidden="true">
          <span className={active > 0 ? 'done' : 'active'}>Queued</span>
          <i />
          <span className={active > 1 ? 'done' : active === 1 ? 'active' : ''}>Safety check</span>
          <i />
          <span className={active > 2 ? 'done' : active === 2 ? 'active' : ''}>Vault context</span>
          <i />
          <span className={active > 3 ? 'done' : active === 3 ? 'active' : ''}>Reasoning</span>
          <i />
          <span className={active >= 4 ? 'active' : ''}>Clinical response</span>
        </div>
        <p className="muted" aria-live="off">
          {waitSeconds}s elapsed · your transcript is preserved
          {streamStage?.latency_ms ? ` · turn latency ${Math.round(streamStage.latency_ms)}ms` : ''}
        </p>
        <button className="btn btn-outline" onClick={() => { _cancelStream(); cancelPending() }}>
          Cancel request
        </button>
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
          <button className="btn btn-primary" onClick={retryLastRequest}>
            Retry · دوبارہ کوشش کریں
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
          onRetry={turn.response_source === 'ai_unavailable' ? retryAssessment : undefined}
          chatSlot={['live_ai', 'test_model'].includes(turn.response_source) ? <EncounterChat sessionId={sessionId} /> : null}
        />
      </div>
    )
  }

  // --- Question (with live analysis + answering) -------------------------
  const answeringByVoice = phase === 'answering-voice'
  return (
    <div className="conv">
      {error && <div className="notice notice-warn">{error}</div>}
      <div className="q-card">
        <div className="q-card-meta">
          <div className={`ai-source-badge ${turn.response_source || 'live_ai'}`}>
            {turn.response_source === 'live_ai'
              ? '✦ Live AI · transcript + patient Vault'
              : turn.response_source === 'safety_protocol'
                ? 'Safety protocol · immediate human support'
              : turn.response_source === 'ai_unavailable'
                ? 'AI assessment unavailable'
                : 'Test model'}
          </div>
          <span className="assessment-step">Step {Math.min(turn.analysis?.questions_asked || 1, 5)} of about 5</span>
        </div>
        <div className="q-bot" aria-hidden="true">
          ✦
        </div>
        <div className="q-urdu urdu" dir="rtl">
          {turn.question_urdu}
        </div>
        {turn.question_english && <div className="q-en">{turn.question_english}</div>}
        {turn.why_this_matters && (
          <div className="q-purpose">Why Nabz is asking: {turn.why_this_matters}</div>
        )}

        {turn.image_request && (
          <div className="clinical-image-request">
            <div className="image-request-copy">
              <span className="image-request-icon" aria-hidden="true">📷</span>
              <div>
                <strong className="urdu" dir="rtl">{turn.image_request.prompt_urdu}</strong>
                <p>{turn.image_request.prompt_english}</p>
                <small>{turn.image_request.why_this_may_help}</small>
              </div>
            </div>

            {imagePreview && (
              <div className="clinical-image-preview">
                <img src={imagePreview} alt="Selected clinical preview" />
                <span>{clinicalImage?.name}</span>
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={(event) => selectClinicalImage(event.target.files?.[0] || null)}
            />
            <div className="image-request-actions">
              {!clinicalImage ? (
                <button className="btn btn-primary" onClick={() => imageInputRef.current?.click()}>
                  📷 Take or choose photo
                </button>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={submitClinicalImage}>
                    Analyze this photo · تصویر دیکھیں
                  </button>
                  <button className="btn btn-outline" onClick={() => imageInputRef.current?.click()}>
                    Choose another
                  </button>
                </>
              )}
              <button className="btn btn-ghost" onClick={skipClinicalImage}>
                Continue without photo · تصویر کے بغیر
              </button>
            </div>
            <p className="image-privacy-note">
              Optional. Used for this assessment and not added to your Vault. Avoid including your face or identifying details.
            </p>
          </div>
        )}
        <button className="q-speak" onClick={() => tts.speak(turn.question_urdu)}>
          🔊 دوبارہ سنیں · Replay
        </button>

        {!turn.image_request && <div className="chips">
          {(turn.quick_replies || []).map((qr, i) => (
            <button key={i} className="chip" onClick={() => doAnswer(qr.urdu)}>
              {qr.urdu}
              <span className="chip-en">{qr.english}</span>
            </button>
          ))}
        </div>}
      </div>

      {!turn.image_request && <div className="claude-composer compact-composer">
        <textarea
          className="urdu"
          dir="auto"
          rows={2}
          placeholder={answeringByVoice ? speech.transcript || 'سن رہے ہیں…' : 'یا یہاں جواب لکھیں…'}
          value={answeringByVoice ? speech.transcript : typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && typed.trim()) {
              e.preventDefault()
              doAnswer(typed)
            }
          }}
          disabled={answeringByVoice}
        />
        <footer>
        {speech.supported && (
          <button
            className={`mini-mic ${answeringByVoice && speech.listening ? 'listening' : ''}`}
            onClick={() => (answeringByVoice && speech.listening ? speech.stop() : answerVoice())}
            aria-label="Answer by voice"
          >
            {answeringByVoice && speech.listening ? '⏹' : '🎤'}
          </button>
        )}
          <label
            className={`mini-mic attach-mic ${attaching ? 'busy' : ''}`}
            title="Attach a photo (rash, injury, report)"
            aria-label="Attach a photo"
          >
            {attaching ? '⋯' : '📎'}
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0]
                if (!f || !sessionId) return
                setAttachError('')
                setAttaching(true)
                try {
                  const res = await attachChatImage(profile.id, f)
                  const description = (res && res.description) || ''
                  if (description) {
                    await doAnswer(`[Photo attached] ${description}`)
                  } else {
                    setAttachError('Could not describe this photo. Try a clearer image.')
                  }
                } catch (err) {
                  setAttachError(err?.message || 'Attach failed')
                } finally {
                  setAttaching(false)
                  e.target.value = ''
                }
              }}
            />
          </label>
          <span>Answer naturally</span>
          <button className="composer-send" onClick={() => doAnswer(typed)} disabled={!typed.trim() || answeringByVoice} aria-label="Send">↑</button>
        </footer>
        {attachError && <div className="notice notice-warn" style={{marginTop:6, fontSize:12}}>{attachError}</div>}
      </div>}

      <AnalysisPanel analysis={turn.analysis} />

      <button className="btn btn-outline no-print" onClick={reset}>
        نئی بات · Start over
      </button>
    </div>
  )
}
