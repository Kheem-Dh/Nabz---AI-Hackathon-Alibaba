// Live analysis panel — fills in as triage turns progress. This visible
// parallel analysis is a key demo moment: collected findings as chips, a
// "still checking…" line, and a calm confidence-tied progress bar.
export default function AnalysisPanel({ analysis }) {
  if (!analysis) return null
  // Progress = "assessment completeness" (how much information we've gathered),
  // NOT a diagnostic probability. Backend exposes both fields with the same
  // value; we read completeness first per the winning plan §4.5.
  const raw = analysis.completeness ?? analysis.confidence ?? 0
  const collected = analysis.collected || []
  const asked = analysis.questions_asked || 0
  // A step can be complete even when some clinical uncertainty remains. Use
  // the stronger of the model's information score and the interview journey,
  // while retaining a final review buffer before the result is produced.
  const journeyProgress = asked > 0 ? Math.min(0.85, asked / 5 * 0.85) : 0
  const pct = Math.round(Math.min(1, Math.max(0, raw, journeyProgress)) * 100)

  return (
    <div className="analysis" aria-live="polite">
      <div className="analysis-head">
        <div>
          <div className="a-title-ur urdu">نبض کا تجزیہ</div>
          <div className="a-title-en">Information gathered · Step {Math.min(asked, 5)} of about 5</div>
        </div>
        <div className="analysis-percent">{pct}%</div>
      </div>

      <div className="progress" aria-label={`assessment completeness ${pct}%`}>
        <span style={{ width: `${pct}%` }} />
      </div>

      {collected.length > 0 ? (
        <div className="collected">
          {collected.map((f, i) => (
            <div className="fact-chip" key={i}>
              <span className="f-label">{f.label_english || f.label_urdu}</span>
              <span className="f-value urdu">{f.value_urdu}</span>
              {f.value_english && (
                <span className="f-label" style={{ textTransform: 'none' }}>
                  {f.value_english}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          <span className="urdu">ابھی معلومات جمع کر رہے ہیں…</span>
        </p>
      )}

      {analysis.still_checking_urdu && (
        <div className="still-checking">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <span className="sc-ur urdu">{analysis.still_checking_urdu}</span>
            {analysis.still_checking_english && (
              <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                {analysis.still_checking_english}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
