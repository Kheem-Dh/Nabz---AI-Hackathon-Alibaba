import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'
import Disclaimer from './components/Disclaimer'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import VaultPage from './pages/VaultPage'
import ProfilePage from './pages/ProfilePage'
import ProfileEditPage from './pages/ProfileEditPage'
import ClinicsPage from './pages/ClinicsPage'
import LabReportPage from './pages/LabReportPage'
import PrescriptionPage from './pages/PrescriptionPage'
import SummaryPage from './pages/SummaryPage'
import PrivacyPage from './pages/PrivacyPage'

function Loading() {
  return (
    <div className="center-state" style={{ minHeight: '100vh', justifyContent: 'center' }}>
      <div className="spinner" />
      <p className="cs-ur urdu">لوڈ ہو رہا ہے…</p>
    </div>
  )
}

export default function App() {
  const { account, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!account) return <AuthPage />

  // Chrome (topbar/nav) is hidden on the print-focused summary route.
  const isPrintRoute = location.pathname.startsWith('/summary')

  return (
    <div className="app-shell">
      <div className="app-container">
        {!isPrintRoute && <TopBar />}
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/profile/new" element={<ProfileEditPage mode="create" />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/profile/:id/edit" element={<ProfileEditPage mode="edit" />} />
            <Route path="/profile/:id/lab" element={<LabReportPage />} />
            <Route path="/profile/:id/prescription" element={<PrescriptionPage />} />
            <Route path="/clinics" element={<ClinicsPage />} />
            <Route path="/summary/:id" element={<SummaryPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {!isPrintRoute && (
          <>
            <Disclaimer />
            <BottomNav />
          </>
        )}
      </div>
    </div>
  )
}

function TopBar() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="brand">
          <span className="brand-ur">نبض</span>
          <div>
            <div className="brand-en">NABZ</div>
            <div className="brand-pulse urdu">آپ کی آواز، آپ کی صحت</div>
          </div>
        </div>
        <div className="row">
          <button
            className="icon-btn"
            title="Privacy"
            onClick={() => navigate('/privacy')}
            aria-label="Privacy"
          >
            🔒
          </button>
          <button className="icon-btn" title="Log out" onClick={logout} aria-label="Log out">
            ⏻
          </button>
        </div>
      </div>
    </header>
  )
}
