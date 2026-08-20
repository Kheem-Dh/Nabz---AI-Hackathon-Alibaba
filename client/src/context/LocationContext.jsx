import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  confirmLocation as apiConfirm,
  getMyLocation,
  resolveLocation as apiResolve,
} from '../api'
import { useAuth } from './AuthContext'

const LocationContext = createContext(null)
const FRESH_MINUTES = 10

function isFresh(pref) {
  if (!pref?.last_confirmed_at) return false
  const stamp = new Date(pref.last_confirmed_at).getTime()
  return Number.isFinite(stamp) && Date.now() - stamp < FRESH_MINUTES * 60_000
}

export function LocationProvider({ children }) {
  const { account } = useAuth()
  const [preference, setPreference] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    async function boot() {
      if (!account) {
        setPreference(null)
        return
      }
      setLoading(true)
      try {
        const pref = await getMyLocation()
        if (alive) setPreference(pref)
      } catch (err) {
        if (err?.status !== 404) {
          // 404 just means no location yet — fine
          console.warn('location load failed', err)
        }
        if (alive) setPreference(null)
      } finally {
        if (alive) setLoading(false)
      }
    }
    boot()
    return () => {
      alive = false
    }
  }, [account])

  const resolve = useCallback((lat, lon, accuracy) => apiResolve(lat, lon, accuracy), [])

  const confirm = useCallback(async (data) => {
    const pref = await apiConfirm(data)
    setPreference(pref)
    return pref
  }, [])

  const clear = useCallback(() => setPreference(null), [])

  return (
    <LocationContext.Provider
      value={{
        preference,
        loading,
        isSet: !!preference,
        fresh: isFresh(preference),
        resolve,
        confirm,
        clear,
      }}
    >
      {children}
    </LocationContext.Provider>
  )
}

export function useLocationPref() {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error('useLocationPref must be used within LocationProvider')
  return ctx
}
