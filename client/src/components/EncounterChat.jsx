import { useEffect, useRef, useState } from 'react'
import { attachChatImage, getTriageHistory, triageChat } from '../api'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useTextToSpeech } from '../hooks/useTextToSpeech'

function visibleText(turn) {
  return turn.text_english || turn.text || ''
}

export default function EncounterChat({ sessionId, profileId, initialTurns = null }) {
  const [turns, setTurns] = useState(initialTurns || [])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(!initialTurns)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [attaching, setAttaching] = useState(false)
  const fileRef = useRef(null)
  const speech = useSpeechRecognition({ lang: 'ur-PK', silenceMs: 4500 })
  const tts = useTextToSpeech()
  const wasListening = useRef(false)

  useEffect(() => {
    let active = true
    if (initialTurns) {
      setTurns(initialTurns)
      setLoading(false)
      setError('')
      return undefined
    }
    if (!sessionId) return undefined
    setLoading(true)
    getTriageHistory(sessionId)
      .then((encounter) => active && setTurns(encounter.turns || []))
      .catch((err) => active && setError(err.message || 'Could not load transcript.'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [sessionId, initialTurns])

  useEffect(() => {
    if (speech.listening) {
      wasListening.current = true
      setQuestion(speech.transcript)
      return
    }
    if (wasListening.current) {
      wasListening.current = false
      if (speech.transcript.trim()) setQuestion(speech.transcript.trim())
    }
  }, [speech.listening, speech.transcript])

  async function send(event) {
    event?.preventDefault()
    const typedText = question.trim()
    if ((!typedText && !attachment) || sending) return
    const attachmentText = attachment
      ? `[Attachment: ${attachment.name}] ${attachment.description}`
      : ''
    const payload = [attachmentText, typedText].filter(Boolean).join('\n\n')
    const displayText = [attachment ? `📎 ${attachment.name}` : '', typedText].filter(Boolean).join('\n')
    setTurns((current) => [...current, { role: 'user', kind: 'followup_user', text: displayText }])
    setQuestion('')
    setAttachment(null)
    setSending(true)
    setError('')
    tts.cancel()
    try {
      const response = await triageChat(sessionId, payload)
      const assistantTurn = {
        role: 'assistant', kind: 'followup_assistant', text: response.answer_urdu,
        text_english: response.answer_english, safety_note: response.safety_note,
        vault_context_used: response.vault_context_used, response_source: response.response_source,
      }
      setTurns((current) => [...current, assistantTurn])
      tts.speak(response.answer_urdu || response.answer_english, { lang: response.answer_urdu ? 'ur' : 'en' })
    } catch (err) {
      setTurns((current) => current.slice(0, -1))
      setError(err.message || 'Could not send your follow-up question.')
    } finally {
      setSending(false)
    }
  }

  async function chooseAttachment(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !profileId) {
      if (!profileId) setError('Open this conversation from its patient profile to attach a file.')
      return
    }
    setAttaching(true)
    setError('')
    try {
      const result = await attachChatImage(profileId, file)
      setAttachment({ name: file.name, description: result.description || '' })
    } catch (err) {
      setError(err.message || 'Could not read that attachment.')
    } finally {
      setAttaching(false)
    }
  }

  function toggleVoice() {
    if (speech.listening) speech.stop()
    else {
      tts.cancel()
      speech.start()
    }
  }

  const followups = turns.filter((turn) => turn.kind?.startsWith('followup_'))

  return (
    <section className="encounter-chat no-print">
      <header className="encounter-chat-head">
        <div className="chat-orb" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>
        </div>
        <div>
          <span className="chat-kicker">CONTINUE THE CONVERSATION</span>
          <h3>Ask Nabz about this care plan</h3>
          <p>Speak, type or attach a report. Answers use this transcript and the current Vault.</p>
        </div>
        <span className="context-pill">Transcript + Vault</span>
      </header>

      <details className="encounter-transcript" open={followups.length === 0}>
        <summary>{loading ? 'Loading transcript…' : `Clinical transcript · ${turns.length} messages`}</summary>
        <div className="transcript-scroll">
          {turns.map((turn, index) => (
            <article className={`transcript-turn ${turn.role}`} key={`${turn.role}-${index}`}>
              <strong>{turn.role === 'assistant' ? 'Nabz' : 'You'}</strong>
              <p dir="auto" className={turn.role === 'assistant' && !turn.text_english ? 'urdu' : ''}>{visibleText(turn)}</p>
            </article>
          ))}
        </div>
      </details>

      {followups.length > 0 && (
        <div className="followup-thread" aria-live="polite">
          {followups.map((turn, index) => (
            <article className={`followup-bubble ${turn.role}`} key={`${turn.kind}-${index}`}>
              <span>{turn.role === 'assistant' ? 'NABZ' : 'YOU'}</span>
              {turn.role === 'assistant' && turn.text && <p className="urdu" dir="rtl">{turn.text}</p>}
              <p dir="auto">{visibleText(turn)}</p>
              {turn.role === 'assistant' && (
                <button className="followup-replay" onClick={() => tts.speak(turn.text || turn.text_english, { lang: turn.text ? 'ur' : 'en' })}>◉ Listen</button>
              )}
              {turn.vault_context_used?.length > 0 && <small>Vault used: {turn.vault_context_used.join(' · ')}</small>}
              {turn.safety_note && <small>{turn.safety_note}</small>}
            </article>
          ))}
          {sending && <div className="chat-thinking"><i /><i /><i /><span>Nabz is reviewing context…</span></div>}
        </div>
      )}

      <form className={`care-composer ${speech.listening ? 'is-listening' : ''}`} onSubmit={send}>
        {attachment && (
          <div className="composer-attachment">
            <span>📎</span><strong>{attachment.name}</strong><small>Ready</small>
            <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment">×</button>
          </div>
        )}
        {speech.listening && <div className="composer-listening"><i /><span>Listening… speak naturally, then press Stop</span></div>}
        <textarea
          dir="auto" rows={3} value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Ask about symptoms, the care plan, medicines, or an attached report…"
          maxLength={2000}
        />
        <footer>
          <div className="composer-tools">
            {speech.supported && (
              <button type="button" className={`care-tool ${speech.listening ? 'active' : ''}`} onClick={toggleVoice}>
                {speech.listening ? '■ Stop' : '◉ Voice'}
              </button>
            )}
            <button type="button" className="care-tool" onClick={() => fileRef.current?.click()} disabled={attaching}>
              {attaching ? 'Reading…' : '＋ Attach'}
            </button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.bmp,.tif,.tiff,application/pdf,image/*" onChange={chooseAttachment} />
          </div>
          <span>Follow-up guidance—not a new diagnosis</span>
          <button className="care-send" type="submit" disabled={(!question.trim() && !attachment) || sending} aria-label="Send follow-up">
            <svg viewBox="0 0 24 24"><path d="M5 12h14M14 7l5 5-5 5" /></svg>
          </button>
        </footer>
      </form>
      {speech.error === 'not-allowed' && <div className="notice notice-warn">Microphone permission was denied. You can continue by typing.</div>}
      {error && <div className="form-error">{error}</div>}
    </section>
  )
}
