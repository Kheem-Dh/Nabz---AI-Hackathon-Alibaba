/**
 * One drawn icon set, one stroke weight (1.9), one visual language.
 *
 * These exist because the app was using platform emoji to carry meaning —
 * 🔊 🎤 📎 📷 ⚠️ ✦ and others. On Android System WebView every vendor ships
 * its own emoji font, so on the Xiaomi, Realme and Infinix handsets this
 * product actually targets, the glyphs a low-literacy user navigates by were
 * the least controlled elements on the screen. They also carry no stroke
 * relationship to the Nabz pulse mark.
 *
 * Every icon here is decorative: the surrounding markup carries the label, so
 * each renders aria-hidden and adds nothing to the accessibility tree.
 */

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...S}>{children}</svg>
)

export function SpeakerIcon() {
  return <Svg><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></Svg>
}

export function StopIcon() {
  return <Svg><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
}

export function MicIcon() {
  return <Svg><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.7V21M8.5 21h7" /></Svg>
}

export function AttachIcon() {
  return <Svg><path d="m8.5 12.5 5.8-5.8a3 3 0 0 1 4.2 4.2l-7.3 7.3a5 5 0 0 1-7.1-7.1l7.1-7.1" /></Svg>
}

export function CameraIcon() {
  return <Svg><path d="M3 8.5h3.2l1.4-2.2h8.8l1.4 2.2H21v10H3Z" /><circle cx="12" cy="13" r="3.4" /></Svg>
}

export function WarnIcon() {
  return <Svg><path d="M12 2.6 3.2 18.2a1.6 1.6 0 0 0 1.4 2.4h14.8a1.6 1.6 0 0 0 1.4-2.4Z" /><path d="M12 9.2v4.4" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></Svg>
}

export function PhoneIcon() {
  return <Svg><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" /></Svg>
}

/** The Nabz pulse, used where the product marks its own voice. */
export function SparkIcon() {
  return <Svg><path d="M2 12h4.5l2.5-6 3.5 12 2.5-8 2 2H22" /></Svg>
}

export function BellIcon() {
  return <Svg><path d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.4 2 6.2H4c.8-.8 2-2.2 2-6.2Z" /><path d="M10 19.2a2.2 2.2 0 0 0 4 0" /></Svg>
}

export function PinIcon() {
  return <Svg><path d="M12 21.5s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" /><circle cx="12" cy="10.5" r="2.6" /></Svg>
}

/** The level mark: the Nabz pulse waveform at the amplitude for this urgency. */
export function LevelPulse({ d }) {
  return <Svg><path d={d} /></Svg>
}

export function UnderstandIcon() {
  return <Svg><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" /></Svg>
}

export function StepsIcon() {
  return <Svg><path d="m4 12.5 5 5L20 6.5" /></Svg>
}

export function MedicineIcon() {
  return <Svg><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m8.5 8.5 7 7" /></Svg>
}

export function DangerIcon() {
  return <Svg><path d="M12 2.6 3.2 18.2a1.6 1.6 0 0 0 1.4 2.4h14.8a1.6 1.6 0 0 0 1.4-2.4Z" /><path d="M12 9.2v4.4" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></Svg>
}
