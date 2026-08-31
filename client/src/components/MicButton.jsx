// Large circular mic button. Pulses while listening.
export default function MicButton({ listening, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`mic-button ${listening ? 'listening' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? 'Finish speaking · بولنا مکمل کیجیے' : 'Start speaking · بولنا شروع کیجیے'}
    >
      <span className="mic-icon" aria-hidden="true">
        {listening ? (
          <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7" /></svg>
        )}
      </span>
      <span className="mic-label" lang="ur" dir="rtl">{listening ? 'مکمل کیجیے' : 'بولیے'}</span>
    </button>
  )
}
