import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackUsage } from '../api'
import { useAuth } from '../context/AuthContext'

const SESSION_KEY = 'nabz_usage_session'

function sessionKey() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const next = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '')
    sessionStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

export default function AnalyticsTracker() {
  const { account } = useAuth()
  const location = useLocation()
  const lastActivity = useRef(Date.now())
  const lastPath = useRef('')
  const key = useRef(sessionKey())

  useEffect(() => {
    if (!account) return undefined
    const markActive = () => { lastActivity.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }))
    return () => events.forEach((event) => window.removeEventListener(event, markActive))
  }, [account])

  useEffect(() => {
    if (!account) return
    const path = location.pathname
    const isNewPage = path !== lastPath.current
    lastPath.current = path
    trackUsage({
      session_key: key.current,
      path,
      active_seconds: 0,
      page_view: isNewPage,
    }).catch(() => {})
  }, [account, location.pathname])

  useEffect(() => {
    if (!account) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastActivity.current > 60_000) return
      trackUsage({
        session_key: key.current,
        path: lastPath.current || location.pathname,
        active_seconds: 30,
        page_view: false,
      }).catch(() => {})
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [account, location.pathname])

  return null
}
