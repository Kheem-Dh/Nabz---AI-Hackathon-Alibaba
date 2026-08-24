import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { listProfiles } from '../api'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)
export function ProfileProvider({ children }) {
  const { account } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (preferredId = null) => {
    if (!account) {
      setProfiles([])
      setActiveId(null)
      return []
    }
    setLoading(true)
    try {
      const list = await listProfiles()
      const nextProfiles = Array.isArray(list) ? list : []
      const preferred = Number(preferredId)
      const self = nextProfiles.find((p) => p.is_self) || nextProfiles[0]

      setProfiles(nextProfiles)
      setActiveId((current) => {
        if (preferredId != null && nextProfiles.some((p) => p.id === preferred)) {
          return preferred
        }
        if (nextProfiles.some((p) => p.id === current)) return current
        return self?.id || null
      })
      return nextProfiles
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selectProfile = useCallback((id) => {
    const selected = profiles.find((p) => p.id === Number(id))
    if (selected) setActiveId(selected.id)
  }, [profiles])

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
