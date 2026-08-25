import { useEffect, useState } from 'react'
import { createDoctorHandoff } from '../api'
import { toSvg } from '../utils/qrcode'

// One-tap doctor handoff: issues a short-lived JWT link, renders a QR code
// the doctor can scan. Also offers Copy and Open (new tab) fallbacks.
export default function DoctorHandoffCard({ profileId }) {
  const [handoff, setHandoff] = useState(null)  // {token, url, expires_at, ttl_hours}
  const [svg, setSvg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function issue() {
    setError('')
    setCopied(false)
    setBusy(true)
    try {
      const h = await createDoctorHandoff(profileId)
      setHandoff(h)
    } catch (e) {
      setError(e?.message || 'Could not create a handoff link.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!handoff?.url) { setSvg(''); return }
    let alive = true
    toSvg(handoff.url, { width: 220 })
      .then((s) => { if (alive) setSvg(s) })
      .catch(() => { if (alive) setSvg('') })
    return () => { alive = false }
  }, [handoff?.url])

  async function copyLink() {
    if (!handoff?.url) return
    try {
      await navigator.clipboard.writeText(handoff.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore, user can still tap Open
    }
  }

  const expiresIn = handoff?.ttl_hours ? `${handoff.ttl_hours} hour${handoff.ttl_hours === 1 ? '' : 's'}` : 'shortly'

  return (
    <section className="doctor-handoff-card" aria-label="Doctor handoff QR">
      <header className="doctor-handoff-head">
        <div>
          <div className="doctor-handoff-kicker">FOR YOUR DOCTOR</div>
          <h2>Show this QR at the clinic</h2>
          <p>
            One-tap read-only snapshot: impression, differential, red flags, confirmed medicines,
            recent flagged labs. The link expires after {expiresIn} — no login for the doctor.
          </p>
        </div>
        {!handoff && (
          <button
            className="btn btn-primary"
            onClick={issue}
            disabled={busy}
          >
            {busy ? 'Preparing…' : 'Generate doctor QR'}
          </button>
        )}
      </header>

      {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}

      {handoff && (
        <div className="doctor-handoff-body">
          <div
            className="doctor-handoff-qr"
            aria-label="QR code linking to the doctor snapshot"
            dangerouslySetInnerHTML={{ __html: svg || '' }}
          />
          <div className="doctor-handoff-actions">
            <div className="doctor-handoff-url" title={handoff.url}>{handoff.url}</div>
            <div className="doctor-handoff-buttons">
              <button className="btn btn-outline" onClick={copyLink}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <a
                className="btn btn-primary"
                href={handoff.url}
                target="_blank"
                rel="noreferrer"
              >
                Open handoff ↗
              </a>
              <button className="btn btn-ghost" onClick={issue} disabled={busy}>
                {busy ? 'Refreshing…' : 'Regenerate'}
              </button>
            </div>
            <div className="doctor-handoff-hint">
              Expires {new Date(handoff.expires_at).toLocaleString()}. Regenerating invalidates any older link once it expires.
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
