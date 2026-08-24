import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { confirmLabReport, getProfile, uploadLabReport } from '../api'
import ConsentCheckbox from '../components/ConsentCheckbox'
import { useTextToSpeech } from '../hooks/useTextToSpeech'

export default function LabReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const tts = useTextToSpeech()

  const [profile, setProfile] = useState(null)
  const [file, setFile] = useState(null)
  const [consent, setConsent] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getProfile(id).then(setProfile).catch((e) => setError(e.message))
  }, [id])

  async function submit() {
    if (!file || !consent) return
    setBusy(true)
    setError('')
    try {
      const out = await uploadLabReport(id, file)
      setResult(out)
      if (out.explanation_urdu) tts.speak(out.explanation_urdu)
    } catch (e) {
      setError(e.message || 'Could not read the report.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmAndSave() {
    if (!file || !result) return
    setBusy(true)
    setError('')
    try {
      const saved = await confirmLabReport(id, file, result)
      setResult(saved)
    } catch (e) {
      setError(e.message || 'Could not save this report.')
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
        <span className="ur urdu">لیب رپورٹ سمجھیں</span>
        <span className="en">
          Explain a lab report{profile ? ` — for ${profile.display_name}` : ''}
        </span>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!result && (
        <div className="card stack">
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
            📎 {file ? file.name : 'تصویر یا PDF منتخب کریں · Choose image / PDF'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <ConsentCheckbox checked={consent} onChange={setConsent} />
          <button className="btn btn-primary" disabled={!file || !consent || busy} onClick={submit}>
            {busy ? 'پڑھ رہے ہیں…' : '🔍 رپورٹ پڑھیں · Read report'}
          </button>
          <p className="muted" style={{ fontSize: 12 }}>
            Maximum 25 MB. Nabz explains values in plain Urdu and flags out-of-range results.
            Nothing enters the Vault until you review and confirm it.
          </p>
        </div>
      )}

      {busy && (
        <div className="center-state">
          <div className="spinner" />
          <p className="cs-ur urdu">رپورٹ کا تجزیہ ہو رہا ہے…</p>
        </div>
      )}

      {result && (
        <div className="stack">
          <div className="card">
            <div className="section-title" style={{ margin: '0 0 8px' }}>
              <span className="ur urdu">{result.report_title}</span>
              <span className="en">
                {[result.lab_name, result.report_date].filter(Boolean).join(' · ')}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {result.values.map((v, i) => {
                  const flagged = v.flag && v.flag.toLowerCase() !== 'normal'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 4px' }}>{v.name}</td>
                      <td style={{ padding: '8px 4px', fontWeight: 700 }}>
                        {v.value} {v.unit}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                        {flagged ? (
                          <span
                            className="tag warn"
                            style={{
                              color: v.flag === 'high' ? 'var(--red)' : 'var(--amber)',
                            }}
                          >
                            {v.flag === 'high' ? '▲' : '▼'} {v.flag}
                          </span>
                        ) : (
                          <span className="muted">ok</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <p className="advice-ur urdu" dir="rtl" style={{ margin: 0 }}>
              {result.explanation_urdu}
            </p>
            <p className="advice-en" style={{ marginTop: 10 }}>
              {result.explanation_english}
            </p>
            <button className="btn btn-ghost mt-8" onClick={() => tts.speak(result.explanation_urdu)}>
              🔊 سنیں · Listen
            </button>
            {result.mock && <span className="mock-badge">demo / mock mode</span>}
          </div>

          <div className="btn-row">
            <button className="btn btn-outline" disabled={busy} onClick={() => setResult(null)}>
              دوبارہ · Another
            </button>
            {result.saved ? (
              <button className="btn btn-primary" onClick={() => navigate(`/profile/${id}`)}>
                والٹ دیکھیں · View saved record
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={confirmAndSave}>
                {busy ? 'Saving…' : 'Review complete · Confirm and save'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
