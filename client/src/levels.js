// Presentation config for each triage level. Colour and mark carry meaning for
// low-literacy, voice-first users.
//
// The mark is the Nabz pulse waveform drawn at three amplitudes rather than a
// platform emoji. Emoji were the wrong tool here twice over: they render as a
// different cartoon on every Android skin (Xiaomi, Realme and Infinix each
// ship their own set), and a stethoscope or a house says nothing about urgency
// to someone who cannot read the label beside it. A calm trace, a rising
// trace, and a spiking trace read as a rank at a glance, in the dark, without
// reading — which is the job this mark actually has.

export const LEVELS = {
  EMERGENCY: {
    key: 'EMERGENCY',
    className: 'level-emergency',
    urdu: 'فوری طبی مدد',
    english: 'EMERGENCY',
    sub: 'فوراً ہسپتال جائیے / Go to hospital now',
    // Violent, repeated spikes.
    pulse: 'M1 12h3l2-9 3 18 3-16 3 12 2-7 2 4h4',
  },
  DOCTOR_24H: {
    key: 'DOCTOR_24H',
    className: 'level-doctor',
    urdu: '24 گھنٹے میں ڈاکٹر سے رجوع',
    english: 'See a doctor within 24 hours',
    sub: '24 گھنٹے کے اندر ڈاکٹر سے ملیے / See a doctor within 24 hours',
    // One clear spike — something is happening, but it is not chaos.
    pulse: 'M1 12h5l3-7 3 14 3-9 2 4h6',
  },
  HOME_CARE: {
    key: 'HOME_CARE',
    className: 'level-home',
    urdu: 'گھر پر دیکھ بھال',
    english: 'Home care',
    sub: 'آرام کیجیے اور علامات پر نظر رکھیے / Rest and monitor',
    // Low, even, settled.
    pulse: 'M1 12h6l3-3 3 6 3-3h7',
  },
}

export function levelConfig(level) {
  return LEVELS[level] || LEVELS.DOCTOR_24H
}
