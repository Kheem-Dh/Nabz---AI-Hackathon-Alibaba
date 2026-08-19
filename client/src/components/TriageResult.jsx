import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { levelConfig } from '../levels'

// Color-coded triage result card (RED / AMBER / GREEN by status only).
export default function TriageResult({ turn, onReplay, speaking, onNew, ttsSupported }) {
  const cfg = levelConfig(turn.level)
  const [showWhy, setShowWhy] = useState(false)
  const navigate = useNavigate()
  const isEmergency = turn.level === 'EMERGENCY'

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

        {turn.mock && <span className="mock-badge">demo / mock mode</span>}
      </div>

      {isEmergency && (
        <a className="rescue-banner" href="tel:1122">
          🚑 <span className="ur urdu">ریسکیو 1122 کو کال کریں</span>
        </a>
      )}

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
