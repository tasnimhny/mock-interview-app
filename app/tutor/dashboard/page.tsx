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
          } catch {
            // Ignore in read-only server component context
          }
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

  // Fetch upcoming sessions — gracefully handles missing table
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('tutor_id', user.id)
    .order('scheduled_at', { ascending: true })
    .limit(10)

  const now = new Date()
  const upcomingSessions = sessions?.filter(
    (s) => s.scheduled_at && new Date(s.scheduled_at) > now
  ) ?? []
  const completedSessions = sessions?.filter((s) => s.status === 'completed') ?? []

  // Fetch students (profiles with role 'user')
  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(10)

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Tutor'

  return (
    <div className="dashboard-wrapper">
      {/* ---- Navbar ---- */}
      <nav className="dashboard-nav">
        <div className="nav-brand">MOCK INTERVIEW</div>
        <div className="nav-user">
          <span className="nav-username">{user.email}</span>
          <span className="nav-badge">TUTOR</span>
          <SignOutButton />
        </div>
      </nav>

      {/* ---- Main Content ---- */}
      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>TUTOR DASHBOARD</h1>
          <p className="dashboard-subtitle">Welcome back, {displayName}</p>
        </div>

        {/* ---- Stats Row ---- */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{upcomingSessions.length}</div>
            <div className="stat-label">UPCOMING SESSIONS</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{students?.length ?? 0}</div>
            <div className="stat-label">TOTAL STUDENTS</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{completedSessions.length}</div>
            <div className="stat-label">COMPLETED</div>
          </div>
          <div className="stat-card accent">
            <div className="stat-number">—</div>
            <div className="stat-label">AVG RATING</div>
          </div>
        </div>

        {/* ---- Two-column section ---- */}
        <div className="dashboard-grid">
          {/* Upcoming Sessions */}
          <div className="dashboard-card">
            <div className="card-header">
              <h2>UPCOMING SESSIONS</h2>
              <button className="card-action-btn">+ SCHEDULE</button>
            </div>
            {upcomingSessions.length === 0 ? (
              <div className="empty-state">No upcoming sessions scheduled.</div>
            ) : (
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>DATE</th>
                    <th>TYPE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.student_name ?? '—'}</td>
                      <td>
                        {session.scheduled_at
                          ? new Date(session.scheduled_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td>{session.type ?? 'MOCK'}</td>
                      <td>
                        <span className={`status-badge ${session.status ?? ''}`}>
                          {(session.status ?? 'SCHEDULED').toUpperCase()}
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
              <Link href="/tutor/dashboard/availability" className="action-btn">AVAILABILITY</Link>
              <button className="action-btn">SCHEDULE SESSION</button>
              <button className="action-btn">VIEW ALL STUDENTS</button>
              <button className="action-btn">REVIEW FEEDBACK</button>
              <button className="action-btn">INTERVIEW BANK</button>
            </div>
          </div>
        </div>

        {/* ---- Students Table ---- */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>STUDENTS</h2>
          </div>
          {!students || students.length === 0 ? (
            <div className="empty-state">No students found.</div>
          ) : (
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>EMAIL</th>
                  <th>JOINED</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.full_name ?? '—'}</td>
                    <td>{student.email ?? '—'}</td>
                    <td>
                      {student.created_at
                        ? new Date(student.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
