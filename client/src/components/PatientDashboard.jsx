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

export default function PatientDashboard({ profile, onOpenVault, onOpenSummary }) {
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
  const maxDocumentCount = Math.max(1, ...counts.map(([, count]) => count))

  return (
    <section className="patient-dashboard">
      <div className="pd-head">
        <div>
          <div className="pd-eyebrow">PRIVATE HEALTH VIEW</div>
          <div className="pd-name">{dashboard.patient_name}&apos;s health record</div>
          <div className="pd-name-ur urdu" lang="ur">{dashboard.patient_name} کا صحت ریکارڈ</div>
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

      {(dashboard.date_of_birth || dashboard.weight_kg || dashboard.bp_systolic) && (
        <div className="profile-vitals-summary">
          {dashboard.date_of_birth && <span>DOB <strong>{dashboard.date_of_birth}</strong></span>}
          {dashboard.weight_kg && <span>Weight <strong>{dashboard.weight_kg} kg</strong></span>}
          {dashboard.bp_systolic && dashboard.bp_diastolic && (
            <span>BP <strong>{dashboard.bp_systolic}/{dashboard.bp_diastolic}</strong>{dashboard.bp_recorded_at ? ` · ${dashboard.bp_recorded_at}` : ''}</span>
          )}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="pd-stats">
        <div><strong>{dashboard.document_total}</strong><span>Documents</span></div>
        <div><strong>{dashboard.current_medicines.length}</strong><span>Confirmed medicines</span></div>
        <div><strong>{dashboard.allergies.length}</strong><span>Allergies</span></div>
      </div>

      <div className="pd-record-visual">
        <div className="pd-visual-head">
          <strong>Record at a glance</strong>
          <span>Built from your uploaded Vault records</span>
        </div>
        {counts.length > 0 ? counts.map(([type, count]) => (
          <div className="pd-bar-row" key={`bar-${type}`}>
            <span>{DOC_LABELS[type] || type}</span>
            <div><i style={{ width: `${Math.max(12, (count / maxDocumentCount) * 100)}%` }} /></div>
            <strong>{count}</strong>
          </div>
        )) : (
          <button className="pd-empty-record" onClick={onOpenVault}>
            Upload a lab, prescription, image, or report to build this view.
          </button>
        )}
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

      {dashboard.recent_activity?.length > 0 && (
        <div className="pd-activity">
          <span className="pd-activity-title">Health record timeline</span>
          {dashboard.recent_activity.slice(0, 4).map((entry) => (
            <div className="pd-activity-item" key={entry.id}>
              <i />
              <span><strong>{entry.title}</strong><small>{new Date(entry.created_at).toLocaleDateString()}</small></span>
            </div>
          ))}
        </div>
      )}

      {dashboard.latest_triage?.doctor_differential?.length > 0 && (
        <details className="pd-differential">
          <summary>
            <span>Latest clinical snapshot</span>
            <small>{dashboard.latest_triage?.level?.replace('_', ' ')}</small>
          </summary>
          <div className="pd-differential-body">
          <div className="pd-evidence-head">
            <span>Doctor-facing differential — latest encounter</span>
            <small>
              {dashboard.latest_triage?.date?.slice(0, 10)} ·
              {dashboard.latest_triage?.level?.replace('_', ' ')}
            </small>
          </div>
          {dashboard.latest_triage.patient_facing_impression_english && (
            <p className="pd-impression">
              {dashboard.latest_triage.patient_facing_impression_english}
            </p>
          )}
          <ul>
            {dashboard.latest_triage.doctor_differential.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {dashboard.latest_triage.red_flags_present?.length > 0 && (
            <div className="pd-redflags">
              <strong>Red flags reported:</strong>{' '}
              {dashboard.latest_triage.red_flags_present.join(' · ')}
            </div>
          )}
          {dashboard.latest_triage.unresolved_questions?.length > 0 && (
            <div className="pd-unresolved">
              <strong>Unresolved for the clinician:</strong>
              <ul>
                {dashboard.latest_triage.unresolved_questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {dashboard.latest_triage.encounter_transcript?.length > 0 && (
            <details className="pd-transcript">
              <summary>Full encounter transcript</summary>
              <ol>
                {dashboard.latest_triage.encounter_transcript.map((t, i) => (
                  <li key={i}><strong>{t.role}:</strong> {t.text}</li>
                ))}
              </ol>
            </details>
          )}
          </div>
        </details>
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
