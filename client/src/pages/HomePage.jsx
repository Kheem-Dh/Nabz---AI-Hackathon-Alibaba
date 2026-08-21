import { useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'
import ActiveProfileBar from '../components/ActiveProfileBar'
import ProfileSwitcher from '../components/ProfileSwitcher'
import TriageConversation from '../components/TriageConversation'
import PatientDashboard from '../components/PatientDashboard'
import DemoLoader from '../components/DemoLoader'

export default function HomePage() {
  const { active, loading } = useProfiles()
  const navigate = useNavigate()

  if (loading && !active) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p className="cs-ur urdu">لوڈ ہو رہا ہے…</p>
      </div>
    )
  }

  if (!active) {
    return (
      <div className="center-state">
        <p className="cs-ur urdu">کوئی پروفائل نہیں ملی۔</p>
        <button className="btn btn-primary" onClick={() => navigate('/profile/new')}>
          نیا فرد شامل کریں · Add a person
        </button>
      </div>
    )
  }

  return (
    <div className="page home-page">
      <div className="home-heading">
        <div>
          <span className="home-kicker">PATIENT WORKSPACE</span>
          <h1>{active.display_name}&apos;s health dashboard</h1>
          <p>One private record for triage, documents, medicines, and doctor handoff.</p>
        </div>
        <ActiveProfileBar />
      </div>

      <div className="home-web-grid">
        <aside className="home-patient-column">
          <div className="home-panel">
            <div className="section-title">
              <span className="ur urdu">کس کے لیے؟</span>
              <span className="en">Switch patient</span>
            </div>
            <ProfileSwitcher />
            <DemoLoader />
          </div>

          <PatientDashboard
            key={`dashboard-${active.id}`}
            profile={active}
            onOpenVault={() => navigate(`/profile/${active.id}/documents`)}
            onOpenSummary={() => navigate(`/summary/${active.id}`)}
          />

          <div className="home-panel quick-panel">
            <div className="section-title" style={{ marginTop: 0 }}>
              <span className="ur urdu">فوری کام</span>
              <span className="en">Quick actions</span>
            </div>
            <div className="tile-grid">
              <button className="tile" onClick={() => navigate(`/profile/${active.id}/lab`)}>
                <span className="tile-icon">🧪</span>
                <span className="tile-ur urdu">لیب رپورٹ</span>
                <span className="tile-en">Explain a lab report</span>
              </button>
              <button className="tile" onClick={() => navigate(`/profile/${active.id}/prescription`)}>
                <span className="tile-icon">📝</span>
                <span className="tile-ur urdu">نسخہ اسکین</span>
                <span className="tile-en">Confirm a prescription</span>
              </button>
              <button className="tile" onClick={() => navigate(`/profile/${active.id}/documents`)}>
                <span className="tile-icon">🗂️</span>
                <span className="tile-ur urdu">میڈیکل والٹ</span>
                <span className="tile-en">Open patient documents</span>
              </button>
              <button className="tile" onClick={() => navigate(`/summary/${active.id}`)}>
                <span className="tile-icon">🩺</span>
                <span className="tile-ur urdu">ڈاکٹر خلاصہ</span>
                <span className="tile-en">Doctor handoff summary</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="home-care-column">
          <div className="care-workspace-title">
            <div><span>ADAPTIVE TRIAGE</span><h2>Describe what is happening now</h2></div>
            <small>Live Qwen · full transcript + private patient Vault</small>
          </div>
          {/* key forces a fresh conversation when the active profile changes */}
          <TriageConversation key={active.id} profile={active} />
        </section>
      </div>
    </div>
  )
}
