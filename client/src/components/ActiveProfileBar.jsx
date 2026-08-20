import { useNavigate } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'

// "Talking about Rayan, age 6" — the winning UX detail from the plan.
// Sits above the mic on the Home screen so the wrong family member is never
// silently the subject of the next conversation.
export default function ActiveProfileBar() {
  const { active } = useProfiles()
  const navigate = useNavigate()
  if (!active) return null

  const parts = []
  if (active.age != null) parts.push(`age ${active.age}`)
  if (active.gender) parts.push(active.gender)
  const sub = parts.join(' · ')

  return (
    <button
      type="button"
      className="active-profile-bar"
      onClick={() => navigate('/vault')}
      title="Change who this is about"
    >
      <span className="apb-avatar" aria-hidden="true">
        {(active.display_name || '?').slice(0, 1).toUpperCase()}
      </span>
      <span className="apb-text">
        <span className="apb-line urdu">
          {active.display_name} کے بارے میں بات ہو رہی ہے
        </span>
        <span className="apb-line-en">
          Talking about {active.display_name}
          {sub ? ` · ${sub}` : ''}
        </span>
      </span>
      <span className="apb-cta" aria-hidden="true">↔</span>
    </button>
  )
}
