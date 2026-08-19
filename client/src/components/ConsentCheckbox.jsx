// Plain-language consent before saving health data / uploads.
export default function ConsentCheckbox({ checked, onChange }) {
  return (
    <label className="consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="c-ur urdu">
          میں اس مریض کے لیے یہ صحت کی معلومات محفوظ کرنے کی اجازت دیتا/دیتی ہوں۔
        </span>
        <span>
          I consent to saving this health information for this patient. Data stays in your
          account and can be deleted anytime — never used for training.
        </span>
      </span>
    </label>
  )
}
