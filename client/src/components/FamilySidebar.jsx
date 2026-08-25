import { useEffect, useState } from 'react'
import { listTriageHistory } from '../api'
import { useProfiles } from '../context/ProfileContext'
import AddFamilyMemberWizard from './AddFamilyMemberWizard'

// "CONSULTING FOR" sidebar — one row per family profile. Each row expands to
// show that profile's recent triage sessions with dates, so every family
// member has their own visible chat-history record scoped to them.

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function shortDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
  } catch {
    return ''
  }
}

function ProfileHistoryRow({
  profile,
  expanded,
  isActive,
  historyRefreshKey,
  onSelectProfile,
  onOpenSession,
}) {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!expanded) return
    let alive = true
    setLoading(true)
    setError('')
    listTriageHistory(profile.id)
      .then((rows) => alive && setHistory(Array.isArray(rows) ? rows : []))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [expanded, profile.id, historyRefreshKey])

  return (
    <div className={`fs-profile ${isActive ? 'active' : ''}`}>
      <button className="fs-profile-row" onClick={() => onSelectProfile(profile.id)}>
        <span className="fs-avatar">{initials(profile.display_name)}</span>
        <span className="fs-profile-text">
          <span className="fs-name">{profile.display_name}</span>
          <span className="fs-relation">
            {profile.is_self ? 'Primary account' : (profile.relation || 'Family member')}
          </span>
        </span>
        <span className="fs-chevron" aria-hidden="true">›</span>
      </button>
      {expanded && (
        <ul className="fs-history">
          {loading && (
            <li className="fs-history-empty" aria-live="polite">
              <div className="skeleton-stack" aria-hidden="true">
                <div className="skeleton" style={{ width: '78%' }} />
                <div className="skeleton" style={{ width: '52%' }} />
              </div>
              <span className="sr-only">Loading history…</span>
            </li>
          )}
          {!loading && error && <li className="fs-history-empty">Could not load history.</li>}
          {!loading && !error && history && history.length === 0 && (
            <li className="fs-history-empty">No conversations yet.</li>
          )}
          {!loading && !error && (history || []).map((h) => (
            <li key={h.id}>
              <button
                className="fs-history-row"
                onClick={() => onOpenSession && onOpenSession(profile.id, h)}
                title={h.preview || h.title || ''}
              >
                <span className="fs-history-text urdu" dir="auto">
                  {h.title || h.preview || 'Untitled conversation'}
                </span>
                <span className="fs-history-meta">
                  {shortDate(h.created_at)}
                  {h.result_level && (
                    <span className={`fs-lvl fs-lvl-${(h.result_level || '').toLowerCase()}`}>
                      {h.result_level.replace('_', ' ')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FamilySidebar({ historyRefreshKey, onOpenSession }) {
  const { profiles, active, selectProfile } = useProfiles()
  const [expandedId, setExpandedId] = useState(active?.id || null)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    if (active?.id) setExpandedId(active.id)
  }, [active?.id])

  function toggle(id) {
    setExpandedId((cur) => (cur === id ? null : id))
    selectProfile(id)
  }

  return (
    <aside className="family-sidebar" aria-label="Family members">
      <div className="fs-head">CONSULTING FOR</div>
      <div className="fs-list">
        {profiles.map((p) => (
          <ProfileHistoryRow
            key={p.id}
            profile={p}
            expanded={expandedId === p.id}
            isActive={active?.id === p.id}
            historyRefreshKey={historyRefreshKey}
            onSelectProfile={toggle}
            onOpenSession={onOpenSession}
          />
        ))}
      </div>

      <button className="fs-add-btn" onClick={() => setWizardOpen(true)}>
        <span className="fs-add-plus">＋</span>
        <span>Add family member</span>
      </button>

      {wizardOpen && (
        <AddFamilyMemberWizard
          onClose={() => setWizardOpen(false)}
        />
      )}
    </aside>
  )
}
