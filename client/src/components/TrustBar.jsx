// Thin strip that appears under the sticky TopBar on the main workspace.
// Establishes trust at a glance without making noise — kept small and quiet.
export default function TrustBar() {
  return (
    <div className="trust-bar" role="note" aria-label="Nabz trust and safety summary">
      <span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/></svg>
        Private vault, encrypted uploads
      </span>
      <span className="trust-sep" aria-hidden="true">•</span>
      <span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Zm5-2 3 3 6-6"/></svg>
        Powered by Alibaba Cloud Qwen
      </span>
      <span className="trust-sep" aria-hidden="true">•</span>
      <span className="trust-disclaimer">Nabz supports — never replaces — your doctor.</span>
    </div>
  )
}
