import { useEffect, useRef, useState } from 'react'
import MicButton from './MicButton'
import AnalysisPanel from './AnalysisPanel'
import TriageResult from './TriageResult'
import EncounterChat from './EncounterChat'
import { useVoiceInput } from '../hooks/useVoiceInput'
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
  const voiceLang = 'ur-PK'

  // Chrome uses interim browser recognition for a true live transcript. Other
  // browsers use the cloud recorder fallback. A short silence closes the turn,
  // while Done speaking remains available for immediate review.
  const speech = useVoiceInput({ lang: voiceLang, silenceMs: 3200 })
  const tts = useTextToSpeech()
  const spokenRef = useRef(null)
  const submittedRef = useRef(false)
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [initialAttachment, setInitialAttachment] = useState(null)
  const requestControllerRef = useRef(null)
  const lastRequestRef = useRef(null)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [streamStage, setStreamStage] = useState(null) // {stage, message, latency_ms?}
  const [pendingVoiceText, setPendingVoiceText] = useState('')
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

  useEffect(() => {
    if (['result', 'error'].includes(phase)) setPendingVoiceText('')
  }, [phase])

  // Permission failures and recorder start errors happen asynchronously.
  // Return to the phase the user came from so the mic remains retryable
  // instead of leaving new chat stuck in the non-recording "listening" UI.
  useEffect(() => {
    if (!speech.error) return
    submittedRef.current = false
    if (phase === 'listening') {
      setPhase('idle')
      setError(
        speech.error === 'not-allowed'
          ? 'Microphone permission was denied. Allow it in browser settings, then try again.'
          : 'Voice input could not start. Check the microphone and try again.',
      )
    } else if (phase === 'answering-voice') {
      setPhase('question')
      setError(
        speech.error === 'not-allowed'
          ? 'Microphone permission was denied. Allow it in browser settings, then try again.'
          : 'Voice input could not start. Check the microphone and try again.',
      )
    }
  }, [phase, speech.error])

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
    const spokenText = turn.type === 'question' ? turn.question_urdu : turn.advice_urdu
    const key = `${turn.session_id}:${turn.type}:${spokenText || ''}`
    const text = turn.type === 'question' ? turn.question_urdu : turn.advice_urdu
    if (text && spokenRef.current !== key) {
      spokenRef.current = key
      tts.speak(text, { lang: 'ur' })
    }
  }, [turn, tts.speak])

  // Voice is one complete action in the signed-in flow too. When recognition
  // ends—Done button or natural silence—submit the final transcript directly.
  useEffect(() => {
    if (
      (phase === 'listening' || phase === 'answering-voice') &&
      !speech.listening &&
      speech.transcript.trim() &&
      !submittedRef.current
    ) {
      submittedRef.current = true
      const text = speech.transcript.trim()
      const answeringQuestion = phase === 'answering-voice'
      setPendingVoiceText(text)
      speech.reset()
      if (answeringQuestion) doAnswer(text, { fromVoice: true })
      else doStart(withInitialAttachment(text), { fromVoice: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening, speech.transcript, phase])

  function _cancelStream() {
    try { streamCtrlRef.current?.cancel() } catch { /* ignore */ }
    streamCtrlRef.current = null
    setStreamStage(null)
  }

  async function doStart(text, { fromVoice = false } = {}) {
    if (!text || !text.trim()) return
    if (!fromVoice) setPendingVoiceText('')
    tts.prime()
    tts.cancel()
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

  async function doAnswer(text, { fromVoice = false } = {}) {
    if (!text || !text.trim()) return
    if (!fromVoice) setPendingVoiceText('')
    // A selected answer ends the current assistant turn immediately. Cancel
    // its audio before the network request so it never speaks over the next
    // question or the processing state.
    tts.prime()
    tts.cancel()
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
    tts.cancel()
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
    tts.prime()
    submittedRef.current = false
    speech.start()
    setPhase('answering-voice')
  }

  function withInitialAttachment(text) {
    const context = initialAttachment
      ? `[Attached file: ${initialAttachment.name}] ${initialAttachment.description}`
      : ''
    return [context, text.trim()].filter(Boolean).join('\n')
  }

  function submitInitialSymptoms() {
    const payload = withInitialAttachment(typed)
    if (payload) doStart(payload)
  }

  async function chooseInitialAttachment(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || attaching) return
    setAttaching(true)
    setAttachError('')
    try {
      const result = await attachChatImage(profile.id, file)
      setInitialAttachment({
        name: file.name,
        description: result.description || 'Clinical file attached for supporting context.',
      })
    } catch (nextError) {
      setAttachError(nextError.message || 'Could not read that attachment.')
    } finally {
      setAttaching(false)
    }
  }

  function reset() {
    tts.cancel()
    speech.reset()
    submittedRef.current = false
    setTurn(null)
    setSessionId(null)
    setTyped('')
    setPendingVoiceText('')
    setInitialAttachment(null)
    setAttachError('')
    selectClinicalImage(null)
    setError('')
    setPhase('idle')
  }

  // --- Idle: capture the first symptom -----------------------------------
  if (phase === 'idle' || phase === 'listening') {
    const listeningInitial = phase === 'listening'
    const recordingInitial = listeningInitial && speech.listening
    return (
      <div className="q-card triage-start-card">
        {error && <div className="notice notice-warn">{error}</div>}
        <div className="triage-start-head">
          <div>
            <div className="hero-greet-ur urdu" lang="ur" dir="rtl">
              <bdi dir="auto">{profile.display_name}</bdi>، آج آپ کی طبیعت کیسی ہے؟ مجھے بتائیے کہ میں آپ کی کیا مدد کر سکتا ہوں۔
            </div>
            <div className="hero-greet-en">Tell me how you're feeling, {profile.display_name} — I'm here to help.</div>
          </div>
        </div>

        {!speech.supported && (
          <div className="notice notice-info">
            <span className="ur urdu">اس براؤزر میں آواز دستیاب نہیں — نیچے لکھیں۔</span>
            Voice input isn’t supported here. Please type below.
          </div>
        )}

        {speech.error === 'not-allowed' && (
          <div className="notice notice-warn" style={{ marginTop: 8 }}>
            <span className="ur urdu">مائیک کی اجازت درکار ہے — یا نیچے لکھیں۔</span>
            Microphone permission denied. Allow it, or type below.
          </div>
        )}

        <div className="voice-first-start">
          <div className="voice-start-rings" aria-hidden="true"><i /><i /></div>
          <MicButton
            listening={recordingInitial}
            disabled={!speech.supported}
            onClick={() => (listeningInitial ? speech.stop() : startVoice())}
          />
          <div className="voice-first-copy">
            <strong>{recordingInitial ? 'Listening — tap to finish and send' : listeningInitial ? 'Preparing your words…' : 'Start with your voice'}</strong>
            <span className="urdu" lang="ur" dir="rtl">{recordingInitial ? 'اپنی بات مکمل ہونے پر مائیک دوبارہ دبائیے' : listeningInitial ? 'آپ کی آواز کو تحریر میں بدلا جا رہا ہے…' : 'مائیک دبائیے اور اطمینان سے اپنی بات بتائیے'}</span>
            <small>{recordingInitial ? 'آپ کے الفاظ نیچے ساتھ ساتھ دکھائی دے رہے ہیں' : listeningInitial ? 'Your question will be sent automatically' : (speech.backend === 'live' ? 'Live transcript as you speak' : 'Secure cloud transcription after recording')}</small>
          </div>
        </div>

        <form
          className="care-composer symptom-composer"
          onSubmit={(e) => {
            e.preventDefault()
            tts.prime()
            submitInitialSymptoms()
          }}
        >
          <textarea
            className={`urdu ${listeningInitial ? 'voice-transcript-field' : ''}`}
            dir="auto"
            rows={3}
            placeholder={listeningInitial ? 'سن رہا ہوں…' : 'اپنی علامات تفصیل سے لکھیے…'}
            value={listeningInitial ? speech.transcript : typed}
            onChange={(e) => setTyped(e.target.value)}
            readOnly={listeningInitial}
            aria-live={listeningInitial ? 'polite' : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && (typed.trim() || initialAttachment)) {
                e.preventDefault()
                tts.prime()
                submitInitialSymptoms()
              }
            }}
          />
          {initialAttachment && (
            <div className="care-attachment-preview">
              <span aria-hidden="true">📎</span>
              <span><strong>{initialAttachment.name}</strong><small>Included as supporting context</small></span>
              <button type="button" onClick={() => setInitialAttachment(null)} aria-label="Remove attachment">×</button>
            </div>
          )}
          {attachError && <div className="care-attachment-error" role="alert">{attachError}</div>}
          <footer>
            <button className={`care-tool ${listeningInitial ? 'recording' : ''}`} type="button" onClick={() => (listeningInitial ? speech.stop() : startVoice())} disabled={!speech.supported}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21" /></svg>
              {listeningInitial ? 'مکمل کرکے بھیجیے' : 'بولیے'}
            </button>
            <label className={`care-tool ${attaching ? 'busy' : ''}`} title="Attach a clinical image or PDF">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 12.5 5.8-5.8a3 3 0 0 1 4.2 4.2l-7.3 7.3a5 5 0 0 1-7.1-7.1l7.1-7.1" /></svg>
              {attaching ? 'پڑھ رہے ہیں…' : 'فائل منسلک کیجیے'}
              <input type="file" hidden accept="image/*,.pdf,application/pdf" onChange={chooseInitialAttachment} />
            </label>
            <span>{speech.backend === 'live' ? 'Live transcript in Chrome' : 'Transcript appears after Done'} · Enter to send</span>
            <button className="care-send" type="submit" disabled={listeningInitial || (!typed.trim() && !initialAttachment)} aria-label="Send">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-5 16-3-6-8-2Zm8 2 8-10" /></svg>
            </button>
          </footer>
        </form>
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
        {pendingVoiceText && (
          <div className="authed-voice-pending">
            <p className="urdu" dir="auto">{pendingVoiceText}</p>
            <small className="urdu" dir="rtl">آپ کی بات مل گئی ہے ✓</small>
          </div>
        )}
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
          chatSlot={['live_ai', 'test_model'].includes(turn.response_source) ? <EncounterChat sessionId={sessionId} profileId={profile.id} /> : null}
        />
      </div>
    )
  }

  // --- Question (with live analysis + answering) -------------------------
  const answeringByVoice = phase === 'answering-voice'
  return (
    <div className="conv">
      {error && <div className="notice notice-warn">{error}</div>}
      {pendingVoiceText && (
        <div className="authed-voice-pending authed-voice-message">
          <p className="urdu" dir="auto">{pendingVoiceText}</p>
          <small className="urdu" dir="rtl">آپ کا جواب ✓</small>
        </div>
      )}
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
            <button type="button" key={i} className="chip" disabled={answeringByVoice} onClick={() => doAnswer(qr.urdu)}>
              {qr.urdu}
              <span className="chip-en">{qr.english}</span>
            </button>
          ))}
          {speech.supported && (
            <button
              type="button"
              className={`chip chip-voice-answer ${answeringByVoice ? 'recording' : ''}`}
              onClick={() => (answeringByVoice ? speech.stop() : answerVoice())}
            >
              <span className="chip-voice-icon" aria-hidden="true">{answeringByVoice ? '■' : '🎤'}</span>
              <span className="urdu">{answeringByVoice ? 'مکمل کرکے بھیجیں' : 'اپنے الفاظ میں بتائیے'}</span>
              <span className="chip-en">{answeringByVoice ? 'Finish and send' : 'Answer by voice'}</span>
            </button>
          )}
        </div>}
      </div>

      {!turn.image_request && <div className="claude-composer compact-composer">
        {answeringByVoice && (
          <div className="inline-voice-status" role="status">
            <span className="voice-live-dot" />
            <span className="urdu" dir="rtl">{speech.listening ? 'سن رہا ہوں — مکمل ہونے پر دوبارہ مائیک دبائیے' : 'آپ کی آواز کو تحریر میں بدلا جا رہا ہے…'}</span>
          </div>
        )}
        <textarea
          className={`urdu ${answeringByVoice ? 'voice-transcript-field' : ''}`}
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
          readOnly={answeringByVoice}
          aria-live={answeringByVoice ? 'polite' : undefined}
        />
        <footer>
        {speech.supported && (
          <button
            type="button"
            className={`mini-mic ${answeringByVoice && speech.listening ? 'listening' : ''}`}
            onClick={() => (answeringByVoice ? speech.stop() : answerVoice())}
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
                  // Build a richer turn so the model sees concern_flags too.
                  const flags = Array.isArray(res?.concern_flags) ? res.concern_flags : []
                  const features = Array.isArray(res?.visible_features) ? res.visible_features : []
                  const parts = [description]
                  if (features.length) parts.push(`Visible: ${features.slice(0, 5).join('; ')}.`)
                  if (flags.length) parts.push(`Concern flags: ${flags.join(', ')}.`)
                  if (res?.urgency_hint) parts.push(`Vision urgency hint: ${res.urgency_hint}.`)
                  const composed = parts.filter(Boolean).join(' ')
                  if (composed.trim()) {
                    await doAnswer(`[Photo attached] ${composed}`)
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
