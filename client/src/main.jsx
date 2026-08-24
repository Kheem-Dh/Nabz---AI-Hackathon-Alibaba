import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { LocationProvider } from './context/LocationContext'
import { ProfileProvider } from './context/ProfileContext'
import AnalyticsTracker from './components/AnalyticsTracker'
import './styles.css'

// PWA: register the service worker in production builds so Nabz can be
// installed to a phone's home screen and open instantly on flaky Wi-Fi.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed', err))
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AnalyticsTracker />
        <LocationProvider>
          <ProfileProvider>
            <App />
          </ProfileProvider>
        </LocationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
