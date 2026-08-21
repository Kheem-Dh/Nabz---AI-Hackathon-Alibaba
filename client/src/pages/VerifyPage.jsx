import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { requestOtp, verifyOtp } from '../api'

// Soft-gate verification screen: pick a channel, send a code, enter it.
// In mock/dev mode the backend returns the code as `dev_code`, which we show
// so the flow is demoable without an SMS/SMTP provider.
export default function VerifyPage() {
  const { account, applyAccount } = useAuth()
  const navigate = useNavigate()

  const hasEmail = !!account?.email
  const [channel, setChannel] = useState('phone')
  const [stage, setStage] = useState('idle') // idle | sent
  const [devCode, setDevCode] = useState(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef(null)

  const verified =
    channel === 'phone' ? account?.phone_verified : account?.email_verified

  useEffect(() => {
    // Reset transient state when switching channel.
    setStage('idle')
    setDevCode(null)
    setCode('')
    setError('')
    setMessage('')
  }, [channel])

  useEffect(() => () => clearInterval(timerRef.current), [])

  function startCooldown(seconds) {
    setCooldown(seconds)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  async function send() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await requestOtp(channel)
      setStage('sent')
      setDevCode(res.dev_code || null)
      setMessage(res.message || 'Code sent.')
      startCooldown(30)
    } catch (e) {
      const d = e.message || ''
      if (d.startsWith('resend_cooldown')) {
        const secs = Number(d.split(':')[1]) || 30
        startCooldown(secs)
        setError(`Please wait ${secs}s before requesting another code.`)
      } else if (d === 'no_email_on_account') {
        setError('No email on this account. Add one at registration to verify email.')
      } else {
        setError(d || 'Could not send the code.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const updated = await verifyOtp(channel, code.trim())
      applyAccount(updated)
      setMessage('')
    } catch (e2) {
      const d = e2.message || ''
      if (d.startsWith('invalid_code')) {
        const left = d.split(':')[1]
        setError(left ? `Wrong code — ${left} attempts left.` : 'Wrong code.')
      } else if (d === 'code_expired') {
        setError('That code expired. Send a new one.')
        setStage('idle')
      } else if (d === 'too_many_attempts') {
        setError('Too many attempts. Send a new code.')
        setStage('idle')
      } else if (d === 'no_active_code') {
        setError('Send a code first.')
        setStage('idle')
      } else {
        setError(d || 'Could not verify.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ واپس · Back
      </button>
      <div className="section-title">
        <span className="ur urdu">اکاؤنٹ کی تصدیق</span>
        <span className="en">Verify your account</span>
      </div>

      {/* Channel tabs */}
      <div className="auth-tabs" role="tablist">
        <button
          className={`auth-tab ${channel === 'phone' ? 'active' : ''}`}
          onClick={() => setChannel('phone')}
        >
          📱 فون · Phone
        </button>
        <button
          className={`auth-tab ${channel === 'email' ? 'active' : ''}`}
          onClick={() => setChannel('email')}
          disabled={!hasEmail}
          title={hasEmail ? '' : 'No email on this account'}
          style={!hasEmail ? { opacity: 0.5 } : undefined}
        >
          ✉️ ای میل · Email
        </button>
      </div>

      <div className="card stack">
        {verified ? (
          <div className="center-state" style={{ padding: '20px 0' }}>
            <div style={{ fontSize: 42 }}>✅</div>
            <p className="cs-ur urdu">تصدیق مکمل ہو گئی۔</p>
            <p className="cs-en">
              Your {channel} is verified{channel === 'phone' ? ` (${account?.phone})` : ` (${account?.email})`}.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              ہوم · Go home
            </button>
          </div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              We’ll send a 6-digit code to{' '}
              <b>{channel === 'phone' ? account?.phone : account?.email}</b>.
            </p>

            {error && <div className="form-error">{error}</div>}

            {stage === 'idle' ? (
              <button className="btn btn-primary" disabled={busy || cooldown > 0} onClick={send}>
                {busy ? '…' : cooldown > 0 ? `Resend in ${cooldown}s` : '📨 کوڈ بھیجیں · Send code'}
              </button>
            ) : (
              <form className="stack" onSubmit={submit}>
                {message && <div className="notice notice-info">{message}</div>}
                {devCode && (
                  <div className="notice notice-warn">
                    <b>Demo mode</b> — your code is <b style={{ fontSize: 18, letterSpacing: 2 }}>{devCode}</b>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      (shown because no SMS/email provider is configured)
                    </div>
                  </div>
                )}
                <div className="field" style={{ margin: 0 }}>
                  <label>Enter code</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
                  />
                </div>
                <button className="btn btn-primary" disabled={busy || code.length < 4}>
                  {busy ? '…' : '✔ تصدیق کریں · Verify'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={cooldown > 0 || busy}
                  onClick={send}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'دوبارہ بھیجیں · Resend code'}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        Verifying is optional right now — you can keep using Nabz either way.
      </p>
    </div>
  )
}
