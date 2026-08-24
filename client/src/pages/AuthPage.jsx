import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  normalizePkPhone,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePkPhone,
} from '../utils/validators'

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register, consumePostSignupNotice } = useAuth()
  const requestedMode = new URLSearchParams(location.search).get('mode')
  const [mode, setMode] = useState(requestedMode === 'register' ? 'register' : 'login')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({}) // field-level messages
  const [error, setError] = useState('')   // top-level API/error banner
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Show the "Log in to continue" toast handed over by the register→profile flow.
  useEffect(() => {
    const n = consumePostSignupNotice()
    if (n) {
      setNotice(n)
      setMode('login')
    }
  }, [consumePostSignupNotice])

  function collectErrors() {
    const next = {}
    if (mode === 'register') {
      const nameErr = validateFullName(fullName)
      if (nameErr) next.fullName = nameErr
      const emailErr = validateEmail(email)
      if (emailErr) next.email = emailErr
      const pwErr = validatePassword(password)
      if (pwErr) next.password = pwErr
    } else if (!password) {
      next.password = 'Enter your password.'
    }
    const phoneErr = validatePkPhone(phone)
    if (phoneErr) next.phone = phoneErr
    return next
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice(null)
    const validation = collectErrors()
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setBusy(true)
    try {
      const normalisedPhone = normalizePkPhone(phone)
      if (mode === 'register') {
        await register(fullName.trim(), normalisedPhone, password, email.trim() || null)
      } else {
        await login(normalisedPhone, password)
      }
    } catch (err) {
      const msg =
        err.status === 401
          ? 'Wrong phone or password.'
          : err.status === 409
          ? 'This phone is already registered — try logging in.'
          : err.message || 'Something went wrong.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const passwordHelp =
    mode === 'register' ? 'Minimum 8 characters, with a letter and a number.' : null

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hero">
          <button className="auth-back" onClick={() => navigate('/')} aria-label="Back to Nabz home">← Back to home</button>
          <div className="brand-ur">نبض</div>
          <div className="tag-ur urdu">آپ کی آواز، آپ کی صحت</div>
          <div className="tag-en">NABZ · Your voice, your health</div>
          <div className="auth-value">
            <h1>Your family health space</h1>
            <p>Talk through symptoms, keep medical records organised and find appropriate care nearby.</p>
            <div><span>✓</span> Urdu, Roman Urdu and English</div>
            <div><span>✓</span> Separate history for every family member</div>
            <div><span>✓</span> Reports, prescriptions and medicines together</div>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); setErrors({}) }}
            >
              لاگ اِن · Login
            </button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); setErrors({}) }}
            >
              نیا اکاؤنٹ · Register
            </button>
          </div>

          {notice && (
            <div className={`notice ${notice.kind === 'ok' ? 'notice-ok' : 'notice-warn'}`}>
              {notice.message}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}

          <form onSubmit={submit} noValidate>
            {mode === 'register' && (
              <div className={`field ${errors.fullName ? 'has-error' : ''}`}>
                <label htmlFor="fname">
                  <span className="ur urdu">پورا نام</span> Full name
                </label>
                <input
                  id="fname"
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => setErrors((es) => ({ ...es, fullName: validateFullName(fullName) }))}
                  placeholder="e.g. Ammi Jan"
                  autoComplete="name"
                  required
                />
                {errors.fullName && <div className="field-error">{errors.fullName}</div>}
              </div>
            )}
            <div className={`field ${errors.phone ? 'has-error' : ''}`}>
              <label htmlFor="phone">
                <span className="ur urdu">فون نمبر</span> Phone number
              </label>
              <input
                id="phone"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setErrors((es) => ({ ...es, phone: validatePkPhone(phone) }))}
                placeholder="03XX-XXXXXXX"
                inputMode="tel"
                autoComplete="tel"
                required
              />
              {errors.phone && <div className="field-error">{errors.phone}</div>}
              {!errors.phone && (
                <div className="field-hint">
                  Pakistan format: 03XX-XXXXXXX or +923XXXXXXXXX.
                </div>
              )}
            </div>
            {mode === 'register' && (
              <div className={`field ${errors.email ? 'has-error' : ''}`}>
                <label htmlFor="email">
                  <span className="ur urdu">ای میل</span> Email{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setErrors((es) => ({ ...es, email: validateEmail(email) }))}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                {errors.email && <div className="field-error">{errors.email}</div>}
              </div>
            )}
            <div className={`field ${errors.password ? 'has-error' : ''}`}>
              <label htmlFor="pw">
                <span className="ur urdu">پاس ورڈ</span> Password
              </label>
              <div className="pw-row">
                <input
                  id="pw"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    setErrors((es) => ({
                      ...es,
                      password: mode === 'register' ? validatePassword(password) : (password ? null : 'Enter your password.'),
                    }))
                  }
                  placeholder="••••••••"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {errors.password && <div className="field-error">{errors.password}</div>}
              {!errors.password && passwordHelp && <div className="field-hint">{passwordHelp}</div>}
            </div>

            <button className="btn btn-primary" disabled={busy}>
              {busy ? '…' : mode === 'register' ? 'اکاؤنٹ بنائیں · Create account' : 'لاگ اِن · Login'}
            </button>
          </form>

          <p className="form-hint">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <span className="link" onClick={() => setMode('register')}>Register</span>
              </>
            ) : (
              <>
                Already have one?{' '}
                <span className="link" onClick={() => setMode('login')}>Login</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
