import { useNavigate } from 'react-router-dom'

export default function PrivacyPage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ واپس · Back
      </button>
      <div className="section-title">
        <span className="ur urdu">پرائیویسی اور رضامندی</span>
        <span className="en">Privacy & consent</span>
      </div>

      <div className="card">
        <p className="advice-ur urdu" dir="rtl" style={{ margin: 0 }}>
          آپ کا ڈیٹا آپ کا ہے۔ نبض آپ کی صحت کی معلومات صرف آپ کی مدد کے لیے محفوظ کرتا ہے — بیچنے،
          شیئر کرنے یا AI ٹریننگ کے لیے نہیں۔
        </p>
        <p className="advice-en" style={{ marginTop: 10 }}>
          Your data is yours. Nabz stores health information only to help you and your family.
        </p>
      </div>

      <div className="card">
        {[
          ['🔒', 'آپ کی معلومات صرف آپ کے اکاؤنٹ سے جُڑی ہیں۔', 'Tied to your account only.'],
          ['👨‍👩‍👧', 'ہر فرد کا ریکارڈ الگ رہتا ہے۔', 'Each family member is kept separate.'],
          ['🚫', 'ڈیٹا AI ماڈل کی ٹریننگ کے لیے استعمال نہیں ہوتا۔', 'Never used to train AI models.'],
          ['✅', 'کچھ محفوظ کرنے سے پہلے آپ کی اجازت لی جاتی ہے۔', 'Consent is asked before saving.'],
          ['🗑️', 'آپ جب چاہیں اپنا ریکارڈ حذف کر سکتے ہیں۔', 'Delete your record anytime.'],
          ['🔐', 'پاس ورڈ صرف hash کی صورت میں محفوظ ہوتا ہے۔', 'Passwords are stored only as a hash.'],
        ].map(([ico, ur, en], i) => (
          <div className="med-item" key={i}>
            <span className="m-ico">{ico}</span>
            <div>
              <div className="urdu" style={{ fontSize: 15 }} dir="rtl">
                {ur}
              </div>
              <div className="m-meta">{en}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="notice notice-warn">
        <span className="ur urdu">
          یہ ایک ہیکاتھون ڈیمو ہے — اصل طبّی ریکارڈ سسٹم کے لیے مزید حفاظتی اقدامات درکار ہیں۔
        </span>
        This is a hackathon/demo build — not production-grade medical-record infrastructure.
      </div>
    </div>
  )
}
