import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { requestOtp, verifyOtp } from '../api'

// Soft-gate verification screen: pick a channel, send a code, enter it.
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
      if (!res.sent && !res.already_verified && !res.dev_code) {
        throw new Error(res.message || 'Could not deliver the code.')
      }
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
          <button className="back-link" onClick={() => navigate(-1)}>← واپس · Back to workspace</button>
          <div className="verify-brand"><span>نبض</span><b>NABZ</b></div>
          <div className="verify-title">
            <span>SECURE VERIFICATION</span>
            <h2 className="urdu" lang="ur" dir="rtl">{verified ? 'تصدیق مکمل ہو گئی' : stage === 'sent' ? 'اپنے پیغامات دیکھیے' : 'اپنے اکاؤنٹ کی تصدیق کیجیے'}</h2>
            <small className="verify-title-en">{verified ? 'Verification complete' : stage === 'sent' ? 'Check your messages' : 'Verify your account'}</small>
            <p className="urdu" lang="ur" dir="rtl">اپنے نجی ہیلتھ والٹ کو محفوظ بنائیے</p>
          </div>

          <div className="verify-channels" role="tablist" aria-label="Verification method">
            <button className={channel === 'phone' ? 'active' : ''} onClick={() => setChannel('phone')}>
              <span>◉</span><div><strong>WhatsApp</strong><small>{account?.phone}</small></div>
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
              نبض پر جائیے · Continue →
            </button>
          </div>
        ) : (
          <>
            <div className="verify-destination">
              <span>{channel === 'phone' ? 'WHATSAPP CODE' : 'EMAIL CODE'}</span>
              <p className="urdu" lang="ur" dir="rtl">ہم 6 ہندسوں کا کوڈ <b><bdi dir="ltr">{channel === 'phone' ? account?.phone : account?.email}</bdi></b> پر {channel === 'phone' ? 'واٹس ایپ کے ذریعے' : 'ای میل کے ذریعے'} بھیجیں گے۔</p>
              <small>We’ll send a 6-digit code {channel === 'phone' ? 'on WhatsApp' : 'by email'}.</small>
            </div>

            {error && <div className="form-error">{error}</div>}

            {stage === 'idle' ? (
              <button className="btn btn-primary verify-main-action" disabled={busy || cooldown > 0} onClick={send}>
                {busy ? 'بھیجا جا رہا ہے…' : cooldown > 0 ? `${cooldown}s بعد دوبارہ بھیجیے` : 'محفوظ کوڈ بھیجیے · Send code →'}
              </button>
            ) : (
              <form className="stack" onSubmit={submit}>
                {message && <div className="notice notice-info">{message}</div>}
                {devCode && (
                  <div className="notice notice-warn verify-test-code" role="status">
                    <b>ٹیسٹ کوڈ · Test code</b>
                    <span>{devCode}</span>
                    <small>صرف منظور شدہ ڈیمو فون کے لیے دکھائی دیتا ہے۔ · Approved demo phone only.</small>
                  </div>
                )}
                <div className="verify-code-field">
                  <label><span className="urdu" lang="ur" dir="rtl">6 ہندسوں کا کوڈ درج کیجیے</span><small>Enter the 6-digit code</small></label>
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
                  {busy ? 'تصدیق ہو رہی ہے…' : 'تصدیق کرکے آگے بڑھیے · Continue →'}
                </button>
                <div className="verify-resend">کوڈ نہیں ملا؟ · Didn’t receive it? <button type="button" disabled={cooldown > 0 || busy} onClick={send}>{cooldown > 0 ? `${cooldown}s بعد دوبارہ` : 'دوبارہ بھیجیے · Resend'}</button></div>
              </form>
            )}
          </>
        )}
          </div>
          <div className="verify-foot"><span>◇ ایک بار استعمال</span><span>⌁ خودکار میعاد</span><span>▣ پیغام میں طبی ڈیٹا نہیں</span></div>
          <button className="verify-skip" onClick={() => navigate('/')}>ابھی نہیں — بغیر تصدیق آگے بڑھیے · Not now</button>
        </div>
      </section>
    </div>
  )
}
