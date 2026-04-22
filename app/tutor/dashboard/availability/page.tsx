'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import './availabilitystyles.css'

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Hour slots shown in the grid
const HOUR_SLOTS = [
  { label: '8:00 AM',  start: '08:00', end: '09:00' },
  { label: '9:00 AM',  start: '09:00', end: '10:00' },
  { label: '10:00 AM', start: '10:00', end: '11:00' },
  { label: '11:00 AM', start: '11:00', end: '12:00' },
  { label: '12:00 PM', start: '12:00', end: '13:00' },
  { label: '1:00 PM',  start: '13:00', end: '14:00' },
  { label: '2:00 PM',  start: '14:00', end: '15:00' },
  { label: '3:00 PM',  start: '15:00', end: '16:00' },
  { label: '4:00 PM',  start: '16:00', end: '17:00' },
  { label: '5:00 PM',  start: '17:00', end: '18:00' },
  { label: '6:00 PM',  start: '18:00', end: '19:00' },
  { label: '7:00 PM',  start: '19:00', end: '20:00' },
]

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

interface ExistingSlot {
  id: string
  start_time: string
  is_booked: boolean
}

function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7
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

function toDateStr(date: Date) {
  return date.toISOString().split('T')[0]
}

export default function TutorAvailability() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // start times that are currently toggled ON in the UI
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  // existing DB rows for the selected day { start -> { id, is_booked } }
  const [existingSlots, setExistingSlots] = useState<Map<string, ExistingSlot>>(new Map())

  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [daysWithSlots, setDaysWithSlots] = useState<Set<string>>(new Set())
  const router = useRouter()

  const fetchMonthDots = useCallback(async (year: number, month: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const start = new Date(year, month, 1).toISOString()
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const { data } = await supabase
      .from('timeslots')
      .select('start_time')
      .eq('tutor_id', user.id)
      .gte('start_time', start)
      .lte('start_time', end)
    setDaysWithSlots(new Set((data ?? []).map(s => toDateStr(new Date(s.start_time)))))
  }, [])

  const fetchSlotsForDay = useCallback(async (date: Date) => {
    setLoadingSlots(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const start = new Date(date); start.setHours(0, 0, 0, 0)
    const end = new Date(date); end.setHours(23, 59, 59, 999)

    const { data } = await supabase
      .from('timeslots')
      .select('id, start_time, is_booked')
      .eq('tutor_id', user.id)
      .gte('start_time', start.toISOString())
      .lte('start_time', end.toISOString())

    // Map "HH:MM" -> slot info
    const map = new Map<string, ExistingSlot>()
    ;(data ?? []).forEach(row => {
      const hhmm = new Date(row.start_time).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
      map.set(hhmm, row)
    })

    setExistingSlots(map)
    // Pre-select all existing slots
    setSelectedSlots(new Set(map.keys()))
    setLoadingSlots(false)
  }, [router])

  useEffect(() => { fetchMonthDots(viewYear, viewMonth) }, [viewYear, viewMonth, fetchMonthDots])
  useEffect(() => { if (selectedDate) fetchSlotsForDay(selectedDate) }, [selectedDate, fetchSlotsForDay])

  function toggleSlot(startHHMM: string) {
    // Can't toggle a booked slot
    if (existingSlots.get(startHHMM)?.is_booked) return
    setSelectedSlots(prev => {
      const next = new Set(prev)
      if (next.has(startHHMM)) next.delete(startHHMM)
      else next.add(startHHMM)
      return next
    })
  }

  async function saveSlots() {
    if (!selectedDate) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const dateStr = toDateStr(selectedDate)

    // Work out what to add and what to remove
    const toAdd: typeof HOUR_SLOTS = []
    const toRemove: string[] = [] // ids

    for (const slot of HOUR_SLOTS) {
      const isSelected = selectedSlots.has(slot.start)
      const existing = existingSlots.get(slot.start)

      if (isSelected && !existing) {
        toAdd.push(slot)
      } else if (!isSelected && existing && !existing.is_booked) {
        toRemove.push(existing.id)
      }
    }

    const inserts = toAdd.map(slot => ({
      tutor_id: user.id,
      start_time: new Date(`${dateStr}T${slot.start}:00`).toISOString(),
      end_time: new Date(`${dateStr}T${slot.end}:00`).toISOString(),
      is_booked: false,
    }))

    const [insertResult, deleteResult] = await Promise.all([
      inserts.length > 0
        ? supabase.from('timeslots').insert(inserts)
        : Promise.resolve({ error: null }),
      toRemove.length > 0
        ? supabase.from('timeslots').delete().in('id', toRemove)
        : Promise.resolve({ error: null }),
    ])

    if (insertResult.error) alert('Error saving: ' + insertResult.error.message)
    else if (deleteResult.error) alert('Error saving: ' + deleteResult.error.message)
    else {
      await fetchSlotsForDay(selectedDate)
      await fetchMonthDots(viewYear, viewMonth)
    }

    setSaving(false)
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
    const d = new Date(date); d.setHours(23, 59, 59)
    return d < today
  }

  const bookedSlots = new Set(
    [...existingSlots.entries()].filter(([, v]) => v.is_booked).map(([k]) => k)
  )

  return (
    <div className="avail-wrapper">
      <nav className="dashboard-nav">
        <div className="nav-brand">MOCK INTERVIEW</div>
        <div className="nav-user">
          <span className="nav-badge">TUTOR</span>
          <button className="signout-btn" onClick={() => router.push('/tutor/dashboard')}>
            ← BACK
          </button>
        </div>
      </nav>

      <main className="avail-main">
        <div className="avail-header">
          <h1>MANAGE AVAILABILITY</h1>
          <p className="avail-subtitle">
            Select a date, toggle your available hours, then save.
          </p>
        </div>

        <div className="avail-layout">
          {/* ---- Calendar ---- */}
          <div className="calendar-card">
            <div className="calendar-nav">
              <button className="cal-nav-btn" onClick={prevMonth}>←</button>
              <span className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
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
                const hasSlots = daysWithSlots.has(toDateStr(day.date))
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
                    {hasSlots && !isSelected && <span className="slot-dot" />}
                  </button>
                )
              })}
            </div>

            <div className="calendar-legend">
              <span className="legend-dot-purple" /> HAS SLOTS
            </div>
          </div>

          {/* ---- Slot grid panel ---- */}
          <div className="slots-card">
            {!selectedDate ? (
              <div className="slots-empty">
                <div className="slots-empty-icon">🗓</div>
                <p>SELECT A DATE TO MANAGE SLOTS</p>
              </div>
            ) : (
              <>
                <div className="slots-header">
                  <h2>
                    {selectedDate.toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric',
                    }).toUpperCase()}
                  </h2>
                  <span className="slots-count">
                    {selectedSlots.size} slot{selectedSlots.size !== 1 ? 's' : ''} selected
                  </span>
                </div>

                {loadingSlots ? (
                  <div className="slots-loading">LOADING...</div>
                ) : (
                  <>
                    <div className="slot-grid">
                      {HOUR_SLOTS.map(slot => {
                        const isOn = selectedSlots.has(slot.start)
                        const isBooked = bookedSlots.has(slot.start)
                        return (
                          <button
                            key={slot.start}
                            className={[
                              'slot-toggle',
                              isOn ? 'on' : '',
                              isBooked ? 'booked' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => toggleSlot(slot.start)}
                            disabled={isBooked}
                            title={isBooked ? 'Already booked by a student' : slot.label}
                          >
                            {slot.label}
                            {isBooked && <span className="booked-tag">BOOKED</span>}
                          </button>
                        )
                      })}
                    </div>

                    <div className="slots-footer">
                      <div className="slot-legend">
                        <span className="swatch on" /> AVAILABLE
                        <span className="swatch" /> UNAVAILABLE
                        <span className="swatch booked" /> BOOKED
                      </div>
                      <button className="save-btn" onClick={saveSlots} disabled={saving}>
                        {saving ? 'SAVING...' : 'SAVE'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
