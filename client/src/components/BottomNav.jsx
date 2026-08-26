import { useLocation, useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'

const STATIC_ITEMS = [
  { to: '/', icon: 'home', en: 'Home', match: (p) => p === '/' },
  { to: '/vault', icon: 'vault', en: 'Vault', match: (p) => p.startsWith('/vault') },
  { to: '/clinics', icon: 'care', en: 'Care', match: (p) => p.startsWith('/clinics') },
]

function NavIcon({ name }) {
  if (name === 'home') return <svg viewBox="0 0 24 24"><path d="m3 11 9-7 9 7v9h-6v-6H9v6H3v-9Z" /></svg>
  if (name === 'vault') return <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>
  if (name === 'care') return <svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.3" /></svg>
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>
}

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { active } = useProfiles()

  const profileItem = active
    ? {
        to: `/profile/${active.id}`,
        icon: 'profile',
        en: 'Profile',
        match: (p) => p.startsWith('/profile'),
      }
    : {
        to: '/profile/new',
        icon: 'profile',
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
              <NavIcon name={it.icon} />
            </span>
            <span>{it.en}</span>
          </button>
        )
      })}
    </nav>
  )
}
