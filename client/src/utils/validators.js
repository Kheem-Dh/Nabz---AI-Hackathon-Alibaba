// Shared, deterministic field validators. Each returns `null` on success or
// a short human-readable error string suitable for inline display.

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// Accepts: 03XX-XXXXXXX, 03XXXXXXXXX, +923XXXXXXXXX, +92 3XX XXXXXXX
const PK_PHONE = /^(?:\+92|0)?3\d{2}[- ]?\d{7}$/
export function validatePkPhone(value) {
  const v = (value || '').trim().replace(/\s+/g, '')
  if (!v) return 'Enter a Pakistan phone number.'
  if (!PK_PHONE.test(v)) return 'Use format 03XX-XXXXXXX or +923XXXXXXXXX.'
  return null
}

export function normalizePkPhone(value) {
  const v = (value || '').trim().replace(/[\s-]/g, '')
  if (v.startsWith('+92')) return v
  if (v.startsWith('92') && v.length === 12) return `+${v}`
  if (v.startsWith('0') && v.length === 11) return v
  return v
}

export function validateFullName(value) {
  const v = (value || '').trim()
  if (v.length < 2) return 'Full name must be at least 2 characters.'
  if (v.length > 80) return 'Full name is too long.'
  if (!/^[\p{L}\s'.-]+$/u.test(v)) return 'Letters, spaces, hyphens and apostrophes only.'
  return null
}

export function validatePassword(value) {
  const v = value || ''
  if (v.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Za-z]/.test(v)) return 'Password needs at least one letter.'
  if (!/\d/.test(v)) return 'Password needs at least one number.'
  return null
}

export function validateEmail(value) {
  const v = (value || '').trim()
  if (!v) return null // optional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.'
  // Catch common pasted/typed endings such as gmail.combnn while still
  // allowing normal country-code and modern TLDs.
  if (/\.(?:com|net|org|edu|gov|pk)[a-z]{2,}$/i.test(v)) {
    return 'Check the email ending (for example .com or .com.pk).'
  }
  return null
}

export function validateAge(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 130) return 'Age must be between 0 and 130.'
  return null
}

export function validateDob(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Enter a valid date.'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (d > today) return 'Date of birth cannot be in the future.'
  if (d.getFullYear() < 1900) return 'Enter a realistic year (≥1900).'
  return null
}

export function validateWeight(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (Number.isNaN(n) || n < 1 || n > 300) return 'Weight must be between 1 and 300 kg.'
  return null
}

// Broad data-quality guard for young children. It catches impossible entry
// mistakes without presenting a diagnosis or a growth classification.
export function validateWeightForDob(weight, dob) {
  const baseError = validateWeight(weight)
  if (baseError || weight === '' || weight == null || !dob) return baseError
  if (validateDob(dob)) return null

  const born = new Date(`${dob}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const ageDays = Math.floor((today.getTime() - born.getTime()) / 86400000)
  const kg = Number(weight)
  let range = null
  if (ageDays <= 31) range = [1, 10, 'a newborn']
  else if (ageDays < 365) range = [1.5, 20, 'a child under 1 year']
  else if (ageDays < 730) range = [4, 30, 'a child under 2 years']
  else if (ageDays < 1826) range = [5, 60, 'a child under 5 years']

  if (range && (kg < range[0] || kg > range[1])) {
    return `That weight is not plausible for ${range[2]} (${range[0]}–${range[1]} kg entry range). Check DOB and weight.`
  }
  return null
}

export function validateBp(sys, dia) {
  const hasSys = sys !== '' && sys != null
  const hasDia = dia !== '' && dia != null
  if (!hasSys && !hasDia) return null
  if (hasSys !== hasDia) return 'Enter both systolic and diastolic values.'
  const s = Number(sys)
  const d = Number(dia)
  if (Number.isNaN(s) || Number.isNaN(d)) return 'Blood pressure must be numeric.'
  if (s < 60 || s > 260) return 'Systolic must be between 60 and 260.'
  if (d < 30 || d > 180) return 'Diastolic must be between 30 and 180.'
  if (s <= d) return 'Systolic must be greater than diastolic.'
  return null
}

export function validateBloodGroup(value) {
  if (!value) return null
  if (!BLOOD_GROUPS.includes(value)) return 'Pick a valid blood group.'
  return null
}
