import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  attachConfirmedPrescription,
  confirmPrescription,
  getProfile,
  scanPrescription,
} from '../api'
import ConsentCheckbox from '../components/ConsentCheckbox'

// Scan -> review/edit each medicine (nothing is saved until confirmed) -> save.
export default function PrescriptionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [profile, setProfile] = useState(null)
  const [file, setFile] = useState(null)
  const [consent, setConsent] = useState(false)
  const [rx, setRx] = useState(null) // extracted, editable
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [confirmationEntryId, setConfirmationEntryId] = useState(null)

  useEffect(() => {
    getProfile(id).then(setProfile).catch((e) => setError(e.message))
  }, [id])

  async function scan() {
    if (!file || !consent) return
    setBusy(true)
    setError('')
    try {
      const out = await scanPrescription(id, file)
      setRx(out)
    } catch (e) {
      setError(e.message || 'Could not read the prescription.')
    } finally {
      setBusy(false)
    }
  }

  function setMed(i, key, value) {
    setRx((r) => {
      const medicines = r.medicines.map((m, j) => (j === i ? { ...m, [key]: value } : m))
      return { ...r, medicines }
    })
  }
  function removeMed(i) {
    setRx((r) => ({ ...r, medicines: r.medicines.filter((_, j) => j !== i) }))
  }
  function addMed() {
    setRx((r) => ({
      ...r,
      medicines: [
        ...r.medicines,
        { name: '', strength: '', frequency: '', duration: '', notes: '', confidence: 1 },
      ],
    }))
  }

  async function save() {
    const medicines = rx.medicines.filter((m) => (m.name || '').trim())
    if (medicines.length === 0) {
      setError('Add at least one medicine, or go back.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let entryId = confirmationEntryId
      if (!entryId) {
        const saved = await confirmPrescription({
          profile_id: Number(id),
          date: rx.date || null,
          doctor_name: rx.doctor_name || null,
          clinic: rx.clinic || null,
          medicines,
        })
        entryId = saved[0]?.confirmation_entry_id
        setConfirmationEntryId(entryId)
      }
      if (file && entryId) {
        await attachConfirmedPrescription(Number(id), entryId, file)
      }
      setDone(true)
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  // --- Saved confirmation ---
  if (done) {
    return (
      <div className="page">
        <div className="center-state">
          <div style={{ fontSize: 46 }}>✅</div>
          <p className="cs-ur urdu">ادویات والٹ میں محفوظ ہو گئیں۔</p>
          <p className="cs-en">Saved to {profile?.display_name}’s vault.</p>
          <button className="btn btn-primary" onClick={() => navigate(`/profile/${id}`)}>
            پروفائل کھولیں · Open profile
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ واپس · Back
      </button>
      <div className="section-title">
        <span className="ur urdu">نسخہ اسکین کریں</span>
        <span className="en">
          Scan a prescription{profile ? ` — for ${profile.display_name}` : ''}
        </span>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* Step 1: upload */}
      {!rx && (
        <div className="card stack">
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
            📷 {file ? file.name : 'نسخے کی تصویر · Photograph the prescription'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <ConsentCheckbox checked={consent} onChange={setConsent} />
          <button className="btn btn-primary" disabled={!file || !consent || busy} onClick={scan}>
            {busy ? 'پڑھ رہے ہیں…' : '🔍 نسخہ پڑھیں · Read prescription'}
          </button>
          <p className="muted" style={{ fontSize: 12 }}>
            Nabz reads printed or handwritten prescriptions. It never invents a medicine — you
            review and confirm everything before it is saved.
          </p>
        </div>
      )}

      {busy && !rx && (
        <div className="center-state">
          <div className="spinner" />
          <p className="cs-ur urdu">نسخہ پڑھا جا رہا ہے…</p>
        </div>
      )}

      {/* Step 2: confirm extracted medicines */}
      {rx && (
        <div className="stack">
          <div className="notice notice-info">
            <span className="ur urdu">
              نیچے دی گئی معلومات کی تصدیق کریں۔ غلط ہو تو درست کریں — محفوظ کرنے سے پہلے۔
            </span>
            Review & edit before saving. Low-confidence fields are highlighted — please check them
            against the paper.
          </div>

          {rx.unreadable && rx.medicines.length === 0 && (
            <div className="notice notice-warn">
              <span className="ur urdu">نسخہ صاف پڑھا نہیں جا سکا۔ صاف تصویر دوبارہ لیں۔</span>
              The prescription couldn’t be read clearly. Add medicines manually or rescan.
            </div>
          )}

          <div className="rx-grid">
            <div className="field" style={{ margin: 0 }}>
              <label>Date</label>
              <input
                className="input"
                value={rx.date || ''}
                onChange={(e) => setRx((r) => ({ ...r, date: e.target.value }))}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Clinic / Doctor</label>
              <input
                className="input"
                value={rx.clinic || rx.doctor_name || ''}
                onChange={(e) => setRx((r) => ({ ...r, clinic: e.target.value }))}
              />
            </div>
          </div>

          {rx.medicines.map((m, i) => {
            const low = (m.confidence ?? 1) < 0.6
            return (
              <div className={`rx-med ${low ? 'low' : ''}`} key={i}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className={`rx-conf ${low ? 'low' : 'ok'}`}>
                    {low ? '⚠ Check this' : '✓ Clear'} · {Math.round((m.confidence ?? 1) * 100)}%
                  </span>
                  <button className="round-btn" onClick={() => removeMed(i)} aria-label="Remove">
                    🗑
                  </button>
                </div>
                <div className="field" style={{ margin: '8px 0 0' }}>
                  <label>Medicine name</label>
                  <input className="input" value={m.name} onChange={(e) => setMed(i, 'name', e.target.value)} />
                </div>
                <div className="rx-grid">
                  <div className="field" style={{ margin: 0 }}>
                    <label>Strength</label>
                    <input className="input" value={m.strength || ''} onChange={(e) => setMed(i, 'strength', e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Frequency</label>
                    <input className="input" value={m.frequency || ''} onChange={(e) => setMed(i, 'frequency', e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Duration</label>
                    <input className="input" value={m.duration || ''} onChange={(e) => setMed(i, 'duration', e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Notes</label>
                    <input className="input" value={m.notes || ''} onChange={(e) => setMed(i, 'notes', e.target.value)} />
                  </div>
                </div>
              </div>
            )
          })}

          <button className="btn btn-outline" onClick={addMed}>
            ＋ دوا شامل کریں · Add medicine
          </button>

          <div className="btn-row">
            <button className="btn btn-outline" onClick={() => { setRx(null); setConfirmationEntryId(null) }}>
              دوبارہ اسکین · Rescan
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? '…' : '✔ تصدیق و محفوظ · Confirm & save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
