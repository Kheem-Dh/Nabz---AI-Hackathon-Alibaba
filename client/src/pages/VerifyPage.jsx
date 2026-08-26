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
  const [code, setCode] = useState(() => Array(6).fill(''))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef(null)
  const digitRefs = useRef([])

  const verified =
    channel === 'phone' ? account?.phone_verified : account?.email_verified

  useEffect(() => {
    // Reset transient state when switching channel.
    setStage('idle')
    setDevCode(null)
    setCode(Array(6).fill(''))
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
      const updated = await verifyOtp(channel, code.join(''))
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

  function setDigit(index, value) {
    const nextValue = value.replace(/\D/g, '')
    if (nextValue.length > 1) {
      const pasted = nextValue.slice(0, 6)
      setCode(Array.from({ length: 6 }, (_, digitIndex) => pasted[digitIndex] || ''))
      digitRefs.current[Math.min(pasted.length, 5)]?.focus()
      return
    }
    const digits = [...code]
    digits[index] = nextValue
    setCode(digits)
    if (nextValue && index < 5) digitRefs.current[index + 1]?.focus()
  }

  function digitKeyDown(index, event) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      digitRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="verify-experience">
      <section className="verify-visual" aria-hidden="true">
        <div className="verify-grid" />
        <div className="verify-shield">
          <svg viewBox="0 0 160 180">
            <path className="shield-body" d="M80 8 145 34v48c0 43-24 75-65 92C39 157 15 125 15 82V34L80 8Z" />
            <path className="shield-pulse" d="M37 91h27l10-28 18 54 11-27h21" />
            <path className="shield-check" d="m56 91 16 16 34-38" />
          </svg>
          <span className="verify-orbit orbit-a" /><span className="verify-orbit orbit-b" />
        </div>
        <div className="verify-visual-copy">
          <span>NABZ · SECURE ACCESS</span>
          <h1>One quick check.<br/><em>Your Vault stays yours.</em></h1>
          <p>Verification protects family profiles, medical documents and saved care conversations.</p>
        </div>
      </section>

      <section className="verify-panel">
        <div className="verify-panel-inner">
          <button className="back-link" onClick={() => navigate(-1)}>← Back to workspace</button>
          <div className="verify-brand"><span>نبض</span><b>NABZ</b></div>
          <div className="verify-title">
            <span>SECURE VERIFICATION</span>
            <h2>{verified ? 'Verification complete' : stage === 'sent' ? 'Check your messages' : 'Verify your account'}</h2>
            <p className="urdu">اپنے نجی ہیلتھ والٹ کو محفوظ بنائیں</p>
          </div>

          <div className="verify-channels" role="tablist" aria-label="Verification method">
            <button className={channel === 'phone' ? 'active' : ''} onClick={() => setChannel('phone')}>
              <span>◉</span><div><strong>Phone</strong><small>{account?.phone}</small></div>
            </button>
            <button className={channel === 'email' ? 'active' : ''} onClick={() => setChannel('email')} disabled={!hasEmail} title={hasEmail ? '' : 'No email on this account'}>
              <span>✉</span><div><strong>Email</strong><small>{hasEmail ? account?.email : 'Not added'}</small></div>
            </button>
          </div>

          <div className="verify-card stack">
        {verified ? (
          <div className="center-state verify-success">
            <div className="verify-success-icon">✓</div>
            <p className="cs-ur urdu">تصدیق مکمل ہو گئی۔</p>
            <p className="cs-en">
              Your {channel} is verified{channel === 'phone' ? ` (${account?.phone})` : ` (${account?.email})`}.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Continue to Nabz →
            </button>
          </div>
        ) : (
          <>
            <div className="verify-destination">
              <span>{channel === 'phone' ? 'SMS CODE' : 'EMAIL CODE'}</span>
              <p>We’ll send a 6-digit code to <b>{channel === 'phone' ? account?.phone : account?.email}</b>.</p>
            </div>

            {error && <div className="form-error">{error}</div>}

            {stage === 'idle' ? (
              <button className="btn btn-primary verify-main-action" disabled={busy || cooldown > 0} onClick={send}>
                {busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send secure code →'}
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
                <div className="verify-code-field">
                  <label>Enter the 6-digit code</label>
                  <div className="verify-digits" onPaste={(event) => {
                    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                    if (pasted) {
                      event.preventDefault()
                      setCode(Array.from({ length: 6 }, (_, index) => pasted[index] || ''))
                      digitRefs.current[Math.min(pasted.length, 5)]?.focus()
                    }
                  }}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <input
                        key={index}
                        ref={(node) => { digitRefs.current[index] = node }}
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        value={code[index] || ''}
                        onChange={(event) => setDigit(index, event.target.value)}
                        onKeyDown={(event) => digitKeyDown(index, event)}
                        aria-label={`Code digit ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
                <button className="btn btn-primary verify-main-action" disabled={busy || code.some((digit) => !digit)}>
                  {busy ? 'Verifying…' : 'Verify and continue →'}
                </button>
                <div className="verify-resend">Didn’t receive it? <button type="button" disabled={cooldown > 0 || busy} onClick={send}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button></div>
              </form>
            )}
          </>
        )}
          </div>
          <div className="verify-foot"><span>◇ Single-use code</span><span>⌁ Expires automatically</span><span>▣ No medical data in SMS</span></div>
          <button className="verify-skip" onClick={() => navigate('/')}>Not now — continue without verification</button>
        </div>
      </section>
    </div>
  )
}
