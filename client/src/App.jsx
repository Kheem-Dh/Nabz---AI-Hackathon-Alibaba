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
import OnboardingPage, { hasOnboarded } from './pages/OnboardingPage'
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
  const onOnboarding = location.pathname.startsWith('/onboarding')

  // Onboarding gate — one guided walk-through per account, dismissible via Skip.
  const needsOnboarding = account && !hasOnboarded(account.id)
  if (needsOnboarding && !onOnboarding) {
    return (
      <div className="app-shell">
        <div className="app-container">
          <TopBar minimal />
          <main className="app-main">
            <OnboardingPage />
          </main>
          <Disclaimer />
        </div>
      </div>
    )
  }

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
            <Route path="/onboarding" element={<OnboardingPage />} />
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
  const location = useLocation()
  const navClass = (path) => location.pathname === path ? 'active' : ''
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
            <button className={navClass('/')} onClick={() => navigate('/')}>Workspace</button>
            <button className={navClass('/vault')} onClick={() => navigate('/vault')}>Medical Vault</button>
            <button className={navClass('/clinics')} onClick={() => navigate('/clinics')}>Find care</button>
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.8 8.5H3v7h3.8L11 19V5Zm4.2 4.2 5.6 5.6m0-5.6-5.6 5.6" /></svg>
            <span className="audio-stop-label">Mute</span>
          </button>
          <button
            className="top-action-btn"
            title="Privacy"
            onClick={() => navigate('/privacy')}
            aria-label="Privacy"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-4" /></svg>
            <span>Privacy</span>
          </button>
          <button
            className="top-action-btn"
            title="Log out"
            onClick={() => { stopAllSpeech(); logout() }}
            aria-label="Log out"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5m4-4 4-3-4-3m4 3H9" /></svg>
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
