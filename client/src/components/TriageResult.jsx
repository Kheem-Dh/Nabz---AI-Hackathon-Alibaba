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
      <div className={`result-card ${cfg.className}`} role="status">
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
          <button className="btn btn-ghost" onClick={onReplay}>
            {speaking ? '🔊 …' : '🔊 دوبارہ سنیں'}
          </button>
          <button className="btn btn-outline" onClick={() => setShowWhy((s) => !s)}>
            کیوں؟ · Why?
          </button>
        </div>
        {!ttsSupported && (
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

        {turn.mock && <span className="mock-badge">offline demo · adaptive rules, not live AI</span>}
      </div>

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
