import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        if (fullName.trim().length < 2) throw new Error('Please enter your full name.')
        await register(fullName.trim(), phone.trim(), password, email.trim() || null)
      } else {
        await login(phone.trim(), password)
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

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hero">
          <div className="brand-ur">نبض</div>
          <div className="tag-ur urdu">آپ کی آواز، آپ کی صحت</div>
          <div className="tag-en">NABZ · Your voice, your health</div>
        </div>

        <div className="auth-panel">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login')
                setError('')
              }}
            >
              لاگ اِن · Login
            </button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register')
                setError('')
              }}
            >
              نیا اکاؤنٹ · Register
            </button>
          </div>

          {error && <div className="form-error">{error}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="field">
                <label>
                  <span className="ur urdu">پورا نام</span> Full name
                </label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ammi Jan"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="field">
              <label>
                <span className="ur urdu">فون نمبر</span> Phone number
              </label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03XX-XXXXXXX"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            {mode === 'register' && (
              <div className="field">
                <label>
                  <span className="ur urdu">ای میل</span> Email{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            )}
            <div className="field">
              <label>
                <span className="ur urdu">پاس ورڈ</span> Password
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>

            <button className="btn btn-primary" disabled={busy}>
              {busy ? '…' : mode === 'register' ? 'اکاؤنٹ بنائیں · Create account' : 'لاگ اِن · Login'}
            </button>
          </form>

          <p className="form-hint">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <span className="link" onClick={() => setMode('register')}>
                  Register
                </span>
              </>
            ) : (
              <>
                Already have one?{' '}
                <span className="link" onClick={() => setMode('login')}>
                  Login
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
