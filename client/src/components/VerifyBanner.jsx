import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Soft-gate nudge: the app stays fully usable, but an unverified account sees a
// slim banner inviting them to verify their number (or email).
export default function VerifyBanner() {
  const { account } = useAuth()
  const navigate = useNavigate()
  if (!account) return null

  const phonePending = !account.phone_verified
  const emailPending = account.email && !account.email_verified
  if (!phonePending && !emailPending) return null

  const what = phonePending ? 'phone number' : 'email'

  return (
    <button
      onClick={() => navigate('/verify')}
      style={{
        width: '100%',
        border: 'none',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--amber-bg, #fdf3e2)',
        color: 'var(--amber, #c47a00)',
        padding: '9px 16px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <span aria-hidden="true">🔔</span>
      <span style={{ flex: 1 }}>
        <span className="urdu" style={{ marginInlineEnd: 6 }}>اپنا نمبر تصدیق کریں</span>
        Verify your {what} to secure this account
      </span>
      <span aria-hidden="true">›</span>
    </button>
  )
}
