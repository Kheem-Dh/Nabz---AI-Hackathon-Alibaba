function dayLabel(value) {
  const date = new Date(value)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const encounterDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const days = Math.floor((start - encounterDay) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 days'
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function timeLabel(value) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

export default function EncounterSidebar({
  patient,
  sessions,
  selectedId,
  loading,
  service,
  onSelect,
  onNew,
}) {
  const grouped = sessions.reduce((groups, session) => {
    const label = dayLabel(session.updated_at)
    if (!groups[label]) groups[label] = []
    groups[label].push(session)
    return groups
  }, {})

  const serviceLive = service?.triage_engine === 'live_ai' && service?.ai_configured

  return (
    <aside className="encounter-sidebar">
      <div className="encounter-user">
        <span className="encounter-avatar">{patient.display_name.slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{patient.display_name}</strong>
          <small>Private patient workspace</small>
        </span>
      </div>

      <button className="new-encounter-btn" onClick={onNew}>
        <span>＋</span> New health conversation
      </button>

      <div className={`ai-service-state ${serviceLive ? 'online' : 'offline'}`}>
        <span className="service-dot" />
        <span>
          <strong>{serviceLive ? 'Live AI ready' : 'Live AI not connected'}</strong>
          <small>
            {serviceLive
              ? `${service.text_model || 'Qwen'} · Vault-aware`
              : 'Start the Nabz backend to assess symptoms'}
          </small>
        </span>
      </div>

      <div className="history-heading">
        <span>Your conversations</span>
        <span>{sessions.length}</span>
      </div>

      <div className="encounter-history" aria-live="polite">
        {loading && <div className="history-empty">Loading conversations…</div>}
        {!loading && sessions.length === 0 && (
          <div className="history-empty">
            Your AI health conversations will appear here with a title and date.
          </div>
        )}
        {Object.entries(grouped).map(([label, items]) => (
          <div className="history-group" key={label}>
            <div className="history-date-label">{label}</div>
            {items.map((session) => (
              <button
                key={session.id}
                className={`history-item ${selectedId === session.id ? 'active' : ''}`}
                onClick={() => onSelect(session.id)}
              >
                <span className="history-item-title">{session.title}</span>
                {session.preview && <span className="history-item-preview">{session.preview}</span>}
                <span className="history-item-meta">
                  {timeLabel(session.updated_at)}
                  {session.result_level && (
                    <em className={`history-level ${session.result_level.toLowerCase()}`}>
                      {session.result_level.replace('_', ' ')}
                    </em>
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}
