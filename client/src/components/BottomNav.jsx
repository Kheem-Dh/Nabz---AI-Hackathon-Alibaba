import { useLocation, useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'

const STATIC_ITEMS = [
  { to: '/', icon: '🏠', ur: 'ہوم', en: 'Home', match: (p) => p === '/' },
  { to: '/vault', icon: '🗂️', ur: 'والٹ', en: 'Vault', match: (p) => p.startsWith('/vault') },
  { to: '/clinics', icon: '📍', ur: 'کلینک', en: 'Clinics', match: (p) => p.startsWith('/clinics') },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { active } = useProfiles()

  const profileItem = active
    ? {
        to: `/profile/${active.id}`,
        icon: '👤',
        ur: 'پروفائل',
        en: 'Profile',
        match: (p) => p.startsWith('/profile'),
      }
    : {
        to: '/profile/new',
        icon: '👤',
        ur: 'پروفائل',
        en: 'Profile',
        match: (p) => p.startsWith('/profile'),
      }

  const items = [...STATIC_ITEMS, profileItem]

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((it) => {
        const isActive = it.match(pathname)
        return (
          <button
            key={it.en}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(it.to)}
            aria-label={it.en}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="nav-ico" aria-hidden="true">
              {it.icon}
            </span>
            <span className="urdu" style={{ lineHeight: 1 }}>
              {it.ur}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
