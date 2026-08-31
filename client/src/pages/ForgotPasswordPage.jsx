import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { confirmPasswordReset, requestPasswordReset } from '../api'
import { validatePassword } from '../utils/validators'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState('request')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestCode(event) {
    event.preventDefault()
    if (!identifier.trim()) return setError('Enter your phone number or email.')
    setBusy(true)
    setError('')
    try {
      const result = await requestPasswordReset(identifier.trim())
      setMessage(result.message)
      setStage('confirm')
    } catch (err) {
      setError(err.message || 'Could not request a reset code.')
    } finally {
      setBusy(false)
    }
  }

  async function finish(event) {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) return setError(passwordError)
    if (code.length !== 6) return setError('Enter the complete six-digit code.')
    setBusy(true)
    setError('')
    try {
      await confirmPasswordReset(identifier.trim(), code, password)
      navigate('/auth?mode=login&reset=done', { replace: true })
    } catch (err) {
      setError(
        err.message === 'invalid_or_expired_reset_code'
          ? 'That reset code is incorrect or expired. Request a new one.'
          : err.message || 'Could not reset the password.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap reset-wrap">
      <div className="reset-card">
        <button className="back-link" onClick={() => navigate('/auth?mode=login')}>← Back to login</button>
        <div className="reset-mark">نبض</div>
        <span className="reset-kicker">ACCOUNT RECOVERY</span>
        <h1>{stage === 'request' ? 'Reset your password' : 'Check for your code'}</h1>
        <p>
          {stage === 'request'
            ? 'Enter the phone number or email connected to your Nabz account.'
            : message}
        </p>
        {error && <div className="form-error">{error}</div>}
        {stage === 'request' ? (
          <form onSubmit={requestCode}>
            <div className="field">
              <label htmlFor="reset-id">Phone number or email</label>
              <input
                id="reset-id"
                className="input"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="03XX-XXXXXXX or you@example.com"
                autoComplete="username"
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</button>
          </form>
        ) : (
          <form onSubmit={finish}>
            <div className="field">
              <label htmlFor="reset-code">Six-digit code</label>
              <input
                id="reset-code"
                className="input reset-code-input"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </div>
            <div className="field">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</button>
            <button type="button" className="btn btn-ghost reset-resend" onClick={() => setStage('request')}>Use a different phone or email</button>
          </form>
        )}
      </div>
    </div>
  )
}
