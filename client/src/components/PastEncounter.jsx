import TriageResult from './TriageResult'

export default function PastEncounter({ encounter, loading, onNew, onRetry }) {
  if (loading) {
    return <div className="center-state"><div className="spinner" /><p>Opening conversation…</p></div>
  }
  if (!encounter) return null

  return (
    <div className="past-encounter">
      <div className="past-encounter-head">
        <div>
          <span className="home-kicker">PAST HEALTH CONVERSATION</span>
          <h2>{encounter.title}</h2>
          <p>{new Date(encounter.created_at).toLocaleString()}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>＋ New assessment</button>
      </div>

      {encounter.result ? (
        <TriageResult
          turn={encounter.result}
          onNew={onNew}
          onRetry={encounter.result.response_source === 'ai_unavailable' ? onRetry : undefined}
          ttsSupported={false}
        />
      ) : (
        <div className="notice notice-info">
          This conversation was not completed. Start a new assessment to continue safely.
        </div>
      )}

      {encounter.turns?.length > 0 && (
        <details className="encounter-transcript">
          <summary>View full conversation transcript</summary>
          <div>
            {encounter.turns.map((turn, index) => (
              <article className={`transcript-turn ${turn.role}`} key={`${turn.role}-${index}`}>
                <strong>{turn.role === 'assistant' ? 'Nabz' : 'You'}</strong>
                <p dir="auto" className={turn.role === 'assistant' ? 'urdu' : ''}>
                  {turn.text_english || turn.text}
                </p>
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
