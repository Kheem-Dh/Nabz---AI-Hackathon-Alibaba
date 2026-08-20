import { useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'
import ActiveProfileBar from '../components/ActiveProfileBar'
import ProfileSwitcher from '../components/ProfileSwitcher'
import TriageConversation from '../components/TriageConversation'

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
    <div className="page">
      <ActiveProfileBar />

      <div className="section-title">
        <span className="ur urdu">کس کے لیے؟</span>
        <span className="en">Change who this is for</span>
      </div>
      <ProfileSwitcher />

      {/* key forces a fresh conversation when the active profile changes */}
      <TriageConversation key={active.id} profile={active} />

      <div className="section-title" style={{ marginTop: 6 }}>
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
          <span className="tile-en">Scan a prescription</span>
        </button>
        <button className="tile" onClick={() => navigate(`/profile/${active.id}`)}>
          <span className="tile-icon">🗂️</span>
          <span className="tile-ur urdu">میڈیکل والٹ</span>
          <span className="tile-en">Open the vault</span>
        </button>
        <button className="tile" onClick={() => navigate(`/summary/${active.id}`)}>
          <span className="tile-icon">🩺</span>
          <span className="tile-ur urdu">ڈاکٹر خلاصہ</span>
          <span className="tile-en">Doctor handoff summary</span>
        </button>
      </div>
    </div>
  )
}
