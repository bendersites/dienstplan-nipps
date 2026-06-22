'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, addMonths } from 'date-fns'
import { Calendar, AlertCircle, LogOut, CheckCircle } from 'lucide-react'

type Shift = { id: string; date: string; shift_type: string; area: string }
type Blocker = { id: string; date: string; reason: string | null }

export default function EmployeePage() {
  const [user, setUser] = useState<any>(null)
  const [employee, setEmployee] = useState<any>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [newBlockerDate, setNewBlockerDate] = useState('')
  const [newBlockerReason, setNewBlockerReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  const nextMonth = format(addMonths(startOfMonth(new Date()), 1), 'yyyy-MM')
  const nextMonthLabel = format(addMonths(startOfMonth(new Date()), 1), 'MMMM yyyy')

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchData(session.user.email!)
      } else {
        window.location.href = '/login'
      }
    })
  }, [])

  async function fetchData(email: string) {
    const { data: emp } = await supabase.from('employees').select('*').eq('email', email).single()
    if (!emp) { setLoading(false); return }
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
    if (!newBlockerDate || !employee) return
    await supabase.from('blocker_days').insert({ employee_id: employee.id, date: newBlockerDate, reason: newBlockerReason || null })
    setNewBlockerDate('')
    setNewBlockerReason('')
    await fetchData(user.email)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  async function removeBlocker(id: string) {
    await supabase.from('blocker_days').delete().eq('id', id)
    if (user) await fetchData(user.email)
  }

  async function confirmNoBlockers() {
    if (!employee) return
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setConfirmed(true)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>Lädt...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#1a1a1a', padding: '0 24px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <span style={{ color: '#c9a84c', fontSize: '13px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>Dienstplan</span>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')} style={{ background: 'none', border: 'none', color: '#999', fontSize: '13px', cursor: 'pointer' }}>Abmelden</button>
        </div>
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '4px', padding: '24px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '16px' }}>Aktueller Monat</h2>
          {shifts.length === 0 ? (
            <p style={{ color: '#999', fontSize: '14px' }}>Noch kein Plan veröffentlicht.</p>
          ) : (
            shifts.map(shift => (
              <div key={shift.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
                <span style={{ fontWeight: 500 }}>{format(new Date(shift.date), 'dd.MM.yyyy')}</span>
                <span style={{ color: '#666' }}>{shift.shift_type === 'morning' ? 'Vormittag' : shift.shift_type === 'afternoon' ? 'Nachmittag' : 'Samstag'} · {shift.area === 'shop' ? 'Laden' : 'Post'}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: '4px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '4px' }}>Blockertage · {nextMonthLabel}</h2>
          <p style={{ color: '#999', fontSize: '13px', marginBottom: '20px' }}>Bitte bis zum 24. eintragen.</p>

          {confirmed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#f0fff4', borderLeft: '3px solid #1a7a3a', borderRadius: '3px', marginBottom: '20px', fontSize: '14px', color: '#1a7a3a' }}>
              ✓ Keine Blockertage für {nextMonthLabel} bestätigt.
            </div>
          ) : (
            <button onClick={confirmNoBlockers} style={{ width: '100%', padding: '12px', background: '#f0fff4', border: '1px solid #1a7a3a', borderRadius: '3px', color: '#1a7a3a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '20px' }}>
              Ich habe keine Blockertage für {nextMonthLabel}
            </button>
          )}

          <input type="date" value={newBlockerDate} onChange={e => setNewBlockerDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' as any }} />
          <select value={newBlockerReason} onChange={e => setNewBlockerReason(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' as any }}>
            <option value="">Grund (optional)</option>
            <option value="Arzttermin">Arzttermin</option>
            <option value="Kinderbetreuung">Kinderbetreuung</option>
            <option value="Privat">Privat</option>
          </select>
          <button onClick={addBlocker} style={{ width: '100%', padding: '12px', background: '#e8000d', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '20px' }}>
            Blockertag eintragen
          </button>

          {blockers.map(blocker => (
            <div key={blocker.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
              <span>{format(new Date(blocker.date), 'dd.MM.yyyy')}{blocker.reason && <span style={{ color: '#999', marginLeft: '8px' }}>({blocker.reason})</span>}</span>
              <button onClick={() => removeBlocker(blocker.id)} style={{ background: 'none', border: 'none', color: '#e8000d', cursor: 'pointer', fontSize: '13px' }}>Löschen</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
