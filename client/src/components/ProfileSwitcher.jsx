import { useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

// Horizontal pill row to pick the ACTIVE profile — personalization flows from
// whoever is selected here.
export default function ProfileSwitcher() {
  const { profiles, activeId, selectProfile } = useProfiles()
  const navigate = useNavigate()

  return (
    <div className="pill-row" role="tablist" aria-label="Select patient">
      {profiles.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={p.id === activeId}
          className={`profile-pill ${p.id === activeId ? 'active' : ''}`}
          onClick={() => selectProfile(p.id)}
        >
          <span className="avatar">{initials(p.display_name)}</span>
          <span>{p.display_name}</span>
        </button>
      ))}
      <button className="profile-pill add" onClick={() => navigate('/profile/new')}>
        <span className="avatar">＋</span>
        <span>Add</span>
      </button>
    </div>
  )
}
