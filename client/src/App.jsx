import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useLocationPref } from './context/LocationContext'
import BottomNav from './components/BottomNav'
import Disclaimer from './components/Disclaimer'
import LocationChip from './components/LocationChip'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import LocationSetupPage from './pages/LocationSetupPage'
import VaultPage from './pages/VaultPage'
import ProfilePage from './pages/ProfilePage'
import ProfileEditPage from './pages/ProfileEditPage'
import ClinicsPage from './pages/ClinicsPage'
import LabReportPage from './pages/LabReportPage'
import PrescriptionPage from './pages/PrescriptionPage'
import SummaryPage from './pages/SummaryPage'
import PrivacyPage from './pages/PrivacyPage'
import VerifyPage from './pages/VerifyPage'
import VerifyBanner from './components/VerifyBanner'
import DocumentsPage from './pages/DocumentsPage'
import { stopAllSpeech } from './hooks/useTextToSpeech'

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
  const { preference, loading: locLoading } = useLocationPref()
  const location = useLocation()

  // Audio belongs to the current screen. Navigating anywhere immediately
  // stops it, while the header control can stop it without navigation.
  useEffect(() => {
    stopAllSpeech()
  }, [location.pathname])

  if (loading) return <Loading />
  if (!account) return <AuthPage />
  if (locLoading) return <Loading />

  // First-run gate (winning plan §3): location before anything else.
  // The location screen itself is always accessible so users can update it.
  const isPrintRoute = location.pathname.startsWith('/summary')
  const onLocationScreen = location.pathname.startsWith('/location')

  if (!preference && !onLocationScreen) {
    return (
      <div className="app-shell">
        <div className="app-container">
          <TopBar minimal />
          <main className="app-main">
            <LocationSetupPage redirectTo="/" />
          </main>
          <Disclaimer />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        {!isPrintRoute && <TopBar />}
        {!isPrintRoute && !onLocationScreen && <VerifyBanner />}
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/location" element={<LocationSetupPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/profile/new" element={<ProfileEditPage mode="create" />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/profile/:id/edit" element={<ProfileEditPage mode="edit" />} />
            <Route path="/profile/:id/lab" element={<LabReportPage />} />
            <Route path="/profile/:id/prescription" element={<PrescriptionPage />} />
            <Route path="/profile/:id/documents" element={<DocumentsPage />} />
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

function TopBar({ minimal = false }) {
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
        {!minimal && (
          <nav className="desktop-nav" aria-label="Primary navigation">
            <button onClick={() => navigate('/')}>Home</button>
            <button onClick={() => navigate('/vault')}>Medical Vault</button>
            <button onClick={() => navigate('/clinics')}>Nearby Care</button>
          </nav>
        )}
        <div className="row">
          {!minimal && <LocationChip compact />}
          <button
            className="audio-stop-btn"
            title="Stop all Nabz audio"
            onClick={stopAllSpeech}
            aria-label="Stop all audio"
          >
            <span aria-hidden="true">■</span>
            <span className="audio-stop-label">Stop audio</span>
          </button>
          <button
            className="icon-btn"
            title="Privacy"
            onClick={() => navigate('/privacy')}
            aria-label="Privacy"
          >
            🔒
          </button>
          <button
            className="icon-btn"
            title="Log out"
            onClick={() => { stopAllSpeech(); logout() }}
            aria-label="Log out"
          >
            ⏻
          </button>
        </div>
      </div>
    </header>
  )
}
