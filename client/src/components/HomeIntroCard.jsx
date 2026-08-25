import { useState } from 'react'

// Surfaces the three new AI capabilities on the workspace so returning users
// (and hackathon judges) can see them without having to trip over each one.
// Dismissible; per-account preference lives in localStorage.

const DISMISS_KEY = 'nabz_intro_dismissed_v1'

function isDismissed(accountId) {
  try {
    const seen = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
    return Array.isArray(seen) && seen.includes(String(accountId))
  } catch {
    return false
  }
}

function markDismissed(accountId) {
  try {
    const seen = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
    const next = new Set(Array.isArray(seen) ? seen.map(String) : [])
    next.add(String(accountId))
    localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(next)))
  } catch {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([String(accountId)]))
  }
}

export default function HomeIntroCard({ account, activeProfile }) {
  const [hidden, setHidden] = useState(() => (account?.id ? isDismissed(account.id) : false))
  if (hidden) return null

  const name = activeProfile?.display_name || account?.full_name || 'there'

  function dismiss() {
    if (account?.id) markDismissed(account.id)
    setHidden(true)
  }

  return (
    <section className="home-intro" role="region" aria-label="What is new">
      <button
        type="button"
        className="home-intro-close"
        onClick={dismiss}
        aria-label="Dismiss what is new"
      >
        ×
      </button>
      <div className="home-intro-kicker">
        <span className="home-intro-badge">NEW · نبض</span>
        <span>Three ways Nabz got smarter for {name}</span>
      </div>
      <div className="home-intro-grid">
        <article className="home-intro-tile">
          <div className="home-intro-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm-7 8a7 7 0 0 0 14 0M12 19v3" /></svg>
          </div>
          <h3>Urdu voice — everywhere</h3>
          <p>Speak in Urdu on any browser. Cloud transcription via Qwen3.5-Omni works in Firefox, Safari, and in-app browsers too.</p>
        </article>
        <article className="home-intro-tile">
          <div className="home-intro-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h4l2-2h4l2 2h4v12H4V7Zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /></svg>
          </div>
          <h3>Snap a photo, mid-chat</h3>
          <p>Attach a rash, injury, or lab page. Nabz extracts visible features and safety flags, and feeds them into the next question.</p>
        </article>
        <article className="home-intro-tile">
          <div className="home-intro-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10m-10 6h16M18 10l3 3-3 3" /></svg>
          </div>
          <h3>Remembers your visits</h3>
          <p>When a complaint comes back, Nabz asks whether it's the same as last time — no starting over. Private to your account.</p>
        </article>
      </div>
      <div className="home-intro-actions">
        <span className="home-intro-hint">Tap the microphone below to try Urdu voice now.</span>
      </div>
    </section>
  )
}
