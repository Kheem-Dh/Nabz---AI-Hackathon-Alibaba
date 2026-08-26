import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSummary } from '../api'
import DoctorHandoffCard from '../components/DoctorHandoffCard'

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function SummaryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getSummary(id)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [id])

  async function share() {
    const text = data
      ? `Nabz clinical summary — ${data.patient.name}\nChief complaint: ${data.chief_complaint}\nRef: ${data.reference}`
      : ''
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Nabz doctor summary', text })
        return
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      alert('Summary copied to clipboard.')
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="app-container">
          <main className="app-main">
            <button className="back-link" onClick={() => navigate(-1)}>
              ‹ Back
            </button>
            <div className="form-error">{error}</div>
          </main>
        </div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="app-shell">
        <div className="app-container">
          <main className="app-main">
            <div className="center-state">
              <div className="spinner" />
            </div>
          </main>
        </div>
      </div>
    )
  }

  const p = data.patient
  return (
    <div className="app-shell">
      <div className="app-container">
        <main className="app-main" style={{ paddingBottom: 24 }}>
          <div className="no-print" style={{ marginBottom: 12 }}>
            <button className="back-link" onClick={() => navigate(`/profile/${id}`)}>
              ‹ پروفائل · Profile
            </button>
          </div>

          <div className="no-print" style={{ marginBottom: 12 }}>
            <DoctorHandoffCard profileId={Number(id)} />
          </div>

          <div className="summary-doc">
            <h2>Clinical Handoff Summary</h2>
            <div className="ref">
              {data.reference} · Generated {fmt(data.generated_at)}
            </div>

            <div className="summary-section">
              <h3>Patient</h3>
              <p>
                <strong>{p.name}</strong>
                {p.relation ? ` (${p.relation})` : ''} — {p.age != null ? `${p.age} yrs` : 'age n/a'},{' '}
                {p.gender || 'n/a'}
                {p.blood_group ? `, blood ${p.blood_group}` : ''}
              </p>
              {p.chronic_conditions?.length > 0 && (
                <p>Chronic: {p.chronic_conditions.join(', ')}</p>
              )}
            </div>

            <div className="summary-section">
              <h3>Chief complaint</h3>
              <p>{data.chief_complaint}</p>
            </div>

            <div className="summary-section">
              <h3>History</h3>
              <p>{data.history}</p>
            </div>

            {data.recent_triage && (
              <div className="summary-section">
                <h3>Latest triage</h3>
                <p>
                  <strong>{data.recent_triage.level}</strong>
                  {data.recent_triage.reason ? ` — ${data.recent_triage.reason}` : ''}
                </p>
                {data.recent_triage.patient_facing_impression_english && (
                  <p><strong>Impression:</strong> {data.recent_triage.patient_facing_impression_english}</p>
                )}
                {data.recent_triage.supporting_findings?.length > 0 && (
                  <div><strong>Supporting findings</strong><ul>{data.recent_triage.supporting_findings.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
                )}
                {data.recent_triage.findings_against?.length > 0 && (
                  <div><strong>Findings against / uncertainty</strong><ul>{data.recent_triage.findings_against.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
                )}
                {data.recent_triage.doctor_differential?.length > 0 && (
                  <div><strong>Clinician differential</strong><ol>{data.recent_triage.doctor_differential.map((item, index) => <li key={index}>{item}</li>)}</ol></div>
                )}
                {data.recent_triage.unresolved_questions?.length > 0 && (
                  <div><strong>Still unresolved</strong><ul>{data.recent_triage.unresolved_questions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
                )}
                {data.recent_triage.escalation_signs?.length > 0 && (
                  <div className="handoff-red"><strong>Escalate care if:</strong> {data.recent_triage.escalation_signs.join(' · ')}</div>
                )}
                {data.recent_triage.vault_context_used?.length > 0 && (
                  <p><strong>Vault context used:</strong> {data.recent_triage.vault_context_used.join(' · ')}</p>
                )}
                {data.recent_triage.doctor_handoff_english && (
                  <p><strong>Doctor-ready handoff:</strong> {data.recent_triage.doctor_handoff_english}</p>
                )}
              </div>
            )}

            <div className="summary-section">
              <h3>Current medications</h3>
              {data.current_medications.length > 0 ? (
                <ul>
                  {data.current_medications.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p>None recorded.</p>
              )}
            </div>

            <div className="summary-section">
              <h3>Allergies</h3>
              <p>{data.allergies.length > 0 ? data.allergies.join(', ') : 'None recorded.'}</p>
            </div>

            {data.recent_labs?.length > 0 && (
              <div className="summary-section">
                <h3>Recent labs</h3>
                {data.recent_labs.map((l, i) => (
                  <p key={i}>
                    <strong>{l.title}</strong>
                    {l.flagged?.length > 0
                      ? ` — flagged: ${l.flagged.map((f) => `${f.name} ${f.value}`).join(', ')}`
                      : ''}
                  </p>
                ))}
              </div>
            )}

            {data.recent_documents?.length > 0 && (
              <div className="summary-section">
                <h3>Recent Vault documents</h3>
                <ul>
                  {data.recent_documents.map((document, index) => (
                    <li key={index}>
                      <strong>{document.title}</strong> ({document.type})
                      {document.notes ? ` — ${document.notes}` : ''}
                      {document.extracted_summary ? ` — Extracted context: ${document.extracted_summary}` : ''}
                      {document.extracted_facts?.length > 0 && (
                        <ul>{document.extracted_facts.map((fact, factIndex) => <li key={factIndex}>{fact}</li>)}</ul>
                      )}
                      {document.attention_items?.length > 0 && (
                        <div className="handoff-red"><strong>Attention:</strong> {document.attention_items.join(' · ')}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.medicine_evidence?.length > 0 && (
              <div className="summary-section">
                <h3>WHO references for clinician-confirmed medicines</h3>
                {data.medicine_evidence.map((evidence) => (
                  <div key={evidence.medicine_id}>
                    <p><strong>{evidence.medicine_name}</strong> — {evidence.source_status}</p>
                    <p>{evidence.evidence_summary}</p>
                    <p className="no-print"><a href={evidence.who_source_url} target="_blank" rel="noreferrer">WHO source ↗</a></p>
                    <p><em>{evidence.safety_note}</em></p>
                  </div>
                ))}
              </div>
            )}

            <p className="summary-foot">{data.footer}</p>
          </div>

          <div className="btn-row no-print" style={{ marginTop: 16 }}>
            <button className="btn btn-outline" onClick={share}>
              📤 شیئر · Share
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              🖨 پرنٹ · Print
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
