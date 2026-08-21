import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { listProfiles } from '../api'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)
export function ProfileProvider({ children }) {
  const { account } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!account) {
      setProfiles([])
      return []
    }
    setLoading(true)
    try {
      const list = await listProfiles()
      // Nabz is a private, single-patient workspace. Family/demo profiles may
      // remain in older databases, but they are never exposed in the signed-in
      // user's workspace or allowed to become the active patient.
      const self = list.find((p) => p.is_self) || list[0]
      const ownProfiles = self ? [self] : []
      setProfiles(ownProfiles)
      setActiveId(self?.id || null)
      return ownProfiles
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selectProfile = useCallback((id) => {
    const self = profiles.find((p) => p.is_self) || profiles[0]
    if (self && Number(id) === self.id) setActiveId(self.id)
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
