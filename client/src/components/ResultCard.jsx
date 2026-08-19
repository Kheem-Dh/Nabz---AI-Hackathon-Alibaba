// Color-coded triage result card with practical guidance and follow-up flow.

import { useEffect, useState } from 'react'
import { levelConfig } from '../levels'

// Renders a bilingual guidance list (Urdu primary, English secondary).
function GuidanceBlock({ icon, titleUrdu, titleEn, urdu, english, tone }) {
  if (!urdu || urdu.length === 0) return null
  return (
    <div className={`guidance-block ${tone || ''}`}>
      <h4 className="guidance-title">
        <span aria-hidden="true">{icon}</span>
        <span className="urdu">{titleUrdu}</span>
        <span className="guidance-title-en">{titleEn}</span>
      </h4>
      <ul className="guidance-list">
        {urdu.map((item, i) => (
          <li key={i}>
            <span className="urdu guidance-ur" dir="rtl">{item}</span>
            {english && english[i] && (
              <span className="guidance-en">{english[i]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ResultCard({
  result,
  transcript,
  onReplay,
  speaking,
  onNew,
  onRefine,
  ttsSupported,
}) {
  const cfg = levelConfig(result.level)
  const [showWhy, setShowWhy] = useState(false)
  const [refineText, setRefineText] = useState('')

  useEffect(() => {
    setShowWhy(false)
    setRefineText('')
  }, [result])

  const hasFollowUps =
    result.follow_up_questions_urdu && result.follow_up_questions_urdu.length > 0

  function submitRefine(e) {
    e.preventDefault()
    if (refineText.trim()) onRefine(refineText.trim())
  }

  return (
    <div className={`result-card ${cfg.className}`} role="status">
      {transcript && (
        <div className="transcript-chip" dir="auto">
          <span className="transcript-label urdu">آپ نے کہا:</span>{' '}
          <span className="transcript-text">“{transcript}”</span>
        </div>
      )}

      <div className="result-icon" aria-hidden="true">
        {cfg.icon}
      </div>

      <div className="result-level-urdu urdu">{cfg.urdu}</div>
      <div className="result-level-en">{cfg.english}</div>
      <div className="result-level-sub">{cfg.sub}</div>

      <p className="advice-urdu urdu" dir="rtl">
        {result.advice_urdu}
      </p>

      <div className="advice-actions">
        <button
          type="button"
          className="replay-btn"
          onClick={onReplay}
          aria-label="Replay advice"
        >
          {speaking ? '🔊 …' : '🔊 دوبارہ سنیں'}
        </button>
      </div>
      {!ttsSupported && (
        <p className="tts-note">🔇 Voice output isn’t available in this browser.</p>
      )}

      <p className="advice-english">{result.advice_english}</p>

      {/* Practical guidance the user asked for */}
      <div className="guidance">
        <GuidanceBlock
          icon="🏠"
          titleUrdu="گھریلو علاج"
          titleEn="Home remedies"
          urdu={result.home_remedies_urdu}
          english={result.home_remedies_english}
          tone="tone-green"
        />
        <GuidanceBlock
          icon="💊"
          titleUrdu="دوا کی عمومی رہنمائی"
          titleEn="General medicine guidance"
          urdu={result.medicine_guidance_urdu}
          english={result.medicine_guidance_english}
          tone="tone-blue"
        />
        <GuidanceBlock
          icon="⚠️"
          titleUrdu="خطرے کی علامات"
          titleEn="Warning signs — seek care"
          urdu={result.warning_signs_urdu}
          english={result.warning_signs_english}
          tone="tone-red"
        />
      </div>

      {result.medicine_guidance_urdu &&
        result.medicine_guidance_urdu.length > 0 && (
          <p className="medicine-disclaimer urdu" dir="rtl">
            نوٹ: دوا کی صحیح مقدار کے لیے فارماسسٹ یا ڈاکٹر سے تصدیق کریں۔
            <span className="medicine-disclaimer-en">
              Confirm any medicine and dose with a pharmacist or doctor.
            </span>
          </p>
        )}

      {/* Follow-up questions to understand the user better */}
      {hasFollowUps && (
        <div className="followups">
          <h4 className="guidance-title">
            <span aria-hidden="true">💬</span>
            <span className="urdu">بہتر سمجھنے کے لیے چند سوال</span>
            <span className="guidance-title-en">A few follow-up questions</span>
          </h4>
          <ul className="followup-list">
            {result.follow_up_questions_urdu.map((q, i) => (
              <li key={i}>
                <span className="urdu" dir="rtl">{q}</span>
                {result.follow_up_questions_english &&
                  result.follow_up_questions_english[i] && (
                    <span className="guidance-en">
                      {result.follow_up_questions_english[i]}
                    </span>
                  )}
              </li>
            ))}
          </ul>
          <form className="refine-form" onSubmit={submitRefine}>
            <textarea
              className="refine-input urdu"
              dir="auto"
              rows={2}
              placeholder="ان سوالوں کا جواب یہاں لکھیں…"
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
            />
            <button
              type="submit"
              className="refine-btn"
              disabled={!refineText.trim()}
            >
              دوبارہ مشورہ · Update advice
            </button>
          </form>
        </div>
      )}

      {result.mock && (
        <div className="mock-badge" title="Running without a live API key">
          demo / mock mode
        </div>
      )}

      <button
        type="button"
        className="why-toggle"
        onClick={() => setShowWhy((s) => !s)}
        aria-expanded={showWhy}
      >
        {showWhy ? '▲ Why? (hide)' : '▼ Why? (for judges)'}
      </button>
      {showWhy && (
        <div className="why-body">
          <strong>Classification reason:</strong>
          <p>{result.reason_english}</p>
        </div>
      )}

      <button type="button" className="new-query-btn" onClick={onNew}>
        <span className="urdu">نئی بات</span> · New query
      </button>
    </div>
  )
}
