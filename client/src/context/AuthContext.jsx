import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  getToken,
  setToken,
  getMe,
  loginAccount,
  registerAccount,
} from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)

  // On boot, if we have a token, verify it and load the account.
  useEffect(() => {
    let alive = true
    async function boot() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const me = await getMe()
        if (alive) setAccount(me)
      } catch {
        setToken('') // stale/invalid token
      } finally {
        if (alive) setLoading(false)
      }
    }
    boot()
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (phone, password) => {
    const res = await loginAccount(phone, password)
    setToken(res.token)
    setAccount(res.account)
    return res.account
  }, [])

  const register = useCallback(async (fullName, phone, password) => {
    const res = await registerAccount(fullName, phone, password)
    setToken(res.token)
    setAccount(res.account)
    return res.account
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setAccount(null)
  }, [])

  return (
    <AuthContext.Provider value={{ account, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
