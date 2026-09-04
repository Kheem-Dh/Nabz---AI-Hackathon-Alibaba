import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { levelConfig } from '../levels'
import NearbyCare from './NearbyCare'
import {
  DangerIcon, LevelPulse, MedicineIcon, PhoneIcon, PinIcon, SparkIcon,
  SpeakerIcon, StepsIcon, StopIcon, UnderstandIcon, WarnIcon,
} from './icons'

const LIKELIHOOD_LABELS = {
  MORE_LIKELY: 'More likely',
  POSSIBLE: 'Possible',
  LESS_LIKELY: 'Less likely',
}

/** Bilingual label. Urdu leads; the English mirror sits beneath it.
 *  PRODUCT.md locks this: density is solved with type scale, never by
 *  dropping a language. */
function Bi({ ur, en, tag: Tag = 'div', className = '' }) {
  return (
    <Tag className={`bi ${className}`}>
      <span className="urdu" lang="ur" dir="rtl">{ur}</span>
      <span className="bi-en">{en}</span>
    </Tag>
  )
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
export default function TriageResult({
  turn,
  onReplay,
  speaking,
  onNew,
  onRetry,
  ttsSupported,
  chatSlot,
  showNearby = true,
  onSave,
  guest = false,
}) {
  const cfg = levelConfig(turn.level)
  const [showWhy, setShowWhy] = useState(false)
  const navigate = useNavigate()
  const isEmergency = turn.level === 'EMERGENCY'
  const medicationSteps = turn.medication_plan?.medication_steps || turn.medication_options || []

  async function copyHandoff() {
    if (!turn.doctor_handoff_english) return
    await navigator.clipboard?.writeText(turn.doctor_handoff_english)
  }

  function continueConversation() {
    document.getElementById('continue-care-chat')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  if (guest) {
    const primaryCause = turn.possible_causes?.length
      ? normalizeCause(turn.possible_causes[0])
      : null
    const urduSteps = turn.suggestions_urdu || []
    const englishSteps = turn.suggestions_english || []
    const stepCount = Math.min(Math.max(urduSteps.length, englishSteps.length), 3)
    const treatmentIdea = turn.treatment_class_suggestions?.[0]

    return (
      <div className="guest-simple-result">
        {turn.response_source === 'ai_unavailable' && (
          <div className="notice notice-warn ai-unavailable-notice" role="alert">
            <Bi tag="strong" ur="طبی جائزہ اس وقت دستیاب نہیں" en="Assessment unavailable right now" />
            <Bi tag="span" ur="یہ علامات کا مکمل تجزیہ نہیں ہے۔ براہِ کرم قریبی ڈاکٹر سے رابطہ کیجیے۔" en="This is not a full analysis of your symptoms. Please contact a nearby doctor." />
            {onRetry && (
              <button className="btn btn-primary" onClick={onRetry}>
                <span className="urdu" lang="ur" dir="rtl">دوبارہ کوشش کریں</span>
                <span className="bi-en">Try again</span>
              </button>
            )}
          </div>
        )}
        {turn.response_source === 'safety_protocol' && (
          <div className="notice notice-warn mental-safety-notice" role="alert">
            <strong className="urdu" lang="ur" dir="rtl">آپ اکیلے نہیں ہیں — ابھی کسی قابلِ اعتماد شخص کو اپنے پاس بلائیے</strong>
            <span className="urdu" lang="ur" dir="rtl">اگر خود کو محفوظ رکھنا مشکل لگ رہا ہو تو فوراً ریسکیو 1122 یا پولیس 15 سے رابطہ کیجیے، یا قریبی ایمرجنسی میں جائیے۔</span>
            <div className="btn-row">
              <a className="btn btn-primary" href="tel:1122">
                <PhoneIcon />
                <span className="urdu" lang="ur" dir="rtl">1122 ملائیے</span>
                <span className="bi-en">Call 1122</span>
              </a>
              <a className="btn btn-outline" href="tel:15">
                <PhoneIcon />
                <span className="urdu" lang="ur" dir="rtl">15 ملائیے</span>
                <span className="bi-en">Call 15</span>
              </a>
            </div>
          </div>
        )}

        <article className={`guest-answer-sheet ${cfg.className}`} role="status">
          {/* The verdict is the one thing this product exists to deliver, so it
              leads the card at full weight. The disclaimer follows it rather
              than sitting above it — hedging before answering made the answer
              the second thing on the screen. */}
          <header className="guest-answer-status">
            <span className="guest-answer-status-icon" aria-hidden="true"><LevelPulse d={cfg.pulse} /></span>
            <div>
              <h2 className="urdu" lang="ur" dir="rtl">{cfg.urdu}</h2>
              <span className="guest-answer-status-en">{cfg.english}</span>
              <small className="bi guest-answer-disclaimer">
                <span className="urdu" lang="ur" dir="rtl">نبض کا ابتدائی جائزہ · حتمی تشخیص نہیں</span>
                <span className="bi-en">A first assessment from Nabz — not a diagnosis</span>
              </small>
            </div>
            {turn.analysis?.questions_asked >= 3 && (
              <span className="guest-question-limit">
                <span className="urdu" lang="ur" dir="rtl">3 سوال مکمل</span>
                <span className="bi-en">3 questions</span>
              </span>
            )}
          </header>

          <div className="guest-answer-main">
            <p className="guest-answer-urdu urdu" dir="rtl">{turn.advice_urdu}</p>
            <p className="guest-answer-english">{turn.advice_english}</p>
          </div>

          {(turn.patient_facing_impression_urdu || primaryCause) && (
            <section className="guest-understanding-block">
              <span className="guest-visual-icon" aria-hidden="true"><UnderstandIcon /></span>
              <div>
                <Bi tag="h3" ur="سادہ الفاظ میں" en="In plain words" />
                {turn.patient_facing_impression_urdu && (
                  <p className="urdu" lang="ur" dir="rtl">{turn.patient_facing_impression_urdu}</p>
                )}
                {turn.patient_facing_impression_english && (
                  <p className="guest-block-en">{turn.patient_facing_impression_english}</p>
                )}
                {primaryCause && (
                  <small className="bi">
                    <span className="urdu" lang="ur" dir="rtl">
                      {primaryCause.name_urdu || primaryCause.name_english} — یہ صرف ممکنہ وجہ ہے، پکی تشخیص نہیں۔
                    </span>
                    <span className="bi-en">
                      {primaryCause.name_english} — a possible explanation only, not a confirmed diagnosis.
                    </span>
                  </small>
                )}
              </div>
            </section>
          )}

          {stepCount > 0 && (
            <section className="guest-next-steps">
              <div className="guest-simple-heading">
                <span aria-hidden="true"><StepsIcon /></span>
                <div>
                  <Bi tag="h3" ur="ابھی کیا کیجیے" en="What to do now" />
                  <Bi tag="small" ur="آسان اور محفوظ اگلے قدم" en="Simple, safe next steps" />
                </div>
              </div>
              <div className="guest-step-grid">
                {Array.from({ length: stepCount }, (_, index) => (
                  <div className="guest-step" key={index}>
                    <b>{index + 1}</b>
                    <div>
                      {urduSteps[index] && <p className="urdu" dir="rtl">{urduSteps[index]}</p>}
                      {englishSteps[index] && <small>{englishSteps[index]}</small>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {treatmentIdea && (
            <section className="guest-medicine-note">
              <span className="guest-visual-icon" aria-hidden="true"><MedicineIcon /></span>
              <div>
                <Bi tag="h3" ur="دوا کے بارے میں" en="About medicine" />
                <p className="urdu" lang="ur" dir="rtl">{treatmentIdea.purpose_urdu || treatmentIdea.class_name_urdu || 'دوا لینے سے پہلے فارماسسٹ یا ڈاکٹر سے ضرور پوچھیے۔'}</p>
                {(treatmentIdea.purpose_english || treatmentIdea.class_name_english) && (
                  <p className="guest-block-en">{treatmentIdea.purpose_english || treatmentIdea.class_name_english}</p>
                )}
                {/* Safety line. It previously rendered in a fallback Naskh face
                    with clipped descenders and no English at all, so the user
                    most likely to self-medicate was the one who could not read
                    it. */}
                <small className="bi">
                  <span className="urdu" lang="ur" dir="rtl">یہ نسخہ نہیں ہے۔ دوا، مقدار اور آپ کے لیے موزوں ہونے کی تصدیق ضروری ہے۔</span>
                  <span className="bi-en">This is not a prescription. A pharmacist or doctor must confirm the medicine, the dose, and whether it suits you.</span>
                </small>
              </div>
            </section>
          )}

          {turn.escalation_signs?.length > 0 && (
            <section className="guest-danger-signs">
              <div className="guest-simple-heading">
                <span aria-hidden="true"><DangerIcon /></span>
                <div>
                  <Bi tag="h3" ur="فوراً مدد کب لینی ہے؟" en="When to get help immediately" />
                  <Bi tag="small" ur="ان علامات میں انتظار نہ کیجیے" en="Do not wait if you see these" />
                </div>
              </div>
              {/* Urdu leads, English sits beneath it. These are the signs the
                  patient watches for overnight — the highest-stakes text the
                  product produces — so it cannot ship English-only. When the
                  model omits the Urdu mirror we still render the English
                  rather than dropping the warning entirely. */}
              <ul>
                {turn.escalation_signs.slice(0, 4).map((sign, i) => {
                  const urdu = turn.escalation_signs_urdu?.[i]
                  return (
                    <li key={sign}>
                      {urdu && <span className="urdu" lang="ur" dir="rtl">{urdu}</span>}
                      <span className="guest-danger-en">{sign}</span>
                    </li>
                  )
                })}
              </ul>
              <a href="tel:1122" className="guest-danger-call">
                <PhoneIcon />
                <span className="urdu" lang="ur" dir="rtl">ایمرجنسی میں 1122 ملائیے</span>
                <span className="bi-en">Call 1122 in an emergency</span>
              </a>
            </section>
          )}

          {/* Listening is the primary action here, not a ghost afterthought:
              the questions were spoken, so a user who cannot read has been led
              this far by ear and must not lose the thread at the answer. */}
          <div className="guest-answer-actions no-print">
            {onReplay && (
              <button className="btn btn-primary guest-listen-btn" onClick={onReplay}>
                {speaking ? <StopIcon /> : <SpeakerIcon />}
                <span className="urdu" lang="ur" dir="rtl">{speaking ? 'آواز روکیں' : 'جواب سنیں'}</span>
                <span className="bi-en">{speaking ? 'Stop' : 'Listen'}</span>
              </button>
            )}
            <button className="btn btn-outline" onClick={() => setShowWhy((value) => !value)}>
              <span className="urdu" lang="ur" dir="rtl">یہ نتیجہ کیوں؟</span>
              <span className="bi-en">Why this result?</span>
            </button>
          </div>
          {showWhy && <div className="guest-why-result"><p>{turn.reason_english}</p></div>}
        </article>

        {isEmergency && (
          <a className="rescue-banner" href="tel:1122">
            <PhoneIcon />
            <span className="urdu" lang="ur" dir="rtl">ریسکیو 1122 کو کال کیجیے</span>
            <span className="bi-en">Call Rescue 1122</span>
          </a>
        )}

        {chatSlot}

        {/* The Vault offer, demoted to a quiet closing line.
            It previously closed every assessment as a full dark marketing card
            whose brightest element was the loudest pixel in the product, and it
            carried a deliberately blurred fake clinic map behind a padlock —
            obscuring clinic locations from someone who had just been told to
            see a doctor within 24 hours, with a blur that implied real data sat
            behind the paywall. Both critique runs named it as a dark pattern.
            The map is gone; if nearby clinics need an account, the line below
            says so plainly and does not tease. */}
        <section className="guest-vault-offer">
          <div>
            <Bi tag="strong" ur="اگلی بار دوبارہ بتانا نہ پڑے" en="So you don't have to explain it all again" />
            <Bi
              tag="p"
              ur="مفت والٹ میں رپورٹس، دوائیں اور پچھلی گفتگو محفوظ رہتی ہیں، اور گھر کے ہر فرد کا ریکارڈ الگ رہتا ہے۔ قریبی کلینک دیکھنے کے لیے بھی اکاؤنٹ درکار ہے۔"
              en="A free Vault keeps reports, medicines and past conversations in one place, with a separate record for each family member. An account is also needed to look up nearby clinics."
            />
          </div>
          {onSave && (
            <button className="btn btn-outline guest-vault-offer-btn" onClick={onSave}>
              <span className="urdu" lang="ur" dir="rtl">مفت والٹ بنائیے</span>
              <span className="bi-en">Create a free Vault</span>
            </button>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="stack">
      {turn.response_source === 'ai_unavailable' && (
        <div className="notice notice-warn ai-unavailable-notice" role="alert">
          <strong>AI assessment unavailable</strong>
          <span>This safety response is not an AI interpretation of the transcript.</span>
          {onRetry && (
            <button className="btn btn-primary" onClick={onRetry}>
              <span className="urdu" lang="ur" dir="rtl">دوبارہ کوشش کریں</span><span className="bi-en">Retry AI assessment</span>
            </button>
          )}
        </div>
      )}
      {turn.response_source === 'safety_protocol' && (
        <div className="notice notice-warn mental-safety-notice" role="alert">
          <Bi tag="strong" ur="آپ اکیلے نہیں ہیں" en="You deserve immediate human support" />
          <span>Stay with a trusted person. If you may not remain safe, call Rescue 1122, Police 15, or go to the nearest emergency department now.</span>
          <div className="btn-row">
            <a className="btn btn-primary" href="tel:1122">Call 1122</a>
            <a className="btn btn-outline" href="tel:15">Call 15</a>
          </div>
        </div>
      )}
      <div className={`result-card ${cfg.className}`} role="status">
        {turn.response_source === 'live_ai' && (
          <div className="ai-source-badge live_ai"><SparkIcon /> Live AI · transcript + patient Vault</div>
        )}
        {turn.response_source === 'safety_protocol' && (
          <div className="ai-source-badge safety_protocol">Safety protocol · no AI dependency</div>
        )}
        {/* The level mark is the Nabz pulse at this urgency's amplitude, not a
            platform emoji — see levels.js. */}
        <div className="result-status-row">
          <div className="result-icon" aria-hidden="true"><LevelPulse d={cfg.pulse} /></div>
          <div className="result-status-copy">
            <div className="result-level-ur urdu" lang="ur" dir="rtl">{cfg.urdu}</div>
            <div className="result-level-en">{cfg.english}</div>
          </div>
        </div>

        <p className="advice-ur urdu" lang="ur" dir="rtl">
          {turn.advice_urdu}
        </p>
        <p className="advice-en">{turn.advice_english}</p>

        {/* Listening is the primary action, as on the guest result: the
            questions were spoken, so a user who cannot read arrives here by
            ear and must not lose the thread at the answer. */}
        <div className="result-actions no-print">
          {onReplay && (
            <button className="btn btn-primary result-listen-btn" onClick={onReplay}>
              {speaking ? <StopIcon /> : <SpeakerIcon />}
              <span className="urdu" lang="ur" dir="rtl">{speaking ? 'آواز روکیں' : 'دوبارہ سنیں'}</span>
              <span className="bi-en">{speaking ? 'Stop' : 'Listen'}</span>
            </button>
          )}
          <button className="btn btn-outline" onClick={() => setShowWhy((s) => !s)}>
            <span className="urdu" lang="ur" dir="rtl">یہ نتیجہ کیوں؟</span>
            <span className="bi-en">Why this result?</span>
          </button>
          {chatSlot && (
            <button className="btn btn-outline" onClick={continueConversation}>
              <span className="urdu" lang="ur" dir="rtl">گفتگو جاری رکھیے</span>
              <span className="bi-en">Continue conversation</span>
            </button>
          )}
        </div>
        {ttsSupported === false && onReplay && (
          <p className="muted result-tts-note">
            <span className="urdu" lang="ur" dir="rtl">اس براؤزر میں آواز دستیاب نہیں ہے۔</span>
            <span className="bi-en">Voice output isn’t available in this browser.</span>
          </p>
        )}

        {showWhy && (
          <div className="why-box">
            <Bi tag="strong" ur="یہ درجہ کیوں؟" en="Why this level" />
            <p className="why-box-body">{turn.reason_english}</p>
          </div>
        )}

        {import.meta.env.DEV && turn.response_source === 'test_model' && (
          <span className="mock-badge">test model · not shown in production</span>
        )}
      </div>

      <section className="clinical-report-details always-open">
        <div className="clinical-report-summary">
          <span>
            <strong>Full assessment and care plan</strong>
            <small>
              {turn.possible_causes?.length || 0} ranked explanations · {medicationSteps.length || 0} medication options · doctor handoff{showNearby ? ' · nearby care' : ''}
            </small>
          </span>
          <span className="details-open-label">Evidence open</span>
        </div>
        <div className="clinical-report-body stack">

      {(turn.patient_facing_impression_english || turn.possible_causes?.length > 0) && (
        <section className="impression-card">
          <div className="care-plan-head">
            <span className="care-plan-icon" aria-hidden="true"><UnderstandIcon /></span>
            <div>
              <div className="urdu" lang="ur" dir="rtl">ممکنہ وجوہات</div>
              <small className="bi-en">Possible explanations — not a confirmed diagnosis</small>
            </div>
          </div>
          {turn.patient_facing_impression_urdu && (
            <p className="urdu impression-line" lang="ur" dir="rtl">
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
                        {item.name_urdu && <strong className="urdu" lang="ur" dir="rtl">{item.name_urdu}</strong>}
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
          {turn.vault_context_used?.length > 0 && (
            <div className="vault-evidence-used">
              <strong>Relevant Vault history used</strong>
              <p>These saved facts informed this assessment; they do not by themselves confirm the current cause.</p>
              <ul>
                {turn.vault_context_used.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            </div>
          )}
          {turn.escalation_signs?.length > 0 && (
            <div className="escalation-block">
              <strong>Get urgent care if:</strong>
              {/* Bilingual, as on the guest result. These are the signs the
                  patient watches for overnight — the highest-stakes text the
                  product produces — so it cannot ship English-only. */}
              <ul>
                {turn.escalation_signs.map((s, i) => {
                  const ur = turn.escalation_signs_urdu?.[i]
                  return (
                    <li key={s}>
                      {ur && <span className="urdu" lang="ur" dir="rtl">{ur}</span>}
                      <span className="guest-danger-en">{s}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {(turn.medication_plan || medicationSteps.length > 0) && (
        <section className="medication-card">
          <div className="care-plan-head">
            <span className="care-plan-icon" aria-hidden="true"><MedicineIcon /></span>
            <div>
              <div className="urdu">دوا سے متعلق عمومی رہنمائی</div>
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
          {medicationSteps.length > 0 && (
            <div className="notice notice-warn medication-confirmation">
              <strong>Confirm before first use</strong>
              <span>Ask a doctor or pharmacist to verify the exact product, formulation, labelled dose, interactions, and suitability for this patient.</span>
            </div>
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

      {turn.treatment_class_suggestions?.length > 0 && (
        <section className="tx-class-card">
          <div className="tx-class-head">
            <span className="tx-class-icon" aria-hidden="true"><MedicineIcon /></span>
            <div>
              <strong>Pharmacy-counter ideas — not a prescription</strong>
              <small>Ask a pharmacist about these classes; they will pick the right one for you.</small>
            </div>
          </div>
          {turn.treatment_class_suggestions.map((cls, i) => (
            <div className="tx-class-item" key={i}>
              <div className="tx-class-name">
                <strong>{cls.class_name_english}</strong>
                {cls.class_name_urdu && <span className="urdu tx-class-name-ur" lang="ur" dir="rtl">{cls.class_name_urdu}</span>}
              </div>
              {cls.example_generics?.length > 0 && (
                <div className="tx-class-examples">
                  Examples: {cls.example_generics.join(', ')}
                </div>
              )}
              <p className="tx-class-purpose">{cls.purpose_english}</p>
              {cls.purpose_urdu && (
                <p className="tx-class-purpose urdu" dir="rtl">{cls.purpose_urdu}</p>
              )}
              <small className="tx-class-verify"><WarnIcon /> {cls.pharmacist_verify_note_english}</small>
            </div>
          ))}
        </section>
      )}

      {(turn.suggestions_urdu?.length > 0 || turn.suggestions_english?.length > 0) && (
        <section className="care-plan-card">
          <div className="care-plan-head">
            <span className="care-plan-icon" aria-hidden="true"><StepsIcon /></span>
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
            <div><strong>Doctor-ready handoff</strong><span>{guest ? 'Built from this temporary conversation' : 'Built from this conversation + relevant Vault history'}</span></div>
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
          <PhoneIcon /><span className="urdu" lang="ur" dir="rtl">ریسکیو 1122 کو کال کریں</span><span className="bi-en">Call Rescue 1122</span>
        </a>
      )}

      {showNearby && <NearbyCare urgency={turn.level || 'DOCTOR_24H'} />}

        </div>
      </section>

      {chatSlot}

      <div className="btn-row no-print">
        {showNearby && <button className="btn btn-outline" onClick={() => navigate('/clinics')}>
          <PinIcon /><span className="urdu" lang="ur" dir="rtl">قریبی کلینک</span><span className="bi-en">Nearby clinics</span>
        </button>}
        {onSave && <button className="btn btn-primary" onClick={onSave}>
          Save future care in a private Vault
        </button>}
        <button className="btn btn-primary" onClick={onNew}>
          <span className="urdu" lang="ur" dir="rtl">نیا سوال</span><span className="bi-en">New question</span>
        </button>
      </div>
    </div>
  )
}
