import { useEffect, useState } from 'react'
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
import TrustBar from './components/TrustBar'
import DocumentsPage from './pages/DocumentsPage'
import OnboardingPage, { hasOnboarded } from './pages/OnboardingPage'
import LandingPage from './pages/LandingPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import HandoffPage from './pages/HandoffPage'
import GuestChatPage from './pages/GuestChatPage'
import { stopAllSpeech } from './hooks/useTextToSpeech'
import { getConsentStatus } from './api'
import { useProfiles } from './context/ProfileContext'

function Loading() {
  return (
    <div className="boot-screen">
      <div className="boot-brand">
        <span className="brand-ur">نبض</span>
        <span>NABZ</span>
      </div>
      <div className="boot-pulse" aria-hidden="true"><i /><i /><i /></div>
      <p className="urdu">آپ کی محفوظ ہیلتھ اسپیس تیار ہو رہی ہے</p>
      <span>Preparing your health workspace…</span>
    </div>
  )
}

export default function App() {
  const { account, loading } = useAuth()
  const { preference, loading: locLoading } = useLocationPref()
  const location = useLocation()
  const [consentStatus, setConsentStatus] = useState(null)
  const [consentLoading, setConsentLoading] = useState(false)

  // Audio belongs to the current screen. Navigating anywhere immediately
  // stops it, while the header control can stop it without navigation.
  useEffect(() => {
    stopAllSpeech()
  }, [location.pathname])

  useEffect(() => {
    if (!account) {
      setConsentStatus(null)
      setConsentLoading(false)
      return
    }
    let alive = true
    setConsentLoading(true)
    getConsentStatus()
      .then((next) => alive && setConsentStatus(next))
      .catch(() => alive && setConsentStatus(null))
      .finally(() => alive && setConsentLoading(false))
    return () => { alive = false }
  }, [account?.id])

  // Public doctor-handoff page — bypasses every gate (auth, consent, onboarding,
  // location). The URL token itself is the grant.
  if (location.pathname.startsWith('/handoff/')) {
    return <HandoffPage />
  }

  if (loading) return <Loading />

  // Public try-now flow: guests can complete one temporary assessment before
  // deciding whether they want an account and persistent family Vault.
  if (location.pathname === '/chat' && !account) return <GuestChatPage />

  // Keep the public product home available after sign-in. The Nabz brand in
  // the application header always returns here without ending the session.
  if (location.pathname === '/welcome') return <LandingPage />

  if (!account) {
    if (location.pathname.startsWith('/forgot-password')) return <ForgotPasswordPage />
    if (location.pathname.startsWith('/auth')) return <AuthPage />
    if (location.pathname.startsWith('/privacy')) {
      return <div className="public-legal"><PrivacyPage /></div>
    }
    // Land unauth visitors directly on the chat surface — no marketing shell.
    // /welcome is preserved for anyone who wants the classic landing page.
    return <GuestChatPage />
  }

  // First-run gate (winning plan §3): location before anything else.
  // The location screen itself is always accessible so users can update it.
  const isPrintRoute = location.pathname.startsWith('/summary')
  const isVerifyRoute = location.pathname.startsWith('/verify')
  const isAdminRoute = location.pathname.startsWith('/admin')
  const onLocationScreen = location.pathname.startsWith('/location')
  const onOnboarding = location.pathname.startsWith('/onboarding')
  const onPrivacyScreen = location.pathname.startsWith('/privacy')

  if (consentLoading && !isAdminRoute) return <Loading />

  // Existing accounts created before versioned consent are prompted once.
  // Admin access remains independent and every clinical API also enforces
  // these choices server-side.
  if (!isAdminRoute && !onPrivacyScreen && !consentStatus?.complete) {
    return (
      <div className="app-shell">
        <div className="app-container">
          <TopBar minimal />
          <main className="app-main">
            <PrivacyPage required initialStatus={consentStatus} onConsentChange={setConsentStatus} />
          </main>
          <Disclaimer />
        </div>
      </div>
    )
  }

  if (locLoading && !isAdminRoute && !onPrivacyScreen) return <Loading />

  // Location permission is the first signed-in step. Manual province/city is
  // offered only from that screen if GPS is unavailable or declined.
  if (!preference && !onLocationScreen && !isAdminRoute && !onPrivacyScreen) {
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

  // Onboarding gate — one guided walk-through per account, dismissible via Skip.
  const needsOnboarding = account && !hasOnboarded(account.id)
  if (needsOnboarding && !onOnboarding && !onLocationScreen && !isAdminRoute && !onPrivacyScreen) {
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

  return (
    <div className={`app-shell ${location.pathname === '/' ? 'workspace-shell' : ''} ${isVerifyRoute ? 'verify-shell' : ''}`}>
      <div className="app-container">
        {!isPrintRoute && !isVerifyRoute && <TopBar />}
        {!isPrintRoute && !isVerifyRoute && !onLocationScreen && !isAdminRoute && <TrustBar />}
        {!isPrintRoute && !isVerifyRoute && !onLocationScreen && !isAdminRoute && <VerifyBanner />}
        <main className={`app-main ${isAdminRoute ? 'admin-main' : ''} ${isVerifyRoute ? 'verify-main' : ''}`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<Navigate to="/" replace />} />
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
            <Route path="/handoff/:token" element={<HandoffPage />} />
            <Route path="/privacy" element={<PrivacyPage initialStatus={consentStatus} onConsentChange={setConsentStatus} />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {!isPrintRoute && !isVerifyRoute && !isAdminRoute && (
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
  const { account, logout } = useAuth()
  const { active } = useProfiles()
  const navigate = useNavigate()
  const location = useLocation()
  const navClass = (path) => location.pathname === path ? 'active' : ''
  const [scrolled, setScrolled] = useState(false)
  const profileComplete = Boolean(
    active?.date_of_birth && active?.gender && active?.blood_group && active?.weight_kg,
  )

  // Header stays pinned on scroll; a shadow + blur appear once the page has
  // scrolled a few pixels so the initial paint is clean.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`topbar ${scrolled ? 'topbar-scrolled' : ''}`} data-scrolled={scrolled ? 'true' : 'false'}>
      <div className="topbar-row">
        <button className="brand brand-home" onClick={() => navigate('/welcome')} aria-label="Go to Nabz home">
          <span className="brand-app-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M2.5 12h4l2.1-6 4.2 12 2.2-6h6.5" /></svg>
          </span>
          <div>
            <div className="brand-title"><span className="brand-ur">نبض</span><span className="brand-en">NABZ</span></div>
            <div className="brand-pulse urdu">آپ کی آواز، آپ کی صحت</div>
          </div>
        </button>
        {!minimal && (
          <nav className="desktop-nav" aria-label="Primary navigation">
            <button className={navClass('/')} onClick={() => navigate('/')}><span className="urdu" dir="rtl">گفتگو</span><small>Chat</small></button>
            <button className={navClass('/vault')} onClick={() => navigate('/vault')}><span className="urdu" dir="rtl">والٹ</span><small>Vault</small></button>
            <button className={navClass('/clinics')} onClick={() => navigate('/clinics')}><span className="urdu" dir="rtl">قریبی مراکز</span><small>Care</small></button>
            {account?.is_admin && <button className={navClass('/admin')} onClick={() => navigate('/admin')}>Admin</button>}
          </nav>
        )}
        <details className="account-menu">
          <summary aria-label="Open profile and settings">
            <span className="profile-header-avatar">{(active?.display_name || account?.full_name || 'U').charAt(0).toUpperCase()}</span>
            <span className="account-menu-label">
              <strong>{active?.display_name || account?.full_name || 'Account'}</strong>
              <small>Profile & settings</small>
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
          </summary>
          <div className="account-menu-popover">
            <div className="account-menu-identity">
              <strong>{active?.display_name || account?.full_name || 'Nabz account'}</strong>
              <small>{account?.email || account?.phone || 'Private health account'}</small>
            </div>
            {active && (
              <button onClick={() => navigate(profileComplete ? `/profile/${active.id}` : `/profile/${active.id}/edit`)}>
                <span>Profile</span><small>{profileComplete ? 'View health details' : 'Complete health details'}</small>
              </button>
            )}
            {!minimal && <div className="account-menu-location"><LocationChip /></div>}
            <button onClick={() => { stopAllSpeech() }}>
              <span>Mute Nabz</span><small>Stop all voice playback</small>
            </button>
            <button onClick={() => navigate('/privacy')}>
              <span>Privacy & consent</span><small>Manage health-data permissions</small>
            </button>
            <button className="account-menu-signout" onClick={() => { stopAllSpeech(); logout() }}>
              <span>Sign out</span><small>End this session securely</small>
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}
