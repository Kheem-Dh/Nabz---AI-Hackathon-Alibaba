import { useNavigate } from 'react-router-dom'
import { useLocationPref } from '../context/LocationContext'

// Persistent header chip showing the user's confirmed care location.
// Tapping it goes back to the location setup screen.
export default function LocationChip({ compact = false }) {
  const navigate = useNavigate()
  const { preference, fresh } = useLocationPref()

  if (!preference) {
    return (
      <button
        type="button"
        className="loc-chip loc-chip-empty"
        onClick={() => navigate('/location')}
        title="Set location"
      >
        <span aria-hidden="true">📍</span>
        <span>{compact ? 'Set location' : 'Set your location'}</span>
      </button>
    )
  }

  const label = preference.city || preference.label || 'Location'
  return (
    <button
      type="button"
      className={`loc-chip${fresh ? '' : ' loc-chip-stale'}`}
      onClick={() => navigate('/location')}
      title={preference.label}
    >
      <span aria-hidden="true">📍</span>
      <span className="loc-chip-text">{label}</span>
      {!fresh && <span className="loc-chip-dot" aria-label="Not fresh" />}
    </button>
  )
}
