// useGeolocation — thin wrapper around navigator.geolocation.
//
// Only fires on explicit user action (see LocationSetupPage). Returns the
// fields the winning plan asks for (latitude, longitude, accuracy, timestamp)
// and normalizes browser errors so the UI can render a helpful message.

import { useCallback, useState } from 'react'

export function useGeolocation() {
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation
  const [coords, setCoords] = useState(null)  // { latitude, longitude, accuracy_m, captured_at }
  const [status, setStatus] = useState('idle') // idle | detecting | granted | denied | error
  const [error, setError] = useState(null)

  const detect = useCallback(
    (opts = {}) =>
      new Promise((resolve, reject) => {
        if (!supported) {
          const e = new Error('geolocation-unsupported')
          setStatus('error')
          setError(e.message)
          reject(e)
          return
        }
        setStatus('detecting')
        setError(null)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const payload = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy || null,
              captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
            }
            setCoords(payload)
            setStatus('granted')
            resolve(payload)
          },
          (err) => {
            const reason =
              err && err.code === 1
                ? 'denied'
                : err && err.code === 2
                ? 'unavailable'
                : err && err.code === 3
                ? 'timeout'
                : 'error'
            setStatus(reason === 'denied' ? 'denied' : 'error')
            setError(reason)
            reject(new Error(reason))
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000, ...opts },
        )
      }),
    [supported],
  )

  return { supported, coords, status, error, detect }
}
