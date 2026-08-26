import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TriageResult from '../components/TriageResult'
import {
  clearGuestTriage,
  guestTriageAnswer,
  guestTriageChat,
  guestTriageStart,
  retryGuestTriage,
} from '../api'
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

function QuestionCard({ turn, active, busy, onAnswer, onReplay, speaking }) {
  const progress = Math.max(8, Math.round((turn.analysis?.completeness || turn.analysis?.confidence || 0.15) * 100))
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
              disabled={busy}
              key={`${reply.english}-${index}`}
              onClick={() => onAnswer(reply.english, reply)}
            >
              <span className="urdu" dir="rtl">{reply.urdu}</span>
              <small>{reply.english}</small>
            </button>
          ))}
          <button type="button" className="guest-own-words" onClick={() => document.getElementById('guest-message')?.focus()}>
            اپنے الفاظ میں <small>Answer in your own words</small>
          </button>
        </div>
      )}
    </article>
  )
}

function FollowupChat({ entries, busy, value, onChange, onSubmit }) {
  return (
    <section className="guest-followup" id="continue-care-chat">
      <div className="guest-followup-head">
        <span className="guest-ai-avatar"><PulseIcon /></span>
        <div><strong>Ask about this assessment</strong><small>Your follow-up stays connected to the transcript above.</small></div>
      </div>
      {entries.map((entry, index) => (
        <div className="guest-followup-pair" key={`${entry.question}-${index}`}>
          <div className="guest-user-bubble">{entry.question}</div>
          <div className="guest-followup-answer">
            {entry.answer.answer_urdu && <p className="urdu" dir="rtl">{entry.answer.answer_urdu}</p>}
            <p>{entry.answer.answer_english}</p>
            <small>{entry.answer.safety_note}</small>
          </div>
        </div>
      ))}
      <form className="guest-followup-form" onSubmit={onSubmit}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Ask a follow-up about this result…" />
        <button disabled={busy || !value.trim()}>{busy ? '…' : 'Ask →'}</button>
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
  const [typed, setTyped] = useState('')
  const [followupText, setFollowupText] = useState('')
  const [consent, setConsent] = useState(Boolean(restored?.stateToken))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef(null)
  const endRef = useRef(null)
  const resultRef = useRef(null)
  const tts = useTextToSpeech()

  const currentTurn = [...messages].reverse().find((item) => item.role === 'assistant')?.turn || null
  const resultTurn = currentTurn?.type === 'result' ? currentTurn : null
  const started = Boolean(stateToken || messages.length)

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

  function saveResponse(response, userMessage) {
    setStateToken(response.state_token)
    setExpiresAt(response.expires_at)
    setMessages((existing) => [
      ...existing,
      { role: 'user', ...userMessage },
      { role: 'assistant', turn: response.turn },
    ])
  }

  async function start(text, display = null) {
    const value = text.trim()
    if (!value || busy) return
    if (!consent) {
      setError('Please confirm the temporary-session privacy note before starting.')
      return
    }
    tts.cancel()
    setBusy(true)
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await guestTriageStart(value, true, controller.signal)
      saveResponse(response, {
        text: display?.english || value,
        urdu: display?.urdu || '',
      })
      setTyped('')
    } catch (nextError) {
      setError(nextError.message || 'Nabz could not start the assessment. Please try again.')
    } finally {
      setBusy(false)
      controllerRef.current = null
    }
  }

  async function answer(text, display = null) {
    if (!stateToken || !text.trim() || busy) return
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
    } catch (nextError) {
      if (nextError.status === 410 || nextError.status === 404) {
        sessionStorage.removeItem(STORAGE_KEY)
        setStateToken('')
      }
      setError(nextError.message || 'Your answer could not be sent. Please try again.')
    } finally {
      setBusy(false)
      controllerRef.current = null
    }
  }

  async function submitFollowup(event) {
    event.preventDefault()
    const question = followupText.trim()
    if (!question || !stateToken || busy) return
    tts.cancel()
    setBusy(true)
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await guestTriageChat(stateToken, question, controller.signal)
      setFollowups((items) => [...items, { question, answer: response.answer }])
      setFollowupText('')
    } catch (nextError) {
      setError(nextError.message || 'The follow-up could not be answered right now.')
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

  function submitTyped(event) {
    event.preventDefault()
    if (resultTurn) return
    if (started) answer(typed)
    else start(typed)
  }

  async function reset() {
    tts.cancel()
    const oldToken = stateToken
    setStateToken('')
    setExpiresAt('')
    setMessages([])
    setFollowups([])
    setTyped('')
    setFollowupText('')
    setError('')
    setConsent(false)
    sessionStorage.removeItem(STORAGE_KEY)
    if (oldToken) clearGuestTriage(oldToken).catch(() => {})
  }

  const assistantItems = messages.filter((item) => item.role === 'assistant')

  return (
    <div className="guest-chat-page">
      <aside className="guest-chat-sidebar">
        <button className="guest-brand" onClick={() => navigate('/welcome')}>
          <span><PulseIcon /></span><b className="urdu">نبض</b><small>NABZ</small>
        </button>
        <div className="guest-side-label">CONSULTING FOR</div>
        <div className="guest-person-card"><span>Y</span><div><strong>Yourself</strong><small>Temporary guest session</small></div></div>
        <div className="guest-side-note">
          <strong>Private by design</strong>
          <p>This conversation is temporary, has no name attached, and expires automatically.</p>
        </div>
        <button className="guest-side-login" onClick={() => navigate('/auth?mode=login')}>Log in to your Vault</button>
      </aside>

      <main className="guest-chat-main">
        <header className="guest-chat-header">
          <div className="guest-mobile-brand"><span><PulseIcon /></span><strong>Nabz</strong></div>
          <div className="guest-guide-status"><span className="guest-ai-avatar"><PulseIcon /></span><div><strong>Nabz health guide</strong><small><i /> Ready · Guest assessment</small></div></div>
          <div className="guest-header-actions">
            {started && <button onClick={reset}>Clear chat</button>}
            <button onClick={() => navigate('/auth?mode=login')}>Log in</button>
            <button className="primary" onClick={() => navigate('/auth?mode=register')}>
              <span className="guest-vault-wide">Create private Vault</span><span className="guest-vault-short">Create Vault</span>
            </button>
          </div>
        </header>

        <div className={`guest-chat-scroll ${started ? 'has-conversation' : ''}`}>
          {!started && (
            <section className="guest-welcome">
              <div className="guest-welcome-mark"><PulseIcon /></div>
              <span className="guest-welcome-kicker">START WITHOUT AN ACCOUNT</span>
              <h1>What’s worrying you today?</h1>
              <p className="urdu" dir="rtl">اپنی تکلیف بتائیں، نبض ایک ڈاکٹر کی طرح اہم سوالات پوچھے گا</p>
              <p className="guest-welcome-lead">Describe what you feel in Urdu, Roman Urdu or English. Nabz will ask only the follow-up questions needed to clarify urgency and the next safe step.</p>
              <div className="guest-starters">
                {STARTERS.map(([urdu, english]) => (
                  <button key={english} onClick={() => start(english, { urdu, english })} disabled={busy}>
                    <span className="urdu" dir="rtl">{urdu}</span><small>{english}</small>
                  </button>
                ))}
              </div>
              <label className="guest-consent">
                <input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setError('') }} />
                <span><strong>Use my words for this temporary AI assessment</strong><small>Not added to a medical Vault. The anonymous session expires in about 2 hours. Do not use Nabz for an emergency.</small></span>
              </label>
            </section>
          )}

          {started && (
            <section className="guest-timeline" aria-live="polite">
              <div className="guest-date-rule"><span>Temporary assessment · Today</span></div>
              {messages.map((message, index) => {
                if (message.role === 'user') {
                  return <div className="guest-user-bubble" key={`user-${index}`}>
                    {message.urdu && <span className="urdu" dir="rtl">{message.urdu}</span>}
                    <span>{message.text}</span>
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
                  onAnswer={answer}
                  onReplay={(text) => tts.speak(text)}
                />
              })}
              {busy && (
                <div className="guest-thinking"><span className="guest-ai-avatar"><PulseIcon /></span><div><i /><i /><i /></div><p>Nabz is reviewing your answer and choosing the next clinically useful question…</p></div>
              )}
              <div ref={endRef} />
            </section>
          )}

          {error && <div className="guest-error" role="alert">{error}</div>}
        </div>

        {!resultTurn && (
          <div className="guest-composer-dock">
            <form className="guest-composer" onSubmit={submitTyped}>
              <span className="guest-compose-icon">＋</span>
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
                placeholder={started ? 'Answer in Urdu, Roman Urdu or English…' : 'Describe your symptoms…'}
              />
              <button disabled={busy || !typed.trim() || (!started && !consent)} aria-label="Send message">{busy ? '…' : '↑'}</button>
            </form>
            <div className="guest-composer-note"><span>AI health guidance—not a diagnosis</span><span>Emergency? Call 1122 now</span><span>Temporary session · no account required</span></div>
          </div>
        )}
      </main>
    </div>
  )
}
