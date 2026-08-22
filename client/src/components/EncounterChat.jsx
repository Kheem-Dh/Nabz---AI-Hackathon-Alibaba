import { useEffect, useState } from 'react'
import { getTriageHistory, triageChat } from '../api'

function visibleText(turn) {
  return turn.text_english || turn.text || ''
}

export default function EncounterChat({ sessionId, initialTurns = null }) {
  const [turns, setTurns] = useState(initialTurns || [])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(!initialTurns)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

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

  async function send(event) {
    event?.preventDefault()
    const text = question.trim()
    if (!text || sending) return
    const userTurn = { role: 'user', kind: 'followup_user', text }
    setTurns((current) => [...current, userTurn])
    setQuestion('')
    setSending(true)
    setError('')
    try {
      const response = await triageChat(sessionId, text)
      setTurns((current) => [...current, {
        role: 'assistant',
        kind: 'followup_assistant',
        text: response.answer_urdu,
        text_english: response.answer_english,
        safety_note: response.safety_note,
        vault_context_used: response.vault_context_used,
        response_source: response.response_source,
      }])
    } catch (err) {
      setTurns((current) => current.slice(0, -1))
      setError(err.message || 'Could not send your follow-up question.')
    } finally {
      setSending(false)
    }
  }

  const followups = turns.filter((turn) => turn.kind?.startsWith('followup_'))

  return (
    <section className="encounter-chat no-print">
      <header className="encounter-chat-head">
        <div className="chat-orb">✦</div>
        <div>
          <h3>Ask about this conversation</h3>
          <p>Answers use this transcript and the patient’s current Vault summary.</p>
        </div>
        <span className="context-pill">Transcript + Vault</span>
      </header>

      <details className="encounter-transcript" open={followups.length === 0}>
        <summary>{loading ? 'Loading transcript…' : `View transcript · ${turns.length} messages`}</summary>
        <div className="transcript-scroll">
          {turns.map((turn, index) => (
            <article className={`transcript-turn ${turn.role}`} key={`${turn.role}-${index}`}>
              <strong>{turn.role === 'assistant' ? 'Nabz' : 'You'}</strong>
              <p dir="auto" className={turn.role === 'assistant' && !turn.text_english ? 'urdu' : ''}>
                {visibleText(turn)}
              </p>
            </article>
          ))}
        </div>
      </details>

      {followups.length > 0 && (
        <div className="followup-thread" aria-live="polite">
          {followups.map((turn, index) => (
            <article className={`followup-bubble ${turn.role}`} key={`${turn.kind}-${index}`}>
              <span>{turn.role === 'assistant' ? 'Nabz' : 'You'}</span>
              {turn.role === 'assistant' && turn.text && (
                <p className="urdu" dir="rtl">{turn.text}</p>
              )}
              <p dir="auto">{visibleText(turn)}</p>
              {turn.vault_context_used?.length > 0 && (
                <small>Vault used: {turn.vault_context_used.join(' · ')}</small>
              )}
              {turn.safety_note && <small>{turn.safety_note}</small>}
            </article>
          ))}
          {sending && <div className="chat-thinking"><i /><i /><i /></div>}
        </div>
      )}

      <form className="claude-composer followup-composer" onSubmit={send}>
        <textarea
          dir="auto"
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Ask a follow-up about the transcript, plan, or Vault context…"
          maxLength={2000}
        />
        <footer>
          <span>Follow-up explanation · not a new diagnosis</span>
          <button type="submit" disabled={!question.trim() || sending} aria-label="Send follow-up">↑</button>
        </footer>
      </form>
      {error && <div className="form-error">{error}</div>}
    </section>
  )
}
