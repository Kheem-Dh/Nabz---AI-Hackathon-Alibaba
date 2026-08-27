import { useCallback, useEffect, useRef, useState } from 'react'
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
  const conversationRef = useRef(null)

  function resetConversationScroll(behavior = 'auto') {
    // The result replaces the processing panel inside a bounded desktop
    // viewport. Wait for that larger tree to commit, then reset the actual
    // center scroller so the new report is immediately usable.
    window.requestAnimationFrame(() => {
      conversationRef.current?.scrollTo({ top: 0, behavior })
    })
  }

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
      resetConversationScroll()
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
    resetConversationScroll()
  }

  function sessionChanged(turn) {
    loadHistory()
    if (turn.type === 'result') {
      setDashboardKey((value) => value + 1)
      resetConversationScroll()
    }
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
    <div className="page home-page authed-chat-page">
      <FamilySidebar
        historyRefreshKey={sessions.map((session) => `${session.id}:${session.updated_at}`).join('|')}
        onOpenSession={openFamilySession}
      />

      <main className="assessment-workspace authed-chat-workspace">
        {/* When starting fresh, TriageConversation owns the big Urdu
            greeting + mic (same as guest). Only show a header bar when
            viewing a saved conversation, to avoid two stacked headings. */}
        {selectedEncounter && (
          <header className="authed-chat-header">
            <div className="authed-chat-title">
              <h1 className="urdu urdu-hero" dir="rtl">{selectedEncounter.title || 'گفتگو'}</h1>
              <p className="authed-chat-sub">Saved conversation</p>
            </div>
            <button className="authed-clear-btn" onClick={newAssessment} title="New chat" aria-label="Start a new chat">✕</button>
          </header>
        )}

        {!service?.unavailable && service?.ai_configured === false && (
          <div className="notice notice-warn service-warning">
            <strong className="urdu" dir="rtl">اسیسمنٹ فی الحال دستیاب نہیں۔</strong>
            <small> Clinical assessment temporarily unavailable — your Vault is still open.</small>
          </div>
        )}
        {service?.unavailable && (
          <div className="notice notice-warn service-warning">
            <strong className="urdu" dir="rtl">کنیکشن نہیں مل رہا۔</strong>
            <small> For severe symptoms, seek urgent care.</small>
          </div>
        )}
        {workspaceError && <div className="form-error">{workspaceError}</div>}

        <div ref={conversationRef} className={`workspace-conversation ${selectedId ? 'has-encounter' : 'is-new'}`}>
          {selectedId ? (
            <PastEncounter
              encounter={selectedEncounter}
              loading={detailLoading}
              onNew={newAssessment}
              onRetry={retrySavedAssessment}
              profileId={active.id}
            />
          ) : (
            <TriageConversation
              key={`${active.id}-${conversationKey}`}
              profile={active}
              onSessionChanged={sessionChanged}
              initialTurn={resumeTurn}
            />
          )}
        </div>
      </main>

      <aside className="authed-insights">
        <div className="authed-insights-head">
          <span className="urdu urdu-side-title" dir="rtl">صحت کا ریکارڈ</span>
          <button onClick={() => navigate(`/profile/${active.id}/documents`)} className="authed-side-view"><span className="urdu" dir="rtl">سب دیکھیں</span></button>
        </div>
        <PatientDashboard
          key={`dashboard-${active.id}-${dashboardKey}`}
          profile={active}
          onOpenVault={() => navigate(`/profile/${active.id}/documents`)}
          onOpenSummary={() => navigate(`/summary/${active.id}`)}
        />
        <div className="authed-side-quick">
          <button onClick={() => navigate(`/profile/${active.id}/lab`)}>
            <span aria-hidden="true">🧪</span>
            <span><b className="urdu" dir="rtl">لیب رپورٹ</b><small>Explain lab</small></span>
          </button>
          <button onClick={() => navigate(`/profile/${active.id}/prescription`)}>
            <span aria-hidden="true">📝</span>
            <span><b className="urdu" dir="rtl">نسخہ</b><small>Add prescription</small></span>
          </button>
        </div>
      </aside>
    </div>
  )
}
