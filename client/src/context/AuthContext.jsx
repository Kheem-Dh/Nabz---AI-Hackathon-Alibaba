import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  getMe,
  getToken,
  loginAccount,
  registerAccount,
  setToken,
} from '../api'

const AuthContext = createContext(null)
const PENDING_KEY = 'nabz_pending_registration'

// Small helpers so the register/complete-profile handshake doesn't need to
// know how the flag is persisted.
function markPendingRegistration(accountId) {
  try {
    localStorage.setItem(PENDING_KEY, String(accountId))
  } catch { /* ignore */ }
}
function clearPendingRegistration() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch { /* ignore */ }
}
function currentPendingId() {
  try {
    return localStorage.getItem(PENDING_KEY) || null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingRegistration, setPendingRegistration] = useState(currentPendingId)
  // Set right after a successful register — used to show "Log in to continue"
  // on the login screen after the profile-details step finishes.
  const [postSignupNotice, setPostSignupNotice] = useState(null)

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
        clearPendingRegistration()
        if (alive) setPendingRegistration(null)
      } finally {
        if (alive) setLoading(false)
      }
    }
    boot()
    return () => { alive = false }
  }, [])

  const login = useCallback(async (identifier, password) => {
    const res = await loginAccount(identifier, password)
    setToken(res.token)
    setAccount(res.account)
    clearPendingRegistration()
    setPendingRegistration(null)
    setPostSignupNotice(null)
    return res.account
  }, [])

  const register = useCallback(async (fullName, phone, password, email) => {
    const res = await registerAccount(fullName, phone, password, email)
    setToken(res.token)
    setAccount(res.account)
    // Force the user through the profile-details form before they can use the app.
    markPendingRegistration(res.account.id)
    setPendingRegistration(String(res.account.id))
    return res.account
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setAccount(null)
    clearPendingRegistration()
    setPendingRegistration(null)
  }, [])

  // The registration flow calls this when the detailed profile form is saved:
  // it clears the token + pending flag AND leaves a "Log in to continue" hint
  // that the login screen renders once.
  const finishRegistration = useCallback((accountName) => {
    setToken('')
    setAccount(null)
    clearPendingRegistration()
    setPendingRegistration(null)
    setPostSignupNotice({
      kind: 'ok',
      message: accountName
        ? `Account created for ${accountName}. Log in to continue.`
        : 'Account created. Log in to continue.',
    })
  }, [])

  const consumePostSignupNotice = useCallback(() => {
    const n = postSignupNotice
    setPostSignupNotice(null)
    return n
  }, [postSignupNotice])

  // Let verification screens push the freshly-verified account into context.
  const applyAccount = useCallback((next) => setAccount(next), [])

  return (
    <AuthContext.Provider
      value={{
        account,
        loading,
        pendingRegistration: !!pendingRegistration,
        postSignupNotice,
        login,
        register,
        logout,
        finishRegistration,
        applyAccount,
        consumePostSignupNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
