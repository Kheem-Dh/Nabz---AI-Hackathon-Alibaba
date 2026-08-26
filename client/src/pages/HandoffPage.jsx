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
  const { patient, chronic_conditions, allergies, current_medicines, latest_triage, recent_labs, recent_documents, notice } = state.data || {}

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
            {latest_triage.possible_causes?.length > 0 && (
              <div className="handoff-list">
                <strong>Ranked explanations (not confirmed diagnoses):</strong>
                <ol>
                  {latest_triage.possible_causes.map((cause, i) => (
                    <li key={`${cause.name_english || cause.name || 'cause'}-${i}`}>
                      <strong>{cause.name_english || cause.name || 'Possible explanation'}</strong>
                      {cause.likelihood && ` · ${String(cause.likelihood).replaceAll('_', ' ').toLowerCase()}`}
                      {cause.why_it_may_fit && <div className="handoff-note">Why it may fit: {cause.why_it_may_fit}</div>}
                      {cause.what_would_help_confirm && <div className="handoff-note">To distinguish: {cause.what_would_help_confirm}</div>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {latest_triage.doctor_differential?.length > 0 && (
              <div className="handoff-list">
                <strong>Differential:</strong>
                <ul>{latest_triage.doctor_differential.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </div>
            )}
            {latest_triage.supporting_findings?.length > 0 && (
              <div className="handoff-list">
                <strong>Supporting findings:</strong>
                <ul>{latest_triage.supporting_findings.map((finding, i) => <li key={i}>{finding}</li>)}</ul>
              </div>
            )}
            {latest_triage.findings_against?.length > 0 && (
              <div className="handoff-list">
                <strong>Findings against / uncertainty:</strong>
                <ul>{latest_triage.findings_against.map((finding, i) => <li key={i}>{finding}</li>)}</ul>
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
            {latest_triage.escalation_signs?.length > 0 && (
              <div className="handoff-red">
                <strong>Escalate if:</strong> {latest_triage.escalation_signs.join(' · ')}
              </div>
            )}
            {latest_triage.vault_context_used?.length > 0 && (
              <div className="handoff-list handoff-vault-evidence">
                <strong>Vault facts used in this assessment:</strong>
                <ul>{latest_triage.vault_context_used.map((fact, i) => <li key={i}>{fact}</li>)}</ul>
              </div>
            )}
            {latest_triage.doctor_handoff_english && (
              <div className="handoff-line handoff-sbar">
                <strong>SBAR:</strong> {latest_triage.doctor_handoff_english}
              </div>
            )}
            {latest_triage.medication_options?.length > 0 && (
              <div className="handoff-list">
                <strong>Evidence-checked symptom-relief options (not prescriptions):</strong>
                <ul>
                  {latest_triage.medication_options.map((option, i) => (
                    <li key={i}>
                      <strong>{option.generic_name}</strong>
                      {option.purpose ? ` — ${option.purpose}` : ''}
                      {option.safety_note && <div className="handoff-note">{option.safety_note}</div>}
                      {option.dailymed_source_url && (
                        <a href={option.dailymed_source_url} target="_blank" rel="noreferrer">DailyMed label ↗</a>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="handoff-note">Confirm the exact product, formulation, label directions, interactions and patient suitability before use.</div>
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

        {recent_documents?.length > 0 && (
          <section className="handoff-block">
            <h2>Relevant Vault documents</h2>
            {recent_documents.map((document, i) => (
              <article className="handoff-document" key={`${document.title}-${i}`}>
                <strong>{document.title}</strong>
                <span className="handoff-note"> · {document.type} · {new Date(document.date).toLocaleDateString()}</span>
                {document.patient_notes && <p><strong>Patient note:</strong> {document.patient_notes}</p>}
                {document.extracted_summary && <p><strong>Extracted summary:</strong> {document.extracted_summary}</p>}
                {document.extracted_facts?.length > 0 && (
                  <ul>{document.extracted_facts.map((fact, j) => <li key={j}>{fact}</li>)}</ul>
                )}
                {document.attention_items?.length > 0 && (
                  <div className="handoff-red"><strong>Attention:</strong> {document.attention_items.join(' · ')}</div>
                )}
              </article>
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
