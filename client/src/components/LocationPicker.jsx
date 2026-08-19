// Province → city picker. Emits {province, city} upward and persists via App.

import { PROVINCES, citiesFor } from '../pakistan'

export default function LocationPicker({ province, city, onChange, compact }) {
  const cities = citiesFor(province)

  function setProvince(p) {
    // Reset city when province changes.
    onChange({ province: p, city: '' })
  }

  function setCity(c) {
    onChange({ province, city: c })
  }

  return (
    <div className={`location-picker ${compact ? 'compact' : ''}`}>
      <div className="location-row">
        <label className="location-label" htmlFor="province-select">
          <span className="urdu">صوبہ</span>
          <span className="location-label-en">Province</span>
        </label>
        <select
          id="province-select"
          className="location-select"
          value={province}
          onChange={(e) => setProvince(e.target.value)}
        >
          <option value="">— منتخب کریں / Select —</option>
          {PROVINCES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.urdu} · {p.key}
            </option>
          ))}
        </select>
      </div>

      <div className="location-row">
        <label className="location-label" htmlFor="city-select">
          <span className="urdu">شہر</span>
          <span className="location-label-en">City</span>
        </label>
        <select
          id="city-select"
          className="location-select"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          disabled={!province}
        >
          <option value="">
            {province ? '— شہر منتخب کریں / Select city —' : '— پہلے صوبہ چنیں —'}
          </option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
