import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getHealthDetail,
  getTriageHistory,
  listTriageHistory,
  retryTriageAssessment,
} from '../api'
import { useProfiles } from '../context/ProfileContext'
import TriageConversation from '../components/TriageConversation'
import PatientDashboard from '../components/PatientDashboard'
import EncounterSidebar from '../components/EncounterSidebar'
import PastEncounter from '../components/PastEncounter'
import FamilySidebar from '../components/FamilySidebar'

export default function HomePage() {
  const { active, loading, selectProfile } = useProfiles()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedEncounter, setSelectedEncounter] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [conversationKey, setConversationKey] = useState(0)
  const [dashboardKey, setDashboardKey] = useState(0)
  const [service, setService] = useState(null)
  const [resumeTurn, setResumeTurn] = useState(null)
  const [workspaceError, setWorkspaceError] = useState('')

  const loadHistory = useCallback(async () => {
    if (!active) return
    setHistoryLoading(true)
    try {
      setSessions(await listTriageHistory(active.id))
    } catch {
      setSessions([])
    } finally {
      setHistoryLoading(false)
    }
  }, [active])

  useEffect(() => {
    loadHistory()
    getHealthDetail().then(setService).catch(() => setService({ unavailable: true }))
  }, [loadHistory])

  useEffect(() => {
    // A family profile is a separate patient workspace. Never leave another
    // member's saved encounter or in-progress chat visible after switching.
    setSelectedId(null)
    setSelectedEncounter(null)
    setResumeTurn(null)
    setWorkspaceError('')
    setConversationKey((value) => value + 1)
  }, [active?.id])

  async function selectEncounter(id) {
    setResumeTurn(null)
    setWorkspaceError('')
    setSelectedId(id)
    setDetailLoading(true)
    try {
      setSelectedEncounter(await getTriageHistory(id))
    } catch {
      setSelectedEncounter(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function newAssessment() {
    setSelectedId(null)
    setSelectedEncounter(null)
    setResumeTurn(null)
    setWorkspaceError('')
    setConversationKey((value) => value + 1)
  }

  function sessionChanged(turn) {
    loadHistory()
    if (turn.type === 'result') setDashboardKey((value) => value + 1)
  }

  async function retrySavedAssessment() {
    if (!selectedId) return
    setDetailLoading(true)
    setWorkspaceError('')
    try {
      const turn = await retryTriageAssessment(selectedId)
      await loadHistory()
      if (turn.type === 'question') {
        setResumeTurn(turn)
        setSelectedId(null)
        setSelectedEncounter(null)
        setConversationKey((value) => value + 1)
      } else {
        setSelectedEncounter((current) => ({
          ...current,
          result: turn,
          status: turn.response_source === 'ai_unavailable' ? 'open' : 'closed',
          result_level: turn.level,
        }))
        if (turn.response_source !== 'ai_unavailable') {
          setDashboardKey((value) => value + 1)
        }
      }
    } catch (error) {
      setWorkspaceError(error.message || 'Could not retry the live AI assessment.')
    } finally {
      setDetailLoading(false)
    }
  }

  if (loading && !active) {
    return <div className="center-state"><div className="spinner" /><p>Opening your workspace…</p></div>
  }

  if (!active) {
    return (
      <div className="center-state">
        <p>We could not find the personal profile linked to this account.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
      </div>
    )
  }

  async function openFamilySession(profileId, session) {
    if (profileId !== active.id) selectProfile(profileId)
    if (session?.id) await selectEncounter(session.id)
  }

  return (
    <div className="page home-page desktop-health-workspace">
      <FamilySidebar
        historyRefreshKey={sessions.map((session) => `${session.id}:${session.updated_at}`).join('|')}
        onOpenSession={openFamilySession}
      />
      <EncounterSidebar
        patient={active}
        sessions={sessions}
        selectedId={selectedId}
        loading={historyLoading}
        service={service}
        onSelect={selectEncounter}
        onNew={newAssessment}
      />

      <main className="assessment-workspace">
        <header className="workspace-header">
          <div>
            <span className="home-kicker">NABZ AI HEALTH ASSISTANT</span>
            <h1>{selectedEncounter ? selectedEncounter.title : 'What’s happening today?'}</h1>
            <p>
              {selectedEncounter
                ? 'A saved conversation from your private health record.'
                : `Talk naturally. Nabz considers your full transcript and ${active.display_name}’s Vault.`}
            </p>
          </div>
          <div className="workspace-actions">
            <button onClick={() => navigate(`/profile/${active.id}/documents`)}>Upload record</button>
            <button onClick={() => navigate(`/summary/${active.id}`)}>Doctor handoff</button>
          </div>
        </header>

        {!service?.unavailable && service?.ai_configured === false && (
          <div className="notice notice-warn service-warning">
            <strong>Clinical assessment is temporarily unavailable.</strong>
            Your Vault remains available. Please try again shortly or contact a clinician if you need help now.
          </div>
        )}
        {service?.unavailable && (
          <div className="notice notice-warn service-warning">
            <strong>Nabz cannot connect right now.</strong>
            Check your connection and try again. For severe or rapidly worsening symptoms, seek urgent care.
          </div>
        )}
        {workspaceError && <div className="form-error">{workspaceError}</div>}

        {selectedId ? (
          <PastEncounter
            encounter={selectedEncounter}
            loading={detailLoading}
            onNew={newAssessment}
            onRetry={retrySavedAssessment}
          />
        ) : (
          <TriageConversation
            key={`${active.id}-${conversationKey}`}
            profile={active}
            onSessionChanged={sessionChanged}
            initialTurn={resumeTurn}
          />
        )}
      </main>

      <aside className="health-insights-column">
        <div className="insights-title">
          <div><span>YOUR HEALTH RECORD</span><h2>Vault overview</h2></div>
          <button onClick={() => navigate(`/profile/${active.id}/documents`)}>View all</button>
        </div>
        <PatientDashboard
          key={`dashboard-${active.id}-${dashboardKey}`}
          profile={active}
          onOpenVault={() => navigate(`/profile/${active.id}/documents`)}
          onOpenSummary={() => navigate(`/summary/${active.id}`)}
        />
        <div className="web-quick-actions">
          <button onClick={() => navigate(`/profile/${active.id}/lab`)}>
            <span className="quick-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 3h6m-1 0v5l4.5 8.1A3.3 3.3 0 0 1 15.6 21H8.4a3.3 3.3 0 0 1-2.9-4.9L10 8V3m-2 11h8" /></svg></span>
            <span><strong>Explain lab</strong><small>Understand flagged values</small></span>
          </button>
          <button onClick={() => navigate(`/profile/${active.id}/prescription`)}>
            <span className="quick-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6V3Zm8 0v4h4M9 12h6m-6 4h6" /></svg></span>
            <span><strong>Add prescription</strong><small>Enrich Vault context</small></span>
          </button>
        </div>
      </aside>
    </div>
  )
}
