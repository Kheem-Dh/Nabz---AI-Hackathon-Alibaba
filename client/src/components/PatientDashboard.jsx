import { useEffect, useState } from 'react'
import { getDashboard, seedDemoProfile } from '../api'
import { useProfiles } from '../context/ProfileContext'

const DOC_LABELS = {
  xray: 'X-ray',
  mri: 'MRI',
  skin: 'Skin',
  lab: 'Labs',
  prescription: 'Prescriptions',
  other: 'Other',
}

export default function PatientDashboard({ profile, onOpenVault, onOpenSummary }) {
  const { refresh } = useProfiles()
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [seeding, setSeeding] = useState(false)

  async function loadDashboard() {
    const data = await getDashboard(profile.id)
    setDashboard(data)
    return data
  }

  useEffect(() => {
    let alive = true
    setDashboard(null)
    setError('')
    getDashboard(profile.id)
      .then((data) => alive && setDashboard(data))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [profile.id])

  if (error && !dashboard) return <div className="form-error">{error}</div>
  if (!dashboard) {
    return (
      <div className="patient-dashboard patient-dashboard-loading">
        <div className="spinner spinner-small" />
        <span>Preparing {profile.display_name}&apos;s health view…</span>
      </div>
    )
  }

  const counts = Object.entries(dashboard.document_counts || {})
  const canSeedHassan = dashboard.patient_name.toLowerCase() === 'hassan' && dashboard.document_total === 0

  async function seedHassan() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoProfile(profile.id)
      await Promise.all([loadDashboard(), refresh()])
    } catch (err) {
      setError(err.message)
    } finally {
      setSeeding(false)
    }
  }

  return (
    <section className="patient-dashboard">
      <div className="pd-head">
        <div>
          <div className="pd-eyebrow">PRIVATE HEALTH VIEW</div>
          <div className="pd-name urdu">{dashboard.patient_name} کا صحت ریکارڈ</div>
          <div className="pd-meta">
            {[dashboard.age != null ? `${dashboard.age} yrs` : null, dashboard.gender, dashboard.blood_group]
              .filter(Boolean)
              .join(' · ') || 'Personal health dashboard'}
          </div>
        </div>
        <div className="pd-head-actions">
          <button className="pd-vault-btn" onClick={onOpenSummary}>Doctor view</button>
          <button className="pd-vault-btn" onClick={onOpenVault}>Open vault ›</button>
        </div>
      </div>

      <p className="pd-summary-ur urdu">{dashboard.summary_urdu}</p>
      <p className="pd-summary-en">{dashboard.summary_english}</p>

      {canSeedHassan && (
        <button className="pd-demo-seed" onClick={seedHassan} disabled={seeding}>
          {seeding ? 'Preparing demo record…' : '＋ Load Hassan’s synthetic demo history'}
        </button>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="pd-stats">
        <div><strong>{dashboard.document_total}</strong><span>Documents</span></div>
        <div><strong>{dashboard.current_medicines.length}</strong><span>Confirmed medicines</span></div>
        <div><strong>{dashboard.allergies.length}</strong><span>Allergies</span></div>
      </div>

      {(dashboard.chronic_conditions.length > 0 || dashboard.allergies.length > 0) && (
        <div className="pd-tags">
          {dashboard.chronic_conditions.map((item) => <span className="tag" key={`c-${item}`}>{item}</span>)}
          {dashboard.allergies.map((item) => <span className="tag warn" key={`a-${item}`}>⚠ {item}</span>)}
        </div>
      )}

      {counts.length > 0 && (
        <div className="pd-doc-counts">
          {counts.map(([type, count]) => (
            <span key={type}>{DOC_LABELS[type] || type}: <strong>{count}</strong></span>
          ))}
        </div>
      )}

      {(dashboard.profile_notes || dashboard.current_medicines.length > 0 || dashboard.latest_triage || dashboard.latest_lab) && (
        <div className="pd-record-grid">
          {dashboard.profile_notes && (
            <div className="pd-record-item">
              <span>Recorded history</span>
              <strong>{dashboard.profile_notes}</strong>
            </div>
          )}
          {dashboard.current_medicines.length > 0 && (
            <div className="pd-record-item">
              <span>Confirmed from clinician prescription</span>
              <strong>{dashboard.current_medicines.map((medicine) => [medicine.name, medicine.strength].filter(Boolean).join(' ')).join(' · ')}</strong>
            </div>
          )}
          {dashboard.latest_triage && (
            <div className="pd-record-item">
              <span>Latest urgency assessment</span>
              <strong>{dashboard.latest_triage.level?.replace('_', ' ') || dashboard.latest_triage.title}</strong>
            </div>
          )}
          {dashboard.latest_lab && (
            <div className="pd-record-item">
              <span>Latest lab record</span>
              <strong>{dashboard.latest_lab.title} · {dashboard.latest_lab.flagged_count} flagged values</strong>
            </div>
          )}
        </div>
      )}

      {dashboard.recent_documents.length > 0 && (
        <div className="pd-recent">
          <span>Recent documents</span>
          {dashboard.recent_documents.map((document) => (
            <button key={document.id} onClick={onOpenVault}>{document.title} ›</button>
          ))}
        </div>
      )}

      {dashboard.medicine_evidence?.length > 0 && (
        <div className="pd-evidence">
          <div className="pd-evidence-head">
            <span>WHO medicine reference</span>
            <small>For clinician-confirmed Vault medicines—not a new recommendation</small>
          </div>
          {dashboard.medicine_evidence.map((evidence) => (
            <article key={evidence.medicine_id}>
              <strong>{evidence.medicine_name} {evidence.recorded_details}</strong>
              <span>{evidence.source_status}</span>
              <p>{evidence.evidence_summary}</p>
              <a href={evidence.who_source_url} target="_blank" rel="noreferrer">Open WHO source ↗</a>
              <small>{evidence.safety_note}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
