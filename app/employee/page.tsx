// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, addMonths, eachDayOfInterval, parseISO } from 'date-fns'

export default function EmployeePage() {
  const [employee, setEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [blockers, setBlockers] = useState([])
  const [blockerDate, setBlockerDate] = useState('')
  const [blockerReason, setBlockerReason] = useState('')
  const [vacationFrom, setVacationFrom] = useState('')
  const [vacationTo, setVacationTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  const nextMonth = format(addMonths(startOfMonth(new Date()), 1), 'yyyy-MM')
  const nextMonthLabel = format(addMonths(startOfMonth(new Date()), 1), 'MMMM yyyy')

  useEffect(() => {
    const email = localStorage.getItem('nipps_email')
    if (!email) { window.location.href = '/login'; return }
    fetchData(email)
  }, [])

  async function fetchData(email) {
    const { data: emp } = await supabase.from('employees').select('*').eq('email', email).single()
    if (!emp) { window.location.href = '/login'; return }
    setEmployee(emp)
    setConfirmed(emp.blocker_confirmed && emp.blocker_confirmed_month === nextMonth)

    const monthStart = startOfMonth(new Date())
    const { data: schedule } = await supabase.from('schedules').select('id').eq('month', format(monthStart, 'yyyy-MM-dd')).eq('status', 'published').single()
    if (schedule) {
      const { data: shiftData } = await supabase.from('shifts').select('*').eq('schedule_id', schedule.id).eq('employee_id', emp.id).order('date')
      setShifts(shiftData || [])
    }

    const { data: blockerData } = await supabase.from('blocker_days').select('*').eq('employee_id', emp.id).gte('date', format(new Date(), 'yyyy-MM-dd')).order('date')
    setBlockers(blockerData || [])
    setLoading(false)
  }

  async function addBlocker() {
    if (!blockerDate || !employee) return
    await supabase.from('blocker_days').insert({ employee_id: employee.id, date: blockerDate, reason: blockerReason || null, type: 'blocker' })
    // Eintragen zählt genauso als "erledigt" wie der Keine-Blockertage-Button,
    // sonst gilt "alle fertig" nie für Leute die tatsächlich was eintragen.
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setBlockerDate('')
    setBlockerReason('')
    await fetchData(employee.email)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  async function addVacation() {
    if (!vacationFrom || !vacationTo || !employee) return
    const days = eachDayOfInterval({ start: parseISO(vacationFrom), end: parseISO(vacationTo) })
    const inserts = days.map(d => ({ employee_id: employee.id, date: format(d, 'yyyy-MM-dd'), type: 'vacation' }))
    await supabase.from('blocker_days').insert(inserts)
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setVacationFrom('')
    setVacationTo('')
    await fetchData(employee.email)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  async function removeEntry(id) {
    await supabase.from('blocker_days').delete().eq('id', id)
    await fetchData(employee.email)
  }

  async function confirmNoBlockers() {
    if (!employee) return
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setConfirmed(true)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>Lädt...</div>

  const blockersOnly = blockers.filter(b => b.type !== 'vacation')
  const vacationsOnly = blockers.filter(b => b.type === 'vacation')

  const card = { background: '#fff', borderRadius: '4px', padding: '24px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
  const label = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#999', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' }
  const heading = { fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '4px' }
  const sub = { color: '#999', fontSize: '13px', marginBottom: '20px' }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#1a1a1a', padding: '0 24px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <span style={{ color: '#c9a84c', fontSize: '13px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>Dienstplan · {employee?.name}</span>
          <button onClick={() => { localStorage.removeItem('nipps_email'); window.location.href = '/login' }} style={{ background: 'none', border: 'none', color: '#999', fontSize: '13px', cursor: 'pointer' }}>Abmelden</button>
        </div>
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px' }}>

        <div style={card}>
          <h2 style={heading}>Meine Schichten</h2>
          <p style={sub}>Aktueller Monat</p>
          {shifts.length === 0 ? (
            <p style={{ color: '#999', fontSize: '14px' }}>Noch kein Plan veröffentlicht.</p>
          ) : shifts.map(shift => (
            <div key={shift.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
              <span style={{ fontWeight: 500 }}>{format(new Date(shift.date), 'dd.MM.yyyy')}</span>
              <span style={{ color: '#666' }}>{shift.shift_type === 'morning' ? 'Vormittag' : shift.shift_type === 'afternoon' ? 'Nachmittag' : 'Samstag'} · {shift.area === 'shop' ? 'Laden' : 'Post'}</span>
            </div>
          ))}
        </div>

        <div style={card}>
          <h2 style={heading}>Blockertage · {nextMonthLabel}</h2>
          <p style={sub}>Tage an denen du nicht arbeiten kannst. Bitte bis zum 24. eintragen.</p>

          {confirmed ? (
            <div style={{ padding: '12px', background: '#f0fff4', borderLeft: '3px solid #1a7a3a', borderRadius: '3px', marginBottom: '20px', fontSize: '14px', color: '#1a7a3a' }}>
              ✓ Keine Blockertage für {nextMonthLabel} bestätigt.
            </div>
          ) : (
            <button onClick={confirmNoBlockers} style={{ width: '100%', padding: '12px', background: '#f0fff4', border: '1px solid #1a7a3a', borderRadius: '3px', color: '#1a7a3a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '20px' }}>
              Ich habe keine Blockertage für {nextMonthLabel}
            </button>
          )}

          <label style={label}>Datum</label>
          <input type="date" value={blockerDate} onChange={e => setBlockerDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} style={inp} />
          <label style={label}>Grund (optional)</label>
          <select value={blockerReason} onChange={e => setBlockerReason(e.target.value)} style={inp}>
            <option value="">Bitte wählen</option>
            <option value="Arzttermin">Arzttermin</option>
            <option value="Kinderbetreuung">Kinderbetreuung</option>
            <option value="Privat">Privat</option>
          </select>
          <button onClick={addBlocker} style={{ width: '100%', padding: '12px', background: '#e8000d', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>
            Blockertag eintragen
          </button>

          {blockersOnly.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              {blockersOnly.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
                  <span>{format(new Date(b.date), 'dd.MM.yyyy')}{b.reason && <span style={{ color: '#999', marginLeft: '8px' }}>({b.reason})</span>}</span>
                  <button onClick={() => removeEntry(b.id)} style={{ background: 'none', border: 'none', color: '#e8000d', cursor: 'pointer', fontSize: '13px' }}>Löschen</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={heading}>Urlaub · {nextMonthLabel}</h2>
          <p style={sub}>Urlaubszeitraum eintragen. Alle Tage werden automatisch als Urlaub gesetzt und als Arbeitsstunden angerechnet.</p>

          <label style={label}>Von</label>
          <input type="date" value={vacationFrom} onChange={e => setVacationFrom(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} style={inp} />
          <label style={label}>Bis</label>
          <input type="date" value={vacationTo} onChange={e => setVacationTo(e.target.value)} min={vacationFrom || format(new Date(), 'yyyy-MM-dd')} style={inp} />
          <button onClick={addVacation} style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#c9a84c', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>
            Urlaub eintragen
          </button>

          {vacationsOnly.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              {vacationsOnly.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
                  <span style={{ color: '#1a1a1a' }}>{format(new Date(b.date), 'dd.MM.yyyy')}</span>
                  <button onClick={() => removeEntry(b.id)} style={{ background: 'none', border: 'none', color: '#e8000d', cursor: 'pointer', fontSize: '13px' }}>Löschen</button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
