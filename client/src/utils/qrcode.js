// QR code renderer — thin wrapper around the well-tested `qrcode` npm package.
// Returns an inline SVG string suitable for React `dangerouslySetInnerHTML`.
//
// Kept in a utils file so any component that wants a QR can import a single
// function and never touch the underlying library API.

import QRCode from 'qrcode'

const DEFAULT_OPTS = {
  errorCorrectionLevel: 'Q',
  type: 'svg',
  margin: 2,
  // Camera scanners are most reliable with opaque, high-contrast modules.
  color: { dark: '#102825', light: '#FFFFFF' },
  width: 240,
}

export async function toSvg(text, overrides = {}) {
  const opts = { ...DEFAULT_OPTS, ...overrides }
  return QRCode.toString(text, opts)
}
