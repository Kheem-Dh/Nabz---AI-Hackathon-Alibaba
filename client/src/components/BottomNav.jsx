import { useLocation, useNavigate } from 'react-router-dom'

const ITEMS = [
  { to: '/', icon: '🏠', ur: 'ہوم', en: 'Home', match: (p) => p === '/' },
  { to: '/vault', icon: '🗂️', ur: 'والٹ', en: 'Vault', match: (p) => p.startsWith('/vault') || p.startsWith('/profile') },
  { to: '/clinics', icon: '📍', ur: 'کلینک', en: 'Clinics', match: (p) => p.startsWith('/clinics') },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => {
        const active = it.match(pathname)
        return (
          <button
            key={it.to}
            className={`nav-item ${active ? 'active' : ''}`}
            onClick={() => navigate(it.to)}
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
