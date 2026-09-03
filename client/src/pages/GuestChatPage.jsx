import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TriageResult from '../components/TriageResult'
import MicButton from '../components/MicButton'
import {
  attachGuestTriageFile,
  clearGuestTriage,
  guestTriageAnswer,
  guestTriageChat,
  guestTriageStart,
  retryGuestTriage,
} from '../api'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { useTextToSpeech } from '../hooks/useTextToSpeech'

const STORAGE_KEY = 'nabz_guest_assessment_v1'
const STARTERS = [
  ['مجھے بخار اور سر درد ہے', 'I have a fever and headache'],
  ['کھانسی اور گلے میں درد ہے', 'I have a cough and sore throat'],
  ['پیٹ میں درد ہو رہا ہے', 'I have stomach pain'],
  ['میری دوا کے بارے میں سوال ہے', 'I have a medicine question'],
]

function PulseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12h4l2.1-6 4.2 12 2.2-6h6.5" /></svg>
}

function loadDraft() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    if (!value?.stateToken || !Array.isArray(value.messages)) return null
    if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return value
  } catch {
    return null
  }
}

function QuestionCard({ turn, active, busy, onAnswer, onVoiceAnswer, onReplay, speaking, listening, speechSupported }) {
  const questionNumber = Math.max(1, turn.analysis?.questions_asked || 1)
  const reportedProgress = turn.analysis?.completeness || turn.analysis?.confidence || 0
  // Live providers occasionally omit confidence. Progress must still advance
  // with each persisted question instead of remaining on the 15% fallback.
  const questionFloor = Math.min(0.15 + (questionNumber - 1) * 0.18, 0.87)
  const progress = Math.min(95, Math.round(Math.max(reportedProgress, questionFloor) * 100))
  return (
    <article className={`guest-question-card ${active ? 'active' : 'answered'}`}>
      <div className="guest-question-meta">
        <span>NABZ FOCUSED ASSESSMENT</span>
        <span>Question {turn.analysis?.questions_asked || 1} · {progress}% complete</span>
      </div>
      <div className="guest-progress" aria-label={`Assessment ${progress}% complete`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="guest-question-heading">
        <span className="guest-ai-avatar"><PulseIcon /></span>
        <div>
          <h2 className="urdu" dir="rtl">{turn.question_urdu}</h2>
          <p>{turn.question_english}</p>
        </div>
        <button
          type="button"
          className="guest-audio-btn"
          onClick={() => onReplay(turn.question_urdu)}
          aria-label="Read this question aloud"
        >
          {speaking && active ? '■' : '◖))'}
        </button>
      </div>
      {turn.why_this_matters && active && (
        <div className="guest-why"><strong>Why this matters</strong>{turn.why_this_matters}</div>
      )}
      {active && (
        <div className="guest-replies">
          {turn.quick_replies?.map((reply, index) => (
            <button
              type="button"
              disabled={busy || listening}
              key={`${reply.english}-${index}`}
              onClick={() => onAnswer(reply.english, reply)}
            >
              <span className="urdu" dir="rtl">{reply.urdu}</span>
              <small>{reply.english}</small>
            </button>
          ))}
          <button
            type="button"
            className={`guest-own-words ${listening ? 'recording' : ''}`}
            onClick={onVoiceAnswer}
            disabled={busy || !speechSupported}
            aria-label={listening ? 'Stop recording and send this answer' : 'Answer this question by voice'}
          >
            <span className="guest-own-words-icon">{listening ? '■' : <SmallMicIcon />}</span>
            <span className="guest-own-words-copy">
              <span className="urdu" dir="rtl">اپنے الفاظ میں بتائیے</span>
              <small>{listening ? 'Listening — tap to finish and send' : 'Answer by voice'}</small>
            </span>
          </button>
        </div>
      )}
    </article>
  )
}

function AttachmentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 12.5 5.8-5.8a3 3 0 0 1 4.2 4.2l-7.3 7.3a5 5 0 0 1-7.1-7.1l7.1-7.1" /></svg>
}

function SmallMicIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7" /></svg>
}

function FollowupChat({ entries, busy, value, onChange, onSubmit, onAttach }) {
  const lastEntry = entries[entries.length - 1]
  const limitReached = Boolean(lastEntry?.registration_required)
  const speech = useVoiceInput({ lang: 'ur-PK', silenceMs: 4500 })
  const [attachment, setAttachment] = useState(null)
  const [attaching, setAttaching] = useState(false)
  const [localError, setLocalError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    if (speech.transcript) onChange(speech.transcript)
  }, [speech.transcript, onChange])

  useEffect(() => {
    if (!speech.error) return
    const map = {
      'not-allowed': 'Microphone permission denied. Allow it in your browser settings, then try again.',
      'no-device': 'No microphone found on this device.',
      'device-busy': 'Microphone is busy — check that no call or voice app is active, then tap again.',
      'constraints': 'This device could not start the microphone at the requested settings. Try again.',
      'no-speech': "I couldn't hear anything — please try again.",
    }
    setLocalError(map[speech.error] || 'Voice input could not start. Try again, or type instead.')
  }, [speech.error])

  async function chooseAttachment(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || attaching || busy) return
    setAttaching(true)
    setLocalError('')
    try {
      const result = await onAttach(file)
      setAttachment({ name: file.name, description: result.description })
    } catch (nextError) {
      setLocalError(nextError.message || 'This attachment could not be read.')
    } finally {
      setAttaching(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    const sent = await onSubmit(event, attachment)
    if (sent) setAttachment(null)
  }

  return (
    <section className="guest-followup" id="continue-care-chat">
      <div className="guest-followup-head">
        <span className="guest-ai-avatar"><PulseIcon /></span>
        <div><strong className="urdu" dir="rtl">اس جواب کے بارے میں پوچھیے</strong><small>Your question stays connected to the answer above.</small></div>
        <span className="guest-followup-count">{Math.min(entries.length, 3)}/3 مفت سوال</span>
      </div>
      {entries.map((entry, index) => (
        <div className="guest-followup-pair" key={`${entry.question}-${index}`}>
          <div className="guest-user-bubble">{entry.question}</div>
          <div className={`guest-followup-answer ${entry.limit_reached ? 'limit-reached' : ''}`}>
            {entry.answer.answer_urdu && <p className="urdu" dir="rtl">{entry.answer.answer_urdu}</p>}
            <p>{entry.answer.answer_english}</p>
            {entry.answer.safety_note && <small>{entry.answer.safety_note}</small>}
            {entry.registration_required && (
              <a className="btn btn-primary guest-register-cta" href="/auth?mode=register">
                مفت والٹ بنا کر گفتگو جاری رکھیے →
              </a>
            )}
          </div>
        </div>
      ))}
      {(() => {
        const last = entries[entries.length - 1]
        const usedAll = last?.registration_required
        if (!usedAll) return null
        return (
          <div className="guest-followup-limit-hint">
            <strong className="urdu" dir="rtl">آپ کے تین مفت سوال مکمل ہو گئے ہیں۔</strong>
            <span className="urdu" dir="rtl">مزید پوچھنے اور یہ گفتگو محفوظ رکھنے کے لیے مفت نجی والٹ بنائیے۔</span>
            <a href="/auth?mode=register">والٹ بنائیے — صرف 20 سیکنڈ</a>
          </div>
        )
      })()}
      {attachment && (
        <div className="guest-attachment-preview">
          <AttachmentIcon />
          <span><strong>{attachment.name}</strong><small>Read as temporary supporting context · not saved to a Vault</small></span>
          <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment">×</button>
        </div>
      )}
      {localError && <p className="guest-tool-error" role="alert">{localError}</p>}
      <form className="guest-followup-form" onSubmit={submit}>
        <input ref={fileRef} hidden type="file" accept="image/*,.pdf,application/pdf" onChange={chooseAttachment} />
        <button type="button" className="guest-input-tool" onClick={() => fileRef.current?.click()} disabled={busy || attaching} aria-label="Attach an image or PDF" title="Attach image or PDF">
          {attaching ? '…' : <AttachmentIcon />}
        </button>
        <button type="button" className={`guest-input-tool ${speech.listening ? 'recording' : ''}`} onClick={() => { setLocalError(''); speech.listening ? speech.stop() : speech.start() }} disabled={busy || !speech.supported} aria-label={speech.listening ? 'Stop voice input' : 'Start voice input'} title={speech.supported ? 'Speak your follow-up' : 'Voice input is not supported in this browser'}>
          {speech.listening ? '■' : <SmallMicIcon />}
        </button>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={limitReached ? 'مزید پوچھنے کے لیے والٹ بنائیے…' : (speech.listening ? 'سن رہا ہوں…' : 'اس جواب کے بارے میں سوال پوچھیے…')} disabled={limitReached} />
        <button className="guest-followup-send" disabled={busy || limitReached || (!value.trim() && !attachment)}>{busy ? '…' : 'پوچھیے →'}</button>
      </form>
    </section>
  )
}

export default function GuestChatPage() {
  const navigate = useNavigate()
  const restored = useMemo(loadDraft, [])
  const [stateToken, setStateToken] = useState(restored?.stateToken || '')
  const [expiresAt, setExpiresAt] = useState(restored?.expiresAt || '')
  const [messages, setMessages] = useState(restored?.messages || [])
  const [followups, setFollowups] = useState(restored?.followups || [])
  const [pendingStart, setPendingStart] = useState(null)
  const [typed, setTyped] = useState('')
  const [followupText, setFollowupText] = useState('')
  const [draftAttachment, setDraftAttachment] = useState(null)
  const [attaching, setAttaching] = useState(false)
  // Guest session is inherently temporary — the "Temporary session ·
  // no account required" line at the page bottom is the disclosure;
  // no separate checkbox to click before the mic works.
  const [consent, setConsent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef(null)
  const spokenTurnRef = useRef('')
  const spokenFollowupRef = useRef('')
  const autoSubmitVoiceRef = useRef(false)
  const endRef = useRef(null)
  const resultRef = useRef(null)
  const fileRef = useRef(null)
  const tts = useTextToSpeech()
  const speech = useVoiceInput({ lang: 'ur-PK', silenceMs: 4500 })

  const assistantItems = messages.filter((item) => item.role === 'assistant')
  const currentTurn = [...messages].reverse().find((item) => item.role === 'assistant')?.turn || null
  const resultTurn = currentTurn?.type === 'result' ? currentTurn : null
  const started = Boolean(stateToken || messages.length || pendingStart)

  // Every newly returned assessment question is read once. The previous user
  // click primes the shared audio element, so this also works on mobile Safari
  // after the network request has completed.
  useEffect(() => {
    if (!currentTurn || currentTurn.type !== 'question' || !currentTurn.question_urdu) return
    const key = `${stateToken}:${assistantItems.length}:${currentTurn.question_urdu}`
    if (spokenTurnRef.current === key) return
    spokenTurnRef.current = key
    tts.speak(currentTurn.question_urdu, { lang: 'ur' })
  }, [assistantItems.length, currentTurn, stateToken, tts.speak])

  useEffect(() => {
    const latest = followups[followups.length - 1]
    const text = latest?.answer?.answer_urdu
    if (!text) return
    const key = `${followups.length}:${text}`
    if (spokenFollowupRef.current === key) return
    spokenFollowupRef.current = key
    tts.speak(text, { lang: 'ur' })
  }, [followups, tts.speak])

  useEffect(() => {
    if (!stateToken) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      stateToken, expiresAt, messages, followups,
    }))
  }, [stateToken, expiresAt, messages, followups])

  useEffect(() => {
    if (!started) return
    if (resultTurn && followups.length === 0 && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages.length, followups.length, busy, started, resultTurn])

  useEffect(() => () => {
    controllerRef.current?.abort()
    tts.cancel()
  }, [tts.cancel])

  useEffect(() => {
    if (speech.transcript) setTyped(speech.transcript)
  }, [speech.transcript])

  useEffect(() => {
    if (!speech.error) return
    autoSubmitVoiceRef.current = false
    const map = {
      'not-allowed': 'Microphone permission denied. Allow it in your browser settings, then try again.',
      'no-device': 'No microphone found on this device.',
      'device-busy': 'Microphone is busy — check that no call or voice app is active, then tap again.',
      'constraints': 'This device could not start the microphone at the requested settings. Try again.',
      'no-speech': "I couldn't hear anything — please try again.",
    }
    setError(map[speech.error] || 'Voice input could not start. Try again, or type instead.')
  }, [speech.error])

  // A voice turn is a complete interaction: once recognition ends (either
  // because the user taps stop or the silence timer fires), send the final
  // transcript without making the user press the arrow as a second step.
  useEffect(() => {
    if (speech.listening || !autoSubmitVoiceRef.current) return
    const spokenText = speech.transcript.trim()
    if (!spokenText) return
    autoSubmitVoiceRef.current = false
    speech.reset()
    setTyped('')
    if (started) answer(spokenText)
    else start(spokenText)
  }, [speech.listening, speech.transcript])

  function saveResponse(response, userMessage) {
    setStateToken(response.state_token)
    setExpiresAt(response.expires_at)
    setMessages((existing) => [
      ...existing,
      { role: 'user', ...userMessage },
      { role: 'assistant', turn: response.turn },
    ])
  }

  function visibleUserMessage(value, display = null) {
    if (display) return {
      text: display.english || value,
      urdu: display.urdu || '',
    }
    const isUrdu = /[\u0600-\u06ff]/.test(value)
    return {
      text: isUrdu ? '' : value,
      urdu: isUrdu ? value : '',
    }
  }

  async function start(text, display = null) {
    const value = text.trim()
    if (!value || busy) return
    if (!consent) {
      setError('Please confirm the temporary-session privacy note before starting.')
      return
    }
    const userMessage = visibleUserMessage(value, display)
    tts.prime()
    tts.cancel()
    setPendingStart(userMessage)
    setTyped('')
    setBusy(true)
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await guestTriageStart(value, true, controller.signal)
      saveResponse(response, userMessage)
      return true
    } catch (nextError) {
      if (nextError.name === 'AbortError' && !nextError.timedOut) return false
      setTyped(display?.english || value)
      setError(nextError.message || 'Nabz could not start the assessment. Please try again.')
      return false
    } finally {
      setPendingStart(null)
      setBusy(false)
      controllerRef.current = null
    }
  }

  async function answer(text, display = null) {
    if (!stateToken || !text.trim() || busy) return
    tts.prime()
    tts.cancel()
    setBusy(true)
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await guestTriageAnswer(stateToken, text.trim(), controller.signal)
      saveResponse(response, {
        text: display?.english || text.trim(),
        urdu: display?.urdu || '',
      })
      setTyped('')
      return true
    } catch (nextError) {
      if (nextError.status === 410 || nextError.status === 404) {
        sessionStorage.removeItem(STORAGE_KEY)
        setStateToken('')
      }
      setError(nextError.message || 'Your answer could not be sent. Please try again.')
      return false
    } finally {
      setBusy(false)
      controllerRef.current = null
    }
  }

  async function submitFollowup(event, attachment = null) {
    event.preventDefault()
    const typedQuestion = followupText.trim()
    const attachmentContext = attachment
      ? `[Temporary attachment: ${attachment.name}] ${attachment.description}`
      : ''
    const question = [attachmentContext, typedQuestion].filter(Boolean).join('\n')
    if (!question || !stateToken || busy) return
    tts.prime()
    tts.cancel()
    setBusy(true)
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await guestTriageChat(stateToken, question, controller.signal)
      const visibleQuestion = [attachment ? `📎 ${attachment.name}` : '', typedQuestion].filter(Boolean).join('\n')
      setFollowups((items) => [...items, {
        question: visibleQuestion,
        answer: response.answer,
        followups_used: response.followups_used,
        followups_limit: response.followups_limit,
        registration_required: response.registration_required,
      }])
      setFollowupText('')
      return true
    } catch (nextError) {
      if (nextError.status === 403 && nextError.body?.detail?.code === 'guest_followup_limit_reached') {
        setFollowups((items) => [...items, {
          question: typedQuestion,
          answer: {
            answer_english: nextError.body.detail.message,
            answer_urdu: 'آپ کے مفت سوال مکمل ہو گئے ہیں۔ اپنی نجی والٹ بنائیے (صرف 20 سیکنڈ، بالکل مفت) تاکہ گفتگو جاری رکھی جا سکے اور اسے خاندانی ریکارڈ میں محفوظ کیا جا سکے۔',
            safety_note: 'Guest follow-up limit reached.',
          },
          registration_required: true,
          limit_reached: true,
        }])
        setFollowupText('')
        return true
      }
      setError(nextError.message || 'The follow-up could not be answered right now.')
      return false
    } finally {
      setBusy(false)
      controllerRef.current = null
    }
  }

  async function retryAssessment() {
    if (!stateToken || busy) return
    tts.cancel()
    setBusy(true)
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await retryGuestTriage(stateToken, controller.signal)
      setExpiresAt(response.expires_at)
      setMessages((items) => [...items, { role: 'assistant', turn: response.turn }])
    } catch (nextError) {
      setError(nextError.message || 'The live assessment is still unavailable. Please try again shortly.')
    } finally {
      setBusy(false)
      controllerRef.current = null
    }
  }

  async function submitTyped(event) {
    event.preventDefault()
    if (resultTurn) return
    autoSubmitVoiceRef.current = false
    if (speech.listening) speech.stop()
    const typedValue = typed.trim()
    const attachmentContext = draftAttachment
      ? `[Temporary attachment: ${draftAttachment.name}] ${draftAttachment.description}`
      : ''
    const modelText = [attachmentContext, typedValue].filter(Boolean).join('\n')
    if (!modelText) return
    const visible = [draftAttachment ? `📎 ${draftAttachment.name}` : '', typedValue].filter(Boolean).join('\n')
    const sent = started
      ? await answer(modelText, { english: visible })
      : await start(modelText, { english: visible })
    if (sent) setDraftAttachment(null)
  }

  function toggleVoice() {
    if (!consent && !started) {
      setError('Please confirm the temporary-session privacy note before using voice input.')
      return
    }
    setError('')
    tts.cancel()
    tts.prime()
    if (speech.listening) speech.stop()
    else {
      autoSubmitVoiceRef.current = true
      speech.reset()
      setTyped('')
      speech.start()
    }
  }

  async function describeAttachment(file) {
    return attachGuestTriageFile(file, { stateToken, consent: consent || started })
  }

  async function chooseDraftAttachment(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy || attaching) return
    if (!consent && !started) {
      setError('Please confirm the temporary-session privacy note before attaching a health file.')
      return
    }
    setAttaching(true)
    setError('')
    try {
      const result = await describeAttachment(file)
      setDraftAttachment({ name: file.name, description: result.description })
    } catch (nextError) {
      setError(nextError.message || 'This attachment could not be read.')
    } finally {
      setAttaching(false)
    }
  }

  async function reset() {
    tts.cancel()
    controllerRef.current?.abort()
    const oldToken = stateToken
    setStateToken('')
    setExpiresAt('')
    setMessages([])
    setPendingStart(null)
    setFollowups([])
    setTyped('')
    setFollowupText('')
    setDraftAttachment(null)
    setError('')
    spokenTurnRef.current = ''
    spokenFollowupRef.current = ''
    autoSubmitVoiceRef.current = false
    setConsent(true)
    speech.reset()
    sessionStorage.removeItem(STORAGE_KEY)
    if (oldToken) clearGuestTriage(oldToken).catch(() => {})
  }

  return (
    <div className="guest-chat-page">
      <aside className="guest-chat-sidebar">
        <button className="guest-brand" onClick={() => navigate('/welcome')}>
          <span><PulseIcon /></span><b className="urdu">نبض</b><small>NABZ</small>
        </button>
        <div className="guest-side-label">CONSULTING FOR</div>
        <div className="guest-person-card"><span>Y</span><div><strong>Yourself</strong><small>Temporary guest session</small></div></div>
        {started && (
          <button className="guest-side-new" onClick={reset}>
            <span aria-hidden="true">＋</span>
            <span><b className="urdu" dir="rtl">نئی گفتگو</b><small>Start a new chat</small></span>
          </button>
        )}
        <div className="guest-side-note">
          <strong>Private by design</strong>
          <p>This conversation is temporary, has no name attached, and expires automatically.</p>
        </div>
        <button className="guest-side-login" onClick={() => navigate('/auth?mode=login')}>Log in to your Vault</button>
      </aside>

      <main className="guest-chat-main">
        <header className="guest-chat-header">
          <div className="guest-mobile-brand"><span><PulseIcon /></span><strong>Nabz</strong></div>
          <div className="guest-guide-status"><span className="guest-ai-avatar"><PulseIcon /></span><div><strong className="urdu" dir="rtl">نبض</strong><small>Nabz · Guest</small></div></div>
          <div className="guest-header-actions">
            {started && <button className="guest-header-new" onClick={reset} title="Start a new chat"><span className="urdu">نئی گفتگو</span></button>}
            <button onClick={() => navigate('/auth?mode=login')} className="urdu-btn"><span className="urdu" dir="rtl">لاگ اِن</span></button>
            <button className="primary urdu-btn" onClick={() => navigate('/auth?mode=register')}>
              <span className="urdu" lang="ur" dir="rtl">والٹ بنائیے</span>
            </button>
          </div>
        </header>

        <div className={`guest-chat-scroll ${started ? 'has-conversation' : ''}`}>
          {!started && (
            <section className="guest-welcome">
              <h1 className="urdu urdu-hero" lang="ur" dir="rtl">آج آپ کی طبیعت کیسی ہے؟</h1>
              <p className="guest-welcome-sub"><span className="urdu" lang="ur" dir="rtl">مجھے بتائیے، میں آپ کی مدد کروں گا۔</span><span className="guest-welcome-en">Tell me how you're feeling — I'm here to help.</span></p>
              <div className="guest-voice-first">
                <div className="guest-voice-rings"><i /><i /></div>
                <MicButton listening={speech.listening} disabled={busy || !speech.supported || !consent} onClick={toggleVoice} />
                <small className="guest-voice-hint">
                  {consent
                    ? (speech.listening ? 'مکمل کرکے بھیجنے کے لیے مائیک دوبارہ دبائیے' : 'مائیک دبائیے اور بولیے')
                    : 'آواز استعمال کرنے کے لیے رازداری کی اجازت دیجیے'}
                </small>
              </div>
              <div className="guest-starter-label"><span className="urdu" lang="ur" dir="rtl">یا کوئی عام علامت منتخب کیجیے</span></div>
              <div className="guest-starters">
                {STARTERS.map(([urdu, english]) => (
                  <button key={english} onClick={() => start(english, { urdu, english })} disabled={busy || speech.listening}>
                    <span className="urdu" dir="rtl">{urdu}</span><small>{english}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {started && (
            <section className="guest-timeline" aria-live="polite">
              <div className="guest-date-rule"><span>Temporary assessment · Today</span></div>
              {pendingStart && (
                <div className="guest-user-bubble guest-user-bubble-pending">
                  {pendingStart.urdu && <span className="urdu" dir="rtl">{pendingStart.urdu}</span>}
                  {pendingStart.text && <span>{pendingStart.text}</span>}
                  <small className="urdu" lang="ur" dir="rtl">آپ کی بات موصول ہو گئی ہے ✓</small>
                </div>
              )}
              {messages.map((message, index) => {
                if (message.role === 'user') {
                  return <div className="guest-user-bubble" key={`user-${index}`}>
                    {message.urdu && <span className="urdu" dir="rtl">{message.urdu}</span>}
                    {message.text && <span>{message.text}</span>}
                  </div>
                }
                if (message.turn.type === 'result') {
                  return (
                    <div className="guest-result-wrap" ref={resultRef} key={`assistant-${index}`}>
                      <TriageResult
                        turn={message.turn}
                        guest
                        showNearby={false}
                        onReplay={() => tts.speak(message.turn.advice_urdu)}
                        speaking={tts.speaking}
                        ttsSupported={tts.supported}
                        onNew={reset}
                        onSave={() => navigate('/auth?mode=register')}
                        onRetry={message.turn.response_source === 'ai_unavailable' ? retryAssessment : undefined}
                        chatSlot={['live_ai', 'test_model'].includes(message.turn.response_source) ? (
                          <FollowupChat
                            entries={followups}
                            busy={busy}
                            value={followupText}
                            onChange={setFollowupText}
                            onSubmit={submitFollowup}
                            onAttach={describeAttachment}
                          />
                        ) : null}
                      />
                    </div>
                  )
                }
                const assistantIndex = assistantItems.indexOf(message)
                const active = assistantIndex === assistantItems.length - 1 && !resultTurn
                return <QuestionCard
                  key={`assistant-${index}`}
                  turn={message.turn}
                  active={active}
                  busy={busy}
                  speaking={tts.speaking}
                  listening={speech.listening}
                  speechSupported={speech.supported}
                  onAnswer={answer}
                  onVoiceAnswer={toggleVoice}
                  onReplay={(text) => tts.speak(text)}
                />
              })}
              {busy && (
                <div className="guest-thinking">
                  <span className="guest-ai-avatar"><PulseIcon /></span>
                  <div><i /><i /><i /></div>
                  <p><strong className="urdu" dir="rtl">نبض آپ کی بات سمجھ رہا ہے…</strong><span>اگلا مناسب سوال تیار کیا جا رہا ہے</span></p>
                </div>
              )}
              <div ref={endRef} />
            </section>
          )}

          {error && <div className="guest-error" role="alert">{error}</div>}
        </div>

        {!resultTurn && (
          <div className="guest-composer-dock">
            <form className="guest-composer" onSubmit={submitTyped}>
              <input ref={fileRef} hidden type="file" accept="image/*,.pdf,application/pdf" onChange={chooseDraftAttachment} />
              <button type="button" className="guest-compose-icon" onClick={() => fileRef.current?.click()} disabled={busy || attaching} aria-label="Attach an image or PDF" title="Attach image or PDF">
                {attaching ? '…' : <AttachmentIcon />}
              </button>
              <textarea
                id="guest-message"
                rows="1"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submitTyped(event)
                  }
                }}
                dir="auto"
                placeholder={started ? 'اپنا جواب لکھیے…' : 'اپنی علامات لکھیے…'}
                aria-label={started ? 'اپنا جواب لکھیے' : 'اپنی علامات لکھیے'}
              />
              {/* Hide the composer mic while the big center mic is on-screen (welcome state)
                  to avoid the double-mic ambiguity. Show it once the conversation has started. */}
              {started && (
                <button type="button" className={`guest-composer-mic ${speech.listening ? 'recording' : ''}`} onClick={toggleVoice} disabled={busy || !speech.supported} aria-label={speech.listening ? 'Stop voice input' : 'Start voice input'} title={speech.listening ? 'Stop recording' : 'Speak your reply'}>
                  {speech.listening ? '■' : <SmallMicIcon />}
                </button>
              )}
              <button className="guest-composer-send" disabled={busy || (!typed.trim() && !draftAttachment) || (!started && !consent)} aria-label="Send message">{busy ? '…' : '↑'}</button>
            </form>
            {draftAttachment && (
              <div className="guest-draft-attachment">
                <AttachmentIcon /><span><strong>{draftAttachment.name}</strong><small>Temporary supporting context · not saved to a Vault</small></span>
                <button type="button" onClick={() => setDraftAttachment(null)} aria-label="Remove attachment">×</button>
              </div>
            )}
            <div className="guest-composer-note">
              <a href="tel:1122" className="guest-emergency-pill" aria-label="Call emergency services 1122">
                <span aria-hidden="true">🚨</span>
                <span className="urdu" lang="ur" dir="rtl">ایمرجنسی؟</span>
                <strong>1122</strong>
              </a>
              <span className="guest-composer-fineprint"><span className="urdu" lang="ur" dir="rtl">عمومی AI رہنمائی · تشخیص نہیں</span><span className="urdu" lang="ur" dir="rtl">عارضی گفتگو · اکاؤنٹ ضروری نہیں</span></span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
