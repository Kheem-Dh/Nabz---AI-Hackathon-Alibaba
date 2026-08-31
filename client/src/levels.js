// Presentation config for each triage level. Color + icon carry meaning for
// low-literacy, voice-first users.

export const LEVELS = {
  EMERGENCY: {
    key: 'EMERGENCY',
    className: 'level-emergency',
    urdu: 'فوری طبی مدد',
    english: 'EMERGENCY',
    sub: 'فوراً ہسپتال جائیے / Go to hospital now',
    icon: '🚑',
  },
  DOCTOR_24H: {
    key: 'DOCTOR_24H',
    className: 'level-doctor',
    urdu: '24 گھنٹے میں ڈاکٹر سے رجوع',
    english: 'See a doctor within 24 hours',
    sub: '24 گھنٹے کے اندر ڈاکٹر سے ملیے / See a doctor within 24 hours',
    icon: '🩺',
  },
  HOME_CARE: {
    key: 'HOME_CARE',
    className: 'level-home',
    urdu: 'گھر پر دیکھ بھال',
    english: 'Home care',
    sub: 'آرام کیجیے اور علامات پر نظر رکھیے / Rest and monitor',
    icon: '🏠',
  },
}

export function levelConfig(level) {
  return LEVELS[level] || LEVELS.DOCTOR_24H
}
