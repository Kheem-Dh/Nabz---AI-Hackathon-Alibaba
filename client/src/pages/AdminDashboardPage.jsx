import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAdminLogs, getAdminOverview } from '../api'
import { useAuth } from '../context/AuthContext'

function formatDuration(seconds = 0) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatDate(value, withTime = false) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PK', {
    month: 'short', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

function MetricCard({ label, value, note, tone = '' }) {
  return (
    <article className={`admin-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function ActivityChart({ series }) {
  const max = Math.max(1, ...series.map((item) => Math.max(item.active_users, item.chats)))
  return (
    <div className="admin-chart" aria-label="Daily active users and chats chart">
      <div className="admin-chart-legend"><i className="users" /> Active users <i className="chats" /> Chats</div>
      <div className="admin-chart-bars">
        {series.map((item, index) => (
          <div className="admin-chart-day" key={item.date} title={`${item.date}: ${item.active_users} active, ${item.chats} chats`}>
            <div className="admin-bar-pair">
              <i className="users" style={{ height: `${Math.max(3, item.active_users * 100 / max)}%` }} />
              <i className="chats" style={{ height: `${Math.max(3, item.chats * 100 / max)}%` }} />
            </div>
            {(index === 0 || index === series.length - 1 || index % 3 === 0) && <span>{formatDate(item.date)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const { account } = useAuth()
  const [overview, setOverview] = useState(null)
  const [logs, setLogs] = useState([])
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [nextOverview, nextLogs] = await Promise.all([
        getAdminOverview(14),
        getAdminLogs(errorsOnly, 100),
      ])
      setOverview(nextOverview)
      setLogs(nextLogs.logs || [])
      setUpdatedAt(new Date())
      setError('')
    } catch (err) {
      setError(err.status === 403 ? 'admin_access_required' : (err.message || 'dashboard_unavailable'))
    } finally {
      setLoading(false)
    }
  }, [errorsOnly])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(true), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const requestHealth = useMemo(() => {
    const endpoints = overview?.endpoint_stats || []
    const requests = endpoints.reduce((sum, item) => sum + item.requests, 0)
    const errors = endpoints.reduce((sum, item) => sum + item.errors, 0)
    return { requests, errors, rate: requests ? ((requests - errors) * 100 / requests).toFixed(1) : '100.0' }
  }, [overview])

  if (error === 'admin_access_required' || !account?.is_admin) {
    return (
      <section className="admin-denied">
        <div className="admin-lock">⌁</div>
        <span>OWNER CONSOLE</span>
        <h1>Private dashboard</h1>
        <p>This account is not on the server’s admin allowlist. Sign in with the owner email or phone configured in <code>NABZ_ADMIN_IDENTIFIERS</code>.</p>
      </section>
    )
  }

  if (loading && !overview) return <div className="admin-loading"><i /><p>Loading live product signals…</p></div>
  if (error || !overview) return <div className="notice notice-warn">Dashboard unavailable: {error}</div>

  const { engagement, recent_users: users, series } = overview
  const metrics = overview.overview
  const privacy = overview.privacy || { consent_coverage_rate: 0, audit_events_7d: 0, event_counts_7d: [] }

  return (
    <section className="admin-dashboard">
      <header className="admin-hero">
        <div>
          <span className="admin-kicker"><i /> NABZ OWNER CONSOLE</span>
          <h1>Product pulse</h1>
          <p>Live adoption, engagement, usage time and operational health—without storing clinical messages.</p>
        </div>
        <div className="admin-live">
          <span><i /> Live</span>
          <small>Updated {updatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
          <button onClick={() => load()}>Refresh data</button>
        </div>
      </header>

      <div className="admin-metrics">
        <MetricCard label="Total users" value={metrics.total_users.toLocaleString()} note={`${metrics.active_24h} active in 24 hours`} tone="primary" />
        <MetricCard label="Time in Nabz" value={formatDuration(metrics.total_active_seconds)} note={`${formatDuration(metrics.average_active_seconds_per_user)} average per user`} />
        <MetricCard label="Total chats" value={metrics.total_chats.toLocaleString()} note={`${metrics.chats_7d} started this week`} />
        <MetricCard label="Active now" value={metrics.active_now.toLocaleString()} note={`${metrics.active_7d} unique users this week`} tone="live" />
        <MetricCard label="Engagement" value={`${engagement.engagement_rate}%`} note={`${engagement.engaged_users} users started care chats`} />
        <MetricCard label="Successful requests" value={`${requestHealth.rate}%`} note={`${requestHealth.requests.toLocaleString()} tracked API calls / 7 days`} />
        <MetricCard label="Consent coverage" value={`${privacy.consent_coverage_rate}%`} note={`${privacy.audit_events_7d} privacy-safe audit events / 7 days`} />
      </div>

      <div className="admin-grid-main">
        <article className="admin-panel admin-activity-panel">
          <div className="admin-panel-head">
            <div><span>LAST 14 DAYS</span><h2>Daily activity</h2></div>
            <small>{metrics.total_messages.toLocaleString()} chat messages overall</small>
          </div>
          <ActivityChart series={series} />
        </article>

        <article className="admin-panel admin-engagement-panel">
          <div className="admin-panel-head"><div><span>QUALITY OF USE</span><h2>Engagement</h2></div></div>
          <div className="admin-ring" style={{ '--value': `${engagement.completion_rate * 3.6}deg` }}>
            <div><strong>{engagement.completion_rate}%</strong><small>chat completion</small></div>
          </div>
          <dl className="admin-stat-list">
            <div><dt>Returning users</dt><dd>{engagement.returning_users} <small>{engagement.return_rate}%</small></dd></div>
            <div><dt>Completed chats</dt><dd>{engagement.completed_chats}</dd></div>
            <div><dt>Chats / engaged user</dt><dd>{engagement.chats_per_engaged_user}</dd></div>
          </dl>
        </article>
      </div>

      <article className="admin-panel">
        <div className="admin-panel-head">
          <div><span>ACCOUNTS</span><h2>Newest users</h2></div>
          <small>Up to 25 most recent accounts</small>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>User</th><th>Joined</th><th>Verified</th><th>Profiles</th><th>Chats</th><th>Sessions</th><th>Active time</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><div className="admin-user"><b>{user.name?.slice(0, 1).toUpperCase()}</b><span><strong>{user.name}</strong><small>{user.email || user.phone}</small></span></div></td>
                  <td>{formatDate(user.joined_at)}</td>
                  <td><span className={`admin-status ${user.verified ? 'ok' : ''}`}>{user.verified ? 'Verified' : 'Pending'}</span></td>
                  <td>{user.profiles}</td><td>{user.chats}</td><td>{user.sessions}</td><td>{formatDuration(user.active_seconds)}</td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan="7" className="admin-empty">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <div className="admin-grid-lower">
        <article className="admin-panel">
          <div className="admin-panel-head"><div><span>LAST 7 DAYS</span><h2>Top API routes</h2></div><small>Volume and latency</small></div>
          <div className="admin-endpoints">
            {overview.endpoint_stats.map((item) => (
              <div key={`${item.method}-${item.path}`}>
                <b>{item.method}</b><code>{item.path}</code><span>{item.requests} calls</span><span>{item.avg_latency_ms} ms</span>
              </div>
            ))}
            {!overview.endpoint_stats.length && <p className="admin-empty">Request activity will appear here.</p>}
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-head">
            <div><span>OPERATIONS</span><h2>Request logs</h2></div>
            <label className="admin-filter"><input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} /> Errors only</label>
          </div>
          <div className="admin-log-list">
            {logs.map((log) => (
              <div key={log.id}>
                <span className={`admin-http ${log.status >= 400 ? 'bad' : ''}`}>{log.status}</span>
                <b>{log.method}</b><code>{log.path}</code><small>{log.latency_ms} ms · {formatDate(log.created_at, true)}</small>
              </div>
            ))}
            {!logs.length && <p className="admin-empty">No matching request logs.</p>}
          </div>
        </article>
      </div>

      <article className="admin-panel admin-privacy-panel">
        <div className="admin-panel-head"><div><span>PRIVACY CONTROLS</span><h2>Audit activity</h2></div><small>Aggregate event types only · no clinical content</small></div>
        <div className="admin-audit-types">
          {privacy.event_counts_7d.map((item) => <div key={item.type}><span>{item.type.replaceAll('.', ' ')}</span><strong>{item.events}</strong></div>)}
          {!privacy.event_counts_7d.length && <p className="admin-empty">Consent and clinical activity events will appear here.</p>}
        </div>
      </article>
    </section>
  )
}
