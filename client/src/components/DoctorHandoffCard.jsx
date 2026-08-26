import { useEffect, useState } from 'react'
import { createDoctorHandoff, readDoctorHandoff } from '../api'
import { toSvg } from '../utils/qrcode'

// One-tap doctor handoff: issues a short-lived JWT link, renders a QR code
// the doctor can scan. Also offers Copy and Open (new tab) fallbacks.
export default function DoctorHandoffCard({ profileId }) {
  const [handoff, setHandoff] = useState(null)  // {token, url, expires_at, ttl_hours}
  const [svg, setSvg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [qrError, setQrError] = useState('')
  const [copied, setCopied] = useState(false)

  async function issue() {
    setError('')
    setQrError('')
    setSvg('')
    setCopied(false)
    setBusy(true)
    try {
      const h = await createDoctorHandoff(profileId)
      // The API may run on a different Render service. Always make the QR
      // open the public React handoff route on the web origin.
      const publicUrl = `${window.location.origin}/handoff/${encodeURIComponent(h.token)}`
      // Do not display a QR until its public, unauthenticated read endpoint has
      // successfully returned the physician snapshot. This catches routing,
      // deployment and signing problems before the patient reaches the clinic.
      await readDoctorHandoff(h.token)
      setHandoff({ ...h, url: publicUrl })
    } catch (e) {
      setError(
        e?.message === 'handoff_service_misrouted'
          ? 'The doctor-view service is not routed correctly yet. Please try again after the deployment finishes.'
          : e?.message || 'Could not create and verify a doctor handoff link.',
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!handoff?.url) { setSvg(''); setQrError(''); return }
    let alive = true
    setQrError('')
    toSvg(handoff.url, { width: 220 })
      .then((s) => { if (alive) setSvg(s) })
      .catch(() => {
        if (alive) {
          setSvg('')
          setQrError('The QR image could not be rendered. Use Copy link or Open handoff below.')
        }
      })
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
            One-tap read-only snapshot: assessment, supporting findings, Vault documents,
            confirmed medicines and recent labs. The link expires after {expiresIn} — no login for the doctor.
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
          {svg ? (
            <div
              className="doctor-handoff-qr"
              aria-label="QR code linking to the doctor snapshot"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="doctor-handoff-qr" aria-live="polite">
              {!qrError && <span className="spinner-inline" aria-label="Rendering QR code" />}
              {qrError && <span className="doctor-handoff-qr-error">QR unavailable</span>}
            </div>
          )}
          <div className="doctor-handoff-actions">
            <div className="doctor-handoff-ready">✓ Link verified · report ready for the doctor</div>
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
              Expires {new Date(handoff.expires_at).toLocaleString()}. Each generated link remains usable only until its own expiry.
            </div>
            {qrError && <div className="form-error">{qrError}</div>}
          </div>
        </div>
      )}
    </section>
  )
}
