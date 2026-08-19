// Large circular mic button. Pulses while listening.
export default function MicButton({ listening, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`mic-button ${listening ? 'listening' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? 'Stop listening' : 'Start speaking'}
    >
      <span className="mic-icon" aria-hidden="true">
        {listening ? '⏹' : '🎤'}
      </span>
      <span className="mic-label">{listening ? 'سن رہے ہیں…' : 'بولیں'}</span>
    </button>
  )
}
