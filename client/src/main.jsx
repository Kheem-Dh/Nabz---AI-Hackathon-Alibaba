import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { BrowserRouter } from 'react-router-dom'
import App, { Loading } from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { LocationProvider } from './context/LocationContext'
import { ProfileProvider } from './context/ProfileContext'
import AnalyticsTracker from './components/AnalyticsTracker'
import { warmBackend } from './api'
import './styles.css'

const nativeApp = Capacitor.isNativePlatform()

// Capacitor already packages the complete web bundle. A service worker on its
// internal https://localhost origin can retain stale hashed assets across APK
// upgrades and leave the WebView blank. Keep offline caching for the web PWA,
// but actively remove old registrations/caches inside native builds.
if (nativeApp && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((item) => item.unregister())))
    .catch(() => {})
  if ('caches' in window) {
    window.caches.keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .catch(() => {})
  }
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed', err))
  })
}

// Start the backend spinning up now, in parallel with fetching the bundle and
// painting the landing page, so its cold start is over before it is needed.
warmBackend()

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('[nabz] application render failed', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app-recovery" role="alert">
        <strong className="urdu" dir="rtl">صفحہ دوبارہ کھولیے</strong>
        <p>Nabz could not display this screen. Your saved Vault data was not changed.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload Nabz</button>
      </main>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AnalyticsTracker />
          <LocationProvider>
            <ProfileProvider>
              <Suspense fallback={<Loading />}>
                <App />
              </Suspense>
            </ProfileProvider>
          </LocationProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
