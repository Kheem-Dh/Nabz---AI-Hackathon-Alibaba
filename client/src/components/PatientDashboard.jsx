import { useEffect, useState } from 'react'
import { getDashboard } from '../api'

const DOC_LABELS = {
  xray: 'X-ray',
  mri: 'MRI',
  skin: 'Skin',
  lab: 'Labs',
  prescription: 'Prescriptions',
  other: 'Other',
}

export default function PatientDashboard({ profile, onOpenVault }) {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')

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

  if (error) return null
  if (!dashboard) {
    return (
      <div className="patient-dashboard patient-dashboard-loading">
        <div className="spinner spinner-small" />
        <span>Preparing {profile.display_name}&apos;s health view…</span>
      </div>
    )
  }

  const counts = Object.entries(dashboard.document_counts || {})
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
        <button className="pd-vault-btn" onClick={onOpenVault}>Open vault ›</button>
      </div>

      <p className="pd-summary-ur urdu">{dashboard.summary_urdu}</p>
      <p className="pd-summary-en">{dashboard.summary_english}</p>

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
    </section>
  )
}
