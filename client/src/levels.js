// Presentation config for each triage level. Color + icon carry meaning for
// low-literacy, voice-first users.

export const LEVELS = {
  EMERGENCY: {
    key: 'EMERGENCY',
    className: 'level-emergency',
    urdu: 'فوری علاج',
    english: 'EMERGENCY',
    sub: 'ابھی ہسپتال جائیں / Go to hospital now',
    icon: '🚑',
  },
  DOCTOR_24H: {
    key: 'DOCTOR_24H',
    className: 'level-doctor',
    urdu: '24 گھنٹے میں ڈاکٹر',
    english: 'See a doctor within 24 hours',
    sub: 'جلد ڈاکٹر سے ملیں / Visit a doctor soon',
    icon: '🩺',
  },
  HOME_CARE: {
    key: 'HOME_CARE',
    className: 'level-home',
    urdu: 'گھر پر دیکھ بھال',
    english: 'Home care',
    sub: 'آرام کریں اور خیال رکھیں / Rest and monitor',
    icon: '🏠',
  },
}

export function levelConfig(level) {
  return LEVELS[level] || LEVELS.DOCTOR_24H
}
