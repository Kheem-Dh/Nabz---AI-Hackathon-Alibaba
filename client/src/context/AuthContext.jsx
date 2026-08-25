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

function clearPendingRegistration() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch { /* ignore */ }
}
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [postSignupNotice, setPostSignupNotice] = useState(null)

  // On boot, if we have a token, verify it and load the account.
  useEffect(() => {
    let alive = true
    async function boot() {
      // Remove the obsolete complete-profile gate from older deployments.
      clearPendingRegistration()
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
    return () => { alive = false }
  }, [])

  const login = useCallback(async (identifier, password) => {
    const res = await loginAccount(identifier, password)
    setToken(res.token)
    setAccount(res.account)
    clearPendingRegistration()
    setPostSignupNotice(null)
    return res.account
  }, [])

  const register = useCallback(async (fullName, phone, password, email, dateOfBirth) => {
    const res = await registerAccount(fullName, phone, password, email, dateOfBirth)
    // Registration credentials are deliberately not kept as a signed-in
    // session. The person must prove them on the Login screen.
    setToken('')
    setAccount(null)
    clearPendingRegistration()
    setPostSignupNotice({
      kind: 'ok',
      message: `Account created for ${res.account.full_name}. Log in to continue.`,
    })
    return res.account
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setAccount(null)
    clearPendingRegistration()
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
        postSignupNotice,
        login,
        register,
        logout,
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
