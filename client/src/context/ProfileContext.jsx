import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { listProfiles } from '../api'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)
const ACTIVE_KEY = 'nabz_active_profile'

export function ProfileProvider({ children }) {
  const { account } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [activeId, setActiveId] = useState(
    () => Number(localStorage.getItem(ACTIVE_KEY)) || null,
  )
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!account) {
      setProfiles([])
      return []
    }
    setLoading(true)
    try {
      const list = await listProfiles()
      setProfiles(list)
      // Ensure an active profile is always selected once we have data.
      setActiveId((cur) => {
        if (cur && list.some((p) => p.id === cur)) return cur
        const self = list.find((p) => p.is_self) || list[0]
        return self ? self.id : null
      })
      return list
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, String(activeId))
  }, [activeId])

  const selectProfile = useCallback((id) => setActiveId(id), [])

  const active = profiles.find((p) => p.id === activeId) || null

  return (
    <ProfileContext.Provider
      value={{ profiles, active, activeId, loading, refresh, selectProfile }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfiles() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles must be used within ProfileProvider')
  return ctx
}
