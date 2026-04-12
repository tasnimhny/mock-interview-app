'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import './bookingstyles.css'

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

interface Timeslot {
  id: string
  tutor_id: string
  start_time: string
  end_time: string
  is_booked: boolean
  tutor_name: string
}

// Monday-first calendar grid
function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7 // convert Sun=0 → Mon=0
  const days: CalendarDay[] = []

  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false })
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true })
  }
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
  }
  return days
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function BookingCalendar() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Timeslot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const router = useRouter()

  const fetchSlots = useCallback(async (date: Date) => {
    setSlotsLoading(true)
    setSlots([])

    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)

    // 1. Get all unbooked timeslots for this date
    const { data: timeslots, error } = await supabase
      .from('timeslots')
      .select('id, tutor_id, start_time, end_time, is_booked')
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())
      .eq('is_booked', false)
      .order('start_time', { ascending: true })

    if (error || !timeslots || timeslots.length === 0) {
      setSlotsLoading(false)
      return
    }

    // 2. Get tutor names from profiles
    const tutorIds = [...new Set(timeslots.map(t => t.tutor_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', tutorIds)

    const profileMap = Object.fromEntries(
      (profiles ?? []).map(p => [p.id, p])
    )

    const enriched: Timeslot[] = timeslots.map(slot => ({
      ...slot,
      tutor_name: profileMap[slot.tutor_id]?.full_name
        ?? profileMap[slot.tutor_id]?.email
        ?? 'Unknown Tutor',
    }))

    setSlots(enriched)
    setSlotsLoading(false)
  }, [])

  useEffect(() => {
    if (selectedDate) fetchSlots(selectedDate)
  }, [selectedDate, fetchSlots])

  async function bookSlot(slot: Timeslot) {
    setBookingId(slot.id)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Insert booking
    const { error: bookingError } = await supabase.from('bookings').insert({
      user_id: user.id,
      timeslot_id: slot.id,
      status: 'confirmed',
    })

    if (bookingError) {
      alert('Booking failed: ' + bookingError.message)
      setBookingId(null)
      return
    }

    // Mark timeslot as booked
    await supabase
      .from('timeslots')
      .update({ is_booked: true })
      .eq('id', slot.id)

    setConfirmedIds(prev => new Set(prev).add(slot.id))
    // Remove from slots list
    setSlots(prev => prev.filter(s => s.id !== slot.id))
    setBookingId(null)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
    setSelectedDate(null)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setSelectedDate(null)
  }

  const calendarDays = buildCalendarDays(viewYear, viewMonth)
  const isPast = (date: Date) => {
    const d = new Date(date)
    d.setHours(23, 59, 59)
    return d < today
  }

  return (
    <div className="booking-wrapper">
      <nav className="booking-nav">
        <div className="nav-brand">MOCK INTERVIEW</div>
        <div className="nav-user">
          <span className="nav-badge">STUDENT</span>
          <button className="back-btn" onClick={() => router.push('/dashboard')}>
            ← BACK
          </button>
        </div>
      </nav>

      <main className="booking-main">
        <div className="booking-header">
          <h1>BOOK A SESSION</h1>
          <p className="booking-subtitle">Pick a date to see available tutor slots.</p>
        </div>

        <div className="booking-layout">
          {/* ---- Calendar ---- */}
          <div className="calendar-card">
            <div className="calendar-nav">
              <button className="cal-nav-btn" onClick={prevMonth}>←</button>
              <span className="cal-month-label">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button className="cal-nav-btn" onClick={nextMonth}>→</button>
            </div>

            <div className="calendar-grid">
              {DAY_LABELS.map(d => (
                <div key={d} className="cal-day-header">{d}</div>
              ))}
              {calendarDays.map((day, idx) => {
                const past = isPast(day.date)
                const isToday = isSameDay(day.date, today)
                const isSelected = selectedDate ? isSameDay(day.date, selectedDate) : false
                return (
                  <button
                    key={idx}
                    className={[
                      'cal-day',
                      !day.isCurrentMonth ? 'other-month' : '',
                      past ? 'past' : '',
                      isToday ? 'today' : '',
                      isSelected ? 'selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      if (!day.isCurrentMonth || past) return
                      setSelectedDate(day.date)
                    }}
                    disabled={!day.isCurrentMonth || past}
                  >
                    {day.date.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---- Slots panel ---- */}
          <div className="slots-card">
            {!selectedDate ? (
              <div className="slots-empty">
                <div className="slots-empty-icon">📅</div>
                <p>SELECT A DATE TO VIEW AVAILABLE SLOTS</p>
              </div>
            ) : (
              <>
                <div className="slots-header">
                  <h2>
                    {selectedDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    }).toUpperCase()}
                  </h2>
                </div>

                {slotsLoading ? (
                  <div className="slots-loading">LOADING SLOTS...</div>
                ) : slots.length === 0 ? (
                  <div className="slots-empty-inner">
                    No available slots on this day.
                  </div>
                ) : (
                  <div className="slots-list">
                    {slots.map(slot => (
                      <div key={slot.id} className="slot-item">
                        <div className="slot-time">
                          {formatTime(slot.start_time)} — {formatTime(slot.end_time)}
                        </div>
                        <div className="slot-tutor">{slot.tutor_name}</div>
                        <div className="slot-type">
                          {Math.round(
                            (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000
                          )} MIN · MOCK INTERVIEW
                        </div>

                        {confirmedIds.has(slot.id) ? (
                          <div className="slot-confirmed-label">✓ BOOKED</div>
                        ) : (
                          <button
                            className="slot-book-btn"
                            onClick={() => bookSlot(slot)}
                            disabled={bookingId === slot.id}
                          >
                            {bookingId === slot.id ? 'BOOKING...' : 'BOOK'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
