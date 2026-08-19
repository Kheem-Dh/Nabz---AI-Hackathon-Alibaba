// Nearby clinics list. Each card has a tel: link (when known) and a Google
// Maps directions button. Results are driven by the user's selected city.

function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}`
}

export default function ClinicList({ clinics, city }) {
  if (!clinics || clinics.length === 0) return null
  return (
    <section className="clinics">
      <h2 className="clinics-title">
        <span className="urdu">قریبی کلینک</span>
        <span className="clinics-title-en">
          {city ? `Nearby — ${city}` : 'Nearby Clinics'}
        </span>
      </h2>
      <div className="clinic-grid">
        {clinics.map((c, i) => (
          <div className="clinic-card" key={`${c.name}-${i}`}>
            <div className="clinic-name">{c.name}</div>
            <div className="clinic-meta">
              {c.area}
              {c.city ? `, ${c.city}` : ''}
            </div>
            <div className="clinic-actions">
              {c.phone ? (
                <a
                  className="clinic-phone"
                  href={`tel:${c.phone.replace(/\s/g, '')}`}
                >
                  📞 {c.phone}
                </a>
              ) : (
                <span className="clinic-phone clinic-phone-muted">
                  📞 —
                </span>
              )}
              <a
                className="clinic-directions"
                href={mapsUrl(c.maps_query)}
                target="_blank"
                rel="noopener noreferrer"
              >
                📍 Directions
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
