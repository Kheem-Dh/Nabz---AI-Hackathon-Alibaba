import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { levelConfig } from '../levels'
import NearbyCare from './NearbyCare'

// Color-coded triage result card (RED / AMBER / GREEN by status only).
export default function TriageResult({ turn, onReplay, speaking, onNew, ttsSupported }) {
  const cfg = levelConfig(turn.level)
  const [showWhy, setShowWhy] = useState(false)
  const navigate = useNavigate()
  const isEmergency = turn.level === 'EMERGENCY'

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
            <ul className="chip-list">
              {turn.possible_causes.map((c) => <li key={c}>{c}</li>)}
            </ul>
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

      {turn.medication_options?.length > 0 && (
        <section className="medication-card">
          <div className="care-plan-head">
            <span className="care-plan-icon">💊</span>
            <div>
              <div className="urdu">دوا کی معلومات</div>
              <small>Options to discuss — Nabz does not prescribe</small>
            </div>
          </div>
          {turn.medication_options.map((opt) => (
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
                <div className="mo-safety">{opt.safety_note}</div>
              </div>
            </div>
          ))}
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
