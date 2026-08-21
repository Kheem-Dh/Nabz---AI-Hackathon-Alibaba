import { useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export default function VaultPage() {
  const { active, loading } = useProfiles()
  const navigate = useNavigate()

  return (
    <div className="page">
      <div className="section-title">
        <span className="ur urdu">میڈیکل والٹ</span>
        <span className="en">Your private medical vault</span>
      </div>

      {loading && !active && (
        <div className="center-state">
          <div className="spinner" />
        </div>
      )}

      {active && <div className="stack">
        {[active].map((p) => (
          <button
            key={p.id}
            className="profile-row"
            onClick={() => navigate(`/profile/${p.id}`)}
          >
            <span className="avatar-lg">{initials(p.display_name)}</span>
            <span>
              <span className="p-name">
                <span className="ur urdu">{p.display_name}</span>
                {p.is_self && <span className="badge">آپ · You</span>}
              </span>
              <span className="p-meta">
                {[p.relation, p.age != null ? `${p.age} yrs` : null, p.gender, p.blood_group]
                  .filter(Boolean)
                  .join(' · ') || 'Tap to view record'}
              </span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>}

      <button className="back-link no-print" onClick={() => navigate('/privacy')}>
        🔒 پرائیویسی · Privacy & consent
      </button>
    </div>
  )
}
