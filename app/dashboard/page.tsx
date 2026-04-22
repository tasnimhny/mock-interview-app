import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import UserSignOutButton from './UserSignOutButton'
import './dashboardstyles.css'

export default async function UserDashboard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* read-only in server component */ }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'tutor') redirect('/tutor/dashboard')

  // Fetch bookings with timeslot details
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, created_at, timeslots(id, start_time, end_time, tutor_id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  type SlotData = { id: string; start_time: string; end_time: string; tutor_id: string }

  function getSlot(b: { timeslots: unknown }): SlotData | null {
    const s = b.timeslots as unknown as SlotData | SlotData[] | null
    if (!s) return null
    return Array.isArray(s) ? (s[0] ?? null) : s
  }

  // Get tutor names for all bookings
  const tutorIds = [
    ...new Set(
      (bookings ?? []).map((b) => getSlot(b)?.tutor_id).filter(Boolean) as string[]
    ),
  ]

  const { data: tutors } = tutorIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, email').in('id', tutorIds)
    : { data: [] }

  const tutorMap = Object.fromEntries(
    (tutors ?? []).map((t) => [t.id, t.full_name ?? t.email ?? 'Unknown Tutor'])
  )

  const now = new Date()

  const upcoming = (bookings ?? []).filter((b) => {
    const slot = getSlot(b)
    return slot && new Date(slot.start_time) > now && b.status !== 'cancelled'
  })

  const past = (bookings ?? []).filter((b) => {
    const slot = getSlot(b)
    return slot && new Date(slot.start_time) <= now
  })

  const nextSession = getSlot(upcoming[0] ?? { timeslots: null })

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'there'

  function formatDateTime(ts: string) {
    return new Date(ts).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="dashboard-wrapper">
      {/* ---- Navbar ---- */}
      <nav className="dashboard-nav">
        <div className="nav-brand">MOCK INTERVIEW</div>
        <div className="nav-user">
          <span className="nav-username">{user.email}</span>
          <span className="nav-badge">STUDENT</span>
          <UserSignOutButton />
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>DASHBOARD</h1>
          <p className="dashboard-subtitle">Welcome back, {displayName}</p>
        </div>

        {/* ---- Stats ---- */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{upcoming.length}</div>
            <div className="stat-label">UPCOMING</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{past.length}</div>
            <div className="stat-label">COMPLETED</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{(bookings ?? []).length}</div>
            <div className="stat-label">TOTAL BOOKED</div>
          </div>
          <div className="stat-card accent">
            <div className="stat-number">
              {nextSession
                ? new Date(nextSession.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'}
            </div>
            <div className="stat-label">NEXT SESSION</div>
          </div>
        </div>

        {/* ---- Book CTA ---- */}
        <Link href="/dashboard/book" className="book-cta">
          <span className="book-cta-text">+ BOOK A NEW SESSION</span>
          <span className="book-cta-sub">Browse available tutor slots →</span>
        </Link>

        {/* ---- Upcoming bookings ---- */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>UPCOMING SESSIONS</h2>
            <Link href="/dashboard/book" className="card-action-btn">+ BOOK</Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="empty-state">
              No upcoming sessions.{' '}
              <Link href="/dashboard/book" className="inline-link">Book one now →</Link>
            </div>
          ) : (
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>DATE &amp; TIME</th>
                  <th>TUTOR</th>
                  <th>DURATION</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((booking) => {
                  const slot = getSlot(booking)
                  const durationMin = slot
                    ? Math.round((new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000)
                    : 60
                  return (
                    <tr key={booking.id}>
                      <td>{slot ? formatDateTime(slot.start_time) : '—'}</td>
                      <td>{slot ? (tutorMap[slot.tutor_id] ?? '—') : '—'}</td>
                      <td>{durationMin} MIN</td>
                      <td>
                        <span className={`status-badge ${booking.status ?? 'confirmed'}`}>
                          {(booking.status ?? 'CONFIRMED').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ---- Past sessions ---- */}
        {past.length > 0 && (
          <div className="dashboard-card">
            <div className="card-header">
              <h2>PAST SESSIONS</h2>
            </div>
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>DATE &amp; TIME</th>
                  <th>TUTOR</th>
                  <th>DURATION</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {past.map((booking) => {
                  const slot = getSlot(booking)
                  const durationMin = slot
                    ? Math.round((new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000)
                    : 60
                  return (
                    <tr key={booking.id}>
                      <td>{slot ? formatDateTime(slot.start_time) : '—'}</td>
                      <td>{slot ? (tutorMap[slot.tutor_id] ?? '—') : '—'}</td>
                      <td>{durationMin} MIN</td>
                      <td>
                        <span className={`status-badge ${booking.status ?? 'confirmed'}`}>
                          {(booking.status ?? 'CONFIRMED').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
