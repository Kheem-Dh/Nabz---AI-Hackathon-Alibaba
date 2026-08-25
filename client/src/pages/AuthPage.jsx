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

  function validateIdentifier(value, currentMode = mode) {
    const identifier = (value || '').trim()
    if (!identifier) return currentMode === 'register'
      ? 'Enter a Pakistan phone number.'
      : 'Enter your phone number or email.'
    return currentMode === 'login' && identifier.includes('@')
      ? validateEmail(identifier)
      : validatePkPhone(identifier)
  }

  function collectErrors(values = { fullName, phone, email, password }) {
    const next = {}
    if (mode === 'register') {
      const nameErr = validateFullName(values.fullName)
      if (nameErr) next.fullName = nameErr
      const emailErr = validateEmail(values.email)
      if (emailErr) next.email = emailErr
      const pwErr = validatePassword(values.password)
      if (pwErr) next.password = pwErr
    } else if (!values.password) {
      next.password = 'Enter your password.'
    }
    const identifierError = validateIdentifier(values.phone)
    if (identifierError) next.phone = identifierError
    return next
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice(null)
    // Read the submitted DOM values as well as React state. Chrome password
    // managers can visually autofill a field without firing React onChange.
    const submitted = new FormData(e.currentTarget)
    const values = {
      fullName: String(submitted.get('full_name') ?? fullName),
      phone: String(submitted.get('identifier') ?? phone),
      email: String(submitted.get('email') ?? email),
      password: String(submitted.get('password') ?? password),
    }
    setFullName(values.fullName)
    setPhone(values.phone)
    setEmail(values.email)
    setPassword(values.password)
    const validation = collectErrors(values)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setBusy(true)
    try {
      const normalisedIdentifier = values.phone.includes('@')
        ? values.phone.trim().toLowerCase()
        : normalizePkPhone(values.phone)
      if (mode === 'register') {
        await register(values.fullName.trim(), normalisedIdentifier, values.password, values.email.trim() || null)
      } else {
        await login(normalisedIdentifier, values.password)
      }
    } catch (err) {
      if (Array.isArray(err.validation)) {
        const serverErrors = {}
        for (const issue of err.validation) {
          const locations = Array.isArray(issue?.loc) ? issue.loc : []
          const field = locations[locations.length - 1]
          if (field === 'password') serverErrors.password = mode === 'register'
            ? (validatePassword(values.password) || 'Check your password.')
            : 'Enter your password.'
          else if (field === 'identifier' || field === 'phone') serverErrors.phone = validateIdentifier(values.phone)
          else if (field === 'full_name') serverErrors.fullName = validateFullName(values.fullName)
          else if (field === 'email') serverErrors.email = validateEmail(values.email) || 'Enter a valid email address.'
        }
        setErrors((current) => ({ ...current, ...serverErrors }))
      }
      const msg =
        err.status === 401
          ? 'Wrong phone/email or password.'
          : err.status === 422
          ? 'Please check the highlighted fields.'
          : err.status === 409
          ? err.detail === 'email_already_registered'
            ? 'This email is already registered — try logging in.'
            : 'This phone is already registered — try logging in.'
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
          {requestedMode === 'login' && new URLSearchParams(location.search).get('reset') === 'done' && (
            <div className="notice notice-ok">Password updated. Log in with your new password.</div>
          )}

          <form onSubmit={submit} noValidate>
            {mode === 'register' && (
              <div className={`field ${errors.fullName ? 'has-error' : ''}`}>
                <label htmlFor="fname">
                  <span className="ur urdu">پورا نام</span> Full name
                </label>
                <input
                  id="fname"
                  name="full_name"
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
                <span className="ur urdu">{mode === 'register' ? 'فون نمبر' : 'فون یا ای میل'}</span>{' '}
                {mode === 'register' ? 'Phone number' : 'Phone number or email'}
              </label>
              <input
                id="phone"
                name="identifier"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setErrors((es) => ({ ...es, phone: validateIdentifier(phone) }))}
                placeholder={mode === 'register' ? '03XX-XXXXXXX' : '03XX-XXXXXXX or you@example.com'}
                inputMode={mode === 'register' ? 'tel' : 'email'}
                autoComplete={mode === 'register' ? 'tel' : 'username'}
                required
              />
              {errors.phone && <div className="field-error">{errors.phone}</div>}
              {!errors.phone && (
                <div className="field-hint">
                  {mode === 'register'
                    ? 'Pakistan format: 03XX-XXXXXXX or +923XXXXXXXXX.'
                    : 'Use your registered phone number or email address.'}
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
                  name="email"
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
                  name="password"
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

            {mode === 'login' && (
              <button type="button" className="forgot-link" onClick={() => navigate('/forgot-password')}>
                Forgot password?
              </button>
            )}

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
