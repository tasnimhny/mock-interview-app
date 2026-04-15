import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignOutButton from './SignOutButton'
import './tutordashboardstyles.css'

export default async function TutorDashboard() {
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

  if (profile?.role !== 'tutor') redirect('/dashboard')

  const now = new Date().toISOString()

  // All booked timeslots for this tutor
  const { data: bookedSlots } = await supabase
    .from('timeslots')
    .select('id, start_time, end_time')
    .eq('tutor_id', user.id)
    .eq('is_booked', true)
    .order('start_time', { ascending: true })

  // Get the bookings for those slots (to find student IDs)
  const bookedSlotIds = (bookedSlots ?? []).map(s => s.id)
  const { data: bookings } = bookedSlotIds.length > 0
    ? await supabase
        .from('bookings')
        .select('id, user_id, timeslot_id, status')
        .in('timeslot_id', bookedSlotIds)
    : { data: [] }

  // Get student profiles
  const studentIds = [...new Set((bookings ?? []).map(b => b.user_id).filter(Boolean))]
  const { data: students } = studentIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds)
    : { data: [] }

  const studentMap = Object.fromEntries(
    (students ?? []).map(s => [s.id, s.full_name ?? s.email ?? 'Unknown'])
  )

  // Merge slot + booking + student into one list
  const bookingMap = Object.fromEntries(
    (bookings ?? []).map(b => [b.timeslot_id, b])
  )

  const allBooked = (bookedSlots ?? []).map(slot => ({
    ...slot,
    booking: bookingMap[slot.id] ?? null,
    studentName: bookingMap[slot.id]
      ? (studentMap[bookingMap[slot.id].user_id] ?? '—')
      : '—',
    status: bookingMap[slot.id]?.status ?? 'confirmed',
  }))

  const upcomingBooked = allBooked.filter(s => s.start_time > now)
  const pastBooked = allBooked.filter(s => s.start_time <= now)

  // Available (not yet booked) upcoming slots count
  const { count: availableCount } = await supabase
    .from('timeslots')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', user.id)
    .eq('is_booked', false)
    .gte('start_time', now)

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Tutor'

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

  function durationMins(start: string, end: string) {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  }

  return (
    <div className="dashboard-wrapper">
      <nav className="dashboard-nav">
        <div className="nav-brand">MOCK INTERVIEW</div>
        <div className="nav-user">
          <span className="nav-username">{user.email}</span>
          <span className="nav-badge">TUTOR</span>
          <SignOutButton />
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>TUTOR DASHBOARD</h1>
          <p className="dashboard-subtitle">Welcome back, {displayName}</p>
        </div>

        {/* ---- Stats ---- */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{upcomingBooked.length}</div>
            <div className="stat-label">UPCOMING BOOKINGS</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{pastBooked.length}</div>
            <div className="stat-label">COMPLETED</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{availableCount ?? 0}</div>
            <div className="stat-label">OPEN SLOTS</div>
          </div>
          <div className="stat-card accent">
            <div className="stat-number">{allBooked.length}</div>
            <div className="stat-label">TOTAL BOOKED</div>
          </div>
        </div>

        {/* ---- Two-column section ---- */}
        <div className="dashboard-grid">
          {/* Upcoming booked sessions */}
          <div className="dashboard-card">
            <div className="card-header">
              <h2>UPCOMING BOOKINGS</h2>
              <Link href="/tutor/dashboard/availability" className="card-action-btn">
                + ADD SLOTS
              </Link>
            </div>

            {upcomingBooked.length === 0 ? (
              <div className="empty-state">No upcoming bookings yet.</div>
            ) : (
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>DATE &amp; TIME</th>
                    <th>DURATION</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingBooked.map(slot => (
                    <tr key={slot.id}>
                      <td>{slot.studentName}</td>
                      <td>{formatDateTime(slot.start_time)}</td>
                      <td>{durationMins(slot.start_time, slot.end_time)} MIN</td>
                      <td>
                        <span className={`status-badge ${slot.status}`}>
                          {slot.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Quick Actions */}
          <div className="dashboard-card">
            <div className="card-header">
              <h2>QUICK ACTIONS</h2>
            </div>
            <div className="actions-list">
              <Link href="/tutor/dashboard/availability" className="action-btn">
                MANAGE AVAILABILITY
              </Link>
              <button className="action-btn">VIEW ALL STUDENTS</button>
              <button className="action-btn">REVIEW FEEDBACK</button>
              <button className="action-btn">INTERVIEW BANK</button>
            </div>
          </div>
        </div>

        {/* ---- Past sessions ---- */}
        {pastBooked.length > 0 && (
          <div className="dashboard-card">
            <div className="card-header">
              <h2>PAST SESSIONS</h2>
            </div>
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>DATE &amp; TIME</th>
                  <th>DURATION</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {pastBooked.map(slot => (
                  <tr key={slot.id}>
                    <td>{slot.studentName}</td>
                    <td>{formatDateTime(slot.start_time)}</td>
                    <td>{durationMins(slot.start_time, slot.end_time)} MIN</td>
                    <td>
                      <span className={`status-badge ${slot.status}`}>
                        {slot.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
