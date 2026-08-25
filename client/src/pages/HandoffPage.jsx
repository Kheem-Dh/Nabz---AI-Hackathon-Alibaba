import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { readDoctorHandoff } from '../api'

// Public, unauthenticated read-only doctor view. The URL token itself is the
// grant. Bounded snapshot — no free-text transcript, no phone, no location.
export default function HandoffPage() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    readDoctorHandoff(token)
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((e) => alive && setState({ loading: false, error: e, data: null }))
    return () => { alive = false }
  }, [token])

  if (state.loading) {
    return (
      <div className="handoff-page">
        <div className="handoff-loading">Loading patient snapshot…</div>
      </div>
    )
  }
  if (state.error) {
    const detail = state.error?.detail || state.error?.message || ''
    const expired = /handoff_expired/.test(detail)
    return (
      <div className="handoff-page">
        <div className="handoff-error">
          <h1>{expired ? 'This handoff link has expired.' : 'Handoff link is not valid.'}</h1>
          <p>
            Ask the patient to generate a fresh QR from the Doctor handoff section
            of the Nabz app.
          </p>
        </div>
      </div>
    )
  }
  const { patient, chronic_conditions, allergies, current_medicines, latest_triage, recent_labs, notice } = state.data || {}

  return (
    <div className="handoff-page">
      <div className="handoff-wrap">
        <header className="handoff-header">
          <div className="handoff-brand">
            <span className="brand-ur">نبض</span>
            <span>NABZ · Doctor snapshot</span>
          </div>
          <button className="btn btn-outline" onClick={() => window.print()}>Print</button>
        </header>

        <section className="handoff-patient-card">
          <h1>{patient?.name || 'Patient'}</h1>
          <div className="handoff-patient-meta">
            {[
              patient?.relation,
              patient?.age != null ? `${patient.age} yrs` : null,
              patient?.gender,
              patient?.blood_group,
            ].filter(Boolean).join(' · ')}
          </div>
          {allergies?.length > 0 && (
            <div className="handoff-allergy">
              ⚠ Allergies: <strong>{allergies.join(', ')}</strong>
            </div>
          )}
        </section>

        {latest_triage && (
          <section className="handoff-block">
            <h2>Latest encounter · {new Date(latest_triage.date).toLocaleString()}</h2>
            {latest_triage.level && (
              <div className={`handoff-level level-${latest_triage.level.toLowerCase()}`}>
                {latest_triage.level.replace('_', ' ')}
              </div>
            )}
            {latest_triage.chief_complaint && (
              <div className="handoff-line">
                <strong>Chief complaint:</strong> {latest_triage.chief_complaint}
              </div>
            )}
            {latest_triage.patient_facing_impression_english && (
              <div className="handoff-line">
                <strong>Impression:</strong> {latest_triage.patient_facing_impression_english}
              </div>
            )}
            {latest_triage.doctor_differential?.length > 0 && (
              <div className="handoff-list">
                <strong>Differential:</strong>
                <ul>{latest_triage.doctor_differential.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </div>
            )}
            {latest_triage.pk_ranked_differential?.length > 0 && (
              <div className="handoff-list">
                <strong>PK-context ranking:</strong>
                <ol>
                  {latest_triage.pk_ranked_differential.map((row, i) => (
                    <li key={i}>
                      {row.condition}
                      {row.prevalence_weight != null && <span className="handoff-weight"> · weight {row.prevalence_weight}</span>}
                      {row.season_note && <span className="handoff-note"> — {row.season_note}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {latest_triage.red_flags_present?.length > 0 && (
              <div className="handoff-red">
                <strong>Red flags reported:</strong> {latest_triage.red_flags_present.join(' · ')}
              </div>
            )}
            {latest_triage.unresolved_questions?.length > 0 && (
              <div className="handoff-list">
                <strong>Unresolved for you:</strong>
                <ul>{latest_triage.unresolved_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
            {latest_triage.doctor_handoff_english && (
              <div className="handoff-line handoff-sbar">
                <strong>SBAR:</strong> {latest_triage.doctor_handoff_english}
              </div>
            )}
          </section>
        )}

        {chronic_conditions?.length > 0 && (
          <section className="handoff-block">
            <h2>Chronic conditions</h2>
            <div>{chronic_conditions.join(' · ')}</div>
          </section>
        )}

        {current_medicines?.length > 0 && (
          <section className="handoff-block">
            <h2>Confirmed medicines</h2>
            <ul>
              {current_medicines.map((m, i) => (
                <li key={i}>
                  <strong>{m.name}</strong>{' '}
                  {[m.strength, m.frequency, m.duration].filter(Boolean).join(' · ')}
                  {m.source && <span className="handoff-note"> ({m.source})</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent_labs?.length > 0 && (
          <section className="handoff-block">
            <h2>Recent labs</h2>
            {recent_labs.map((lab, i) => (
              <div key={i}>
                <strong>{lab.title}</strong> — {new Date(lab.date).toLocaleDateString()}
                {lab.flagged?.length > 0 && (
                  <ul>
                    {lab.flagged.map((row, j) => (
                      <li key={j}>
                        {row.name}: <strong>{row.value}</strong>{' '}
                        {row.unit || ''}{' '}
                        {row.flag && <span className={`flag-${row.flag}`}>({row.flag})</span>}
                        {row.reference_range && <span className="handoff-note"> · ref {row.reference_range}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {lab.explanation_english && <div className="handoff-note">{lab.explanation_english}</div>}
              </div>
            ))}
          </section>
        )}

        <footer className="handoff-footer">
          <p>{notice}</p>
          <p className="handoff-note">
            Not a substitute for a doctor. Confirm findings clinically and with the patient.
          </p>
        </footer>
      </div>
    </div>
  )
}
