import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { levelConfig } from '../levels'
import NearbyCare from './NearbyCare'

const LIKELIHOOD_LABELS = {
  MORE_LIKELY: 'More likely',
  POSSIBLE: 'Possible',
  LESS_LIKELY: 'Less likely',
}

function normalizeCause(cause) {
  if (typeof cause === 'string') return { name_english: cause, likelihood: 'POSSIBLE' }
  const rawLikelihood = String(cause.likelihood || cause.probability_estimate || 'POSSIBLE')
    .trim().toUpperCase().replaceAll(' ', '_')
  const likelihoodAliases = {
    HIGH: 'MORE_LIKELY', LIKELY: 'MORE_LIKELY', MOST_LIKELY: 'MORE_LIKELY',
    MODERATE: 'POSSIBLE', MEDIUM: 'POSSIBLE', LOW: 'LESS_LIKELY', UNLIKELY: 'LESS_LIKELY',
  }
  return {
    ...cause,
    name_urdu: cause.name_urdu || cause.label_urdu || '',
    name_english: cause.name_english || cause.label_english || cause.name || 'Possible explanation',
    likelihood: likelihoodAliases[rawLikelihood] || rawLikelihood,
  }
}

// Color-coded triage result card (RED / AMBER / GREEN by status only).
export default function TriageResult({ turn, onReplay, speaking, onNew, onRetry, ttsSupported }) {
  const cfg = levelConfig(turn.level)
  const [showWhy, setShowWhy] = useState(false)
  const navigate = useNavigate()
  const isEmergency = turn.level === 'EMERGENCY'
  const medicationSteps = turn.medication_plan?.medication_steps || turn.medication_options || []

  async function copyHandoff() {
    if (!turn.doctor_handoff_english) return
    await navigator.clipboard?.writeText(turn.doctor_handoff_english)
  }

  return (
    <div className="stack">
      {turn.response_source === 'ai_unavailable' && (
        <div className="notice notice-warn ai-unavailable-notice" role="alert">
          <strong>AI assessment unavailable</strong>
          <span>This safety response is not an AI interpretation of the transcript.</span>
          {onRetry && (
            <button className="btn btn-primary" onClick={onRetry}>
              Retry AI assessment · دوبارہ کوشش کریں
            </button>
          )}
        </div>
      )}
      <div className={`result-card ${cfg.className}`} role="status">
        {turn.response_source === 'live_ai' && (
          <div className="ai-source-badge live_ai">✦ Live AI · transcript + patient Vault</div>
        )}
        <div className="result-icon" aria-hidden="true">
          {cfg.icon}
        </div>
        <div className="result-level-ur urdu">{cfg.urdu}</div>
        <div className="result-level-en">{cfg.english}</div>
        <div className="result-level-sub">{cfg.sub}</div>

        <p className="advice-ur urdu" dir="rtl">
          {turn.advice_urdu}
        </p>
        <p className="advice-en">{turn.advice_english}</p>

        <div className="result-actions no-print">
          {onReplay && <button className="btn btn-ghost" onClick={onReplay}>
            {speaking ? '🔊 …' : '🔊 دوبارہ سنیں'}
          </button>}
          <button className="btn btn-outline" onClick={() => setShowWhy((s) => !s)}>
            کیوں؟ · Why?
          </button>
        </div>
        {ttsSupported === false && onReplay && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            🔇 Voice output isn’t available in this browser.
          </p>
        )}

        {showWhy && (
          <div className="why-box">
            <strong>Why this level:</strong>
            <p style={{ margin: '4px 0 0' }}>{turn.reason_english}</p>
          </div>
        )}

        {turn.response_source === 'test_model' && (
          <span className="mock-badge">test model · not shown in production</span>
        )}
      </div>

      {(turn.patient_facing_impression_english || turn.possible_causes?.length > 0) && (
        <section className="impression-card">
          <div className="care-plan-head">
            <span className="care-plan-icon">🧠</span>
            <div>
              <div className="urdu">ممکنہ وجوہات</div>
              <small>Possible explanations — not a confirmed diagnosis</small>
            </div>
          </div>
          {turn.patient_facing_impression_urdu && (
            <p className="urdu impression-line" dir="rtl">
              {turn.patient_facing_impression_urdu}
            </p>
          )}
          {turn.patient_facing_impression_english && (
            <p className="impression-line">{turn.patient_facing_impression_english}</p>
          )}
          {turn.possible_causes?.length > 0 && (
            <div className="possible-cause-list">
              <p className="likelihood-note">
                Likelihood is a clinical ranking, not a diagnosis percentage. Examination may change it.
              </p>
              {turn.possible_causes.map((cause, index) => {
                const item = normalizeCause(cause)
                const likelihood = item.likelihood || 'POSSIBLE'
                return (
                  <article className="possible-cause" key={`${item.name_english}-${index}`}>
                    <div className="possible-cause-head">
                      <div>
                        {item.name_urdu && <strong className="urdu" dir="rtl">{item.name_urdu}</strong>}
                        <strong>{item.name_english}</strong>
                      </div>
                      <span className={`likelihood ${likelihood.toLowerCase()}`}>
                        {LIKELIHOOD_LABELS[likelihood] || 'Possible'}
                      </span>
                    </div>
                    {(item.what_it_is_english || item.what_it_is_urdu) && (
                      <div className="cause-explanation">
                        <em>What it is</em>
                        {item.what_it_is_urdu && <p className="urdu" dir="rtl">{item.what_it_is_urdu}</p>}
                        {item.what_it_is_english && <p>{item.what_it_is_english}</p>}
                      </div>
                    )}
                    {(item.common_reasons_english || item.common_reasons_urdu) && (
                      <div className="cause-explanation">
                        <em>How it commonly happens</em>
                        {item.common_reasons_urdu && <p className="urdu" dir="rtl">{item.common_reasons_urdu}</p>}
                        {item.common_reasons_english && <p>{item.common_reasons_english}</p>}
                      </div>
                    )}
                    {item.why_it_may_fit && <p className="cause-fit"><strong>Why it may fit:</strong> {item.why_it_may_fit}</p>}
                    {item.what_would_help_confirm && <p className="cause-confirm"><strong>What helps distinguish it:</strong> {item.what_would_help_confirm}</p>}
                  </article>
                )
              })}
            </div>
          )}
          {turn.escalation_signs?.length > 0 && (
            <div className="escalation-block">
              <strong>Get urgent care if:</strong>
              <ul>
                {turn.escalation_signs.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {(turn.medication_plan || medicationSteps.length > 0) && (
        <section className="medication-card">
          <div className="care-plan-head">
            <span className="care-plan-icon">💊</span>
            <div>
              <div className="urdu">مجوزہ دوا کا مشاورتی منصوبہ</div>
              <small>Proposed medication discussion plan — not a prescription</small>
            </div>
            {turn.medication_plan?.status && (
              <span className="plan-status">{turn.medication_plan.status.replaceAll('_', ' ')}</span>
            )}
          </div>
          {turn.medication_plan?.basis_urdu && (
            <p className="plan-basis urdu" dir="rtl">{turn.medication_plan.basis_urdu}</p>
          )}
          {turn.medication_plan?.basis_english && (
            <p className="plan-basis"><strong>Clinical basis:</strong> {turn.medication_plan.basis_english}</p>
          )}
          {medicationSteps.length === 0 && (
            <div className="notice notice-info">No new drug option passed the current safety and evidence checks.</div>
          )}
          {medicationSteps.map((opt) => (
            <div key={opt.generic_name} className="medication-option">
              <div className="mo-title">
                <strong>{opt.generic_name}</strong>
                <span className="mo-type">{opt.recommendation_type.replace(/_/g, ' ')}</span>
                {opt.prescription_required && <span className="mo-rx">Prescription only</span>}
              </div>
              <p className="mo-purpose">{opt.purpose}</p>
              <p className="mo-why">{opt.why_it_may_help}</p>
              {opt.why_it_is_relevant_to_this_patient && (
                <p className="mo-relevance">Why it fits: {opt.why_it_is_relevant_to_this_patient}</p>
              )}
              {opt.eligibility_requirements?.length > 0 && (
                <div className="mo-list">
                  <em>Only if:</em>
                  <ul>
                    {opt.eligibility_requirements.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
              {opt.avoid_if?.length > 0 && (
                <div className="mo-list mo-avoid">
                  <em>Avoid if:</em>
                  <ul>
                    {opt.avoid_if.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
              {opt.dose_guidance && <p className="mo-dose">{opt.dose_guidance}</p>}
              <div className="mo-evidence">
                <a href={opt.evidence_source_url} target="_blank" rel="noreferrer">
                  Evidence: {opt.evidence_source_title} ↗
                </a>
                {opt.fda_approval_source_url && (
                  <a href={opt.fda_approval_source_url} target="_blank" rel="noreferrer">
                    {opt.fda_approval_status} · {opt.fda_application_number} ↗
                  </a>
                )}
                {opt.dailymed_source_url && (
                  <a href={opt.dailymed_source_url} target="_blank" rel="noreferrer">
                    {opt.dailymed_source_status === 'live_dailymed' ? 'Live DailyMed label' : 'Reviewed DailyMed label cache'}
                    {' · '}{opt.dailymed_published_date} ↗
                  </a>
                )}
                {opt.availability_note && <div className="mo-safety">{opt.availability_note}</div>}
                <div className="mo-safety">{opt.safety_note}</div>
              </div>
            </div>
          ))}
          {turn.medication_plan?.follow_up && (
            <p className="plan-followup"><strong>Before use:</strong> {turn.medication_plan.follow_up}</p>
          )}
          {turn.medication_plan?.disclaimer && (
            <small className="plan-disclaimer">{turn.medication_plan.disclaimer}</small>
          )}
        </section>
      )}

      {(turn.suggestions_urdu?.length > 0 || turn.suggestions_english?.length > 0) && (
        <section className="care-plan-card">
          <div className="care-plan-head">
            <span className="care-plan-icon">✓</span>
            <div>
              <div className="urdu">ابھی کیا کریں</div>
              <small>Personalized next steps</small>
            </div>
          </div>
          <ol className="care-plan-list">
            {(turn.suggestions_english || []).map((suggestion, index) => (
              <li key={index}>
                {turn.suggestions_urdu?.[index] && <span className="urdu">{turn.suggestions_urdu[index]}</span>}
                <span>{suggestion}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {turn.exercise_suggestions_english?.length > 0 && (
        <section className="care-plan-card exercise-card">
          <div className="care-plan-head">
            <span className="care-plan-icon">↗</span>
            <div><div className="urdu">محفوظ حرکت</div><small>Gentle movement, only if comfortable</small></div>
          </div>
          {turn.exercise_suggestions_english.map((exercise, index) => (
            <p className="exercise-line" key={index}>
              {turn.exercise_suggestions_urdu?.[index] && <span className="urdu">{turn.exercise_suggestions_urdu[index]}</span>}
              <span>{exercise}</span>
            </p>
          ))}
        </section>
      )}

      {turn.doctor_handoff_english && (
        <section className="handoff-card">
          <div className="handoff-head">
            <div><strong>Doctor-ready handoff</strong><span>Built from this conversation + relevant Vault history</span></div>
            <button onClick={copyHandoff}>Copy</button>
          </div>
          <p>{turn.doctor_handoff_english}</p>
          {turn.vault_context_used?.length > 0 && (
            <div className="handoff-vault">
              {turn.vault_context_used.map((item) => <span key={item}>Vault · {item}</span>)}
            </div>
          )}
        </section>
      )}

      {isEmergency && (
        <a className="rescue-banner" href="tel:1122">
          🚑 <span className="ur urdu">ریسکیو 1122 کو کال کریں</span>
        </a>
      )}

      <NearbyCare urgency={turn.level || 'DOCTOR_24H'} />

      <div className="btn-row no-print">
        <button className="btn btn-outline" onClick={() => navigate('/clinics')}>
          📍 قریبی کلینک
        </button>
        <button className="btn btn-primary" onClick={onNew}>
          نیا سوال · New
        </button>
      </div>
    </div>
  )
}
