// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, addMonths, eachDayOfInterval, parseISO } from 'date-fns'
import { getPlanningMonth, addMonthsToKey } from '@/lib/rules'

export default function EmployeePage() {
  const [employee, setEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [blockers, setBlockers] = useState([])
  const [blockerDate, setBlockerDate] = useState('')
  const [blockerReason, setBlockerReason] = useState('')
  const [blockerShift, setBlockerShift] = useState('')
  const [vacationFrom, setVacationFrom] = useState('')
  const [vacationTo, setVacationTo] = useState('')
  const [vacMode, setVacMode] = useState('days')   // 'days' = einzelne Tage anklicken, 'range' = Von-Bis
  const [pickedDays, setPickedDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  // Planungsmonat: bis zum 24. der Folgemonat, danach der uebernaechste.
  // Vorher stand hier fest "naechster Monat" - deshalb konnte man Ende Juli
  // nur noch August eintragen, obwohl August laengst geplant war.
  const planMonth = getPlanningMonth()
  const [viewMonth, setViewMonth] = useState(planMonth)

  const nextMonth = planMonth
  const nextMonthLabel = format(parseISO(planMonth + '-01'), 'MMMM yyyy')
  const viewMonthLabel = format(parseISO(viewMonth + '-01'), 'MMMM yyyy')
  // Alle Monate sind einsehbar - ein halbes Jahr zurueck, drei Monate voraus.
  // Vergangene Monate nur zum Nachschauen, dort wird nichts mehr geaendert.
  const currentMonthKey = format(new Date(), 'yyyy-MM')
  const minMonth = addMonthsToKey(currentMonthKey, -6)
  const maxMonth = addMonthsToKey(planMonth, 3)
  const canGoBack = viewMonth > minMonth
  const canGoForward = viewMonth < maxMonth
  const readOnly = viewMonth < planMonth

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

    // Alle veroeffentlichten Plaene im einsehbaren Zeitraum laden,
    // damit man beim Blaettern auch die eigenen Schichten sieht.
    const from = addMonthsToKey(format(new Date(), 'yyyy-MM'), -6) + '-01'
    const { data: schedules } = await supabase
      .from('schedules').select('id').eq('status', 'published').gte('month', from)
    const ids = (schedules || []).map(s => s.id)
    if (ids.length) {
      const { data: shiftData } = await supabase
        .from('shifts').select('*').in('schedule_id', ids).eq('employee_id', emp.id).order('date')
      setShifts(shiftData || [])
    } else {
      setShifts([])
    }

    // Ab dem aeltesten einsehbaren Monat laden, damit vergangene Monate
    // beim Zurueckblaettern nicht leer aussehen.
    const { data: blockerData } = await supabase.from('blocker_days').select('*').eq('employee_id', emp.id).gte('date', addMonthsToKey(format(new Date(), 'yyyy-MM'), -6) + '-01').order('date')
    setBlockers(blockerData || [])
    setLoading(false)
  }

  // Samstag kennt nur eine Schicht - dort ist Halbtags sinnlos.
  const blockerDateIsSaturday = blockerDate ? new Date(blockerDate + 'T12:00:00').getDay() === 6 : false

  async function addBlocker() {
    if (!blockerDate || !employee) return
    const shiftType = blockerDateIsSaturday ? null : (blockerShift || null)
    // Doppelte Eintraege verhindern
    const dup = blockers.some(b => b.date === blockerDate && b.type === 'blocker' && (b.shift_type || null) === shiftType)
    if (dup) { setBlockerDate(''); setBlockerReason(''); setBlockerShift(''); return }
    await supabase.from('blocker_days').insert({ employee_id: employee.id, date: blockerDate, reason: blockerReason || null, type: 'blocker', shift_type: shiftType })
    // Eintragen zählt genauso als "erledigt" wie der Keine-Blockertage-Button,
    // sonst gilt "alle fertig" nie für Leute die tatsächlich was eintragen.
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setBlockerDate('')
    setBlockerReason('')
    setBlockerShift('')
    await fetchData(employee.email)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  async function addVacation() {
    if (!vacationFrom || !vacationTo || !employee) return
    if (vacationTo < vacationFrom) return

    const days = eachDayOfInterval({ start: parseISO(vacationFrom), end: parseISO(vacationTo) })
    // Tage die schon als Urlaub drinstehen werden uebersprungen.
    // Ohne das entstehen bei zweimaligem Eintragen doppelte Zeilen und
    // der Generator rechnet die Stunden doppelt an.
    const existing = new Set(blockers.filter(b => b.type === 'vacation').map(b => b.date))
    const inserts = days
      .map(d => format(d, 'yyyy-MM-dd'))
      .filter(d => !existing.has(d))
      .map(d => ({ employee_id: employee.id, date: d, type: 'vacation', shift_type: null }))

    if (inserts.length) {
      const { error } = await supabase.from('blocker_days').insert(inserts)
      if (error) { alert('Urlaub konnte nicht gespeichert werden: ' + error.message); return }
    }
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setVacationFrom('')
    setVacationTo('')
    await fetchData(employee.email)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  // Einzelne angeklickte Tage speichern.
  // Wer nur freitags arbeitet, klickt einfach seine Freitage an
  // statt einen Zeitraum ueber die ganze Woche zu legen.
  async function savePickedDays() {
    if (!pickedDays.length || !employee) return
    const existing = new Set(blockers.filter(b => b.type === 'vacation').map(b => b.date))
    const inserts = pickedDays
      .filter(d => !existing.has(d))
      .map(d => ({ employee_id: employee.id, date: d, type: 'vacation', shift_type: null }))

    if (inserts.length) {
      const { error } = await supabase.from('blocker_days').insert(inserts)
      if (error) { alert('Urlaub konnte nicht gespeichert werden: ' + error.message); return }
    }
    await supabase.from('employees').update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth }).eq('id', employee.id)
    setPickedDays([])
    await fetchData(employee.email)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  function toggleDay(d) {
    setPickedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
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

  // Kalender fuer den gerade angezeigten Monat
  const calFirst = parseISO(viewMonth + '-01')
  const calDays = eachDayOfInterval({ start: calFirst, end: endOfMonth(calFirst) })
  const savedVacationDays = new Set(vacationsOnly.map(b => b.date))
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const monthMin = viewMonth + '-01' > todayStr ? viewMonth + '-01' : todayStr
  const monthMax = format(endOfMonth(parseISO(viewMonth + '-01')), 'yyyy-MM-dd')
  const inView = (b) => b.date.startsWith(viewMonth)
  const blockersInView = blockersOnly.filter(inView)
  const vacationsInView = vacationsOnly.filter(inView)
  const shiftsInView = shifts.filter(s => s.date.startsWith(viewMonth))

  const card = { background: '#fff', borderRadius: '4px', padding: '24px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
  const label = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#999', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' }
  const heading = { fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '4px' }
  const sub = { color: '#999', fontSize: '13px', marginBottom: '20px' }
  const tab = { flex: 1, padding: '10px', border: '1px solid #e0e0e0', background: '#fff', borderRadius: '3px', fontSize: '13px', color: '#666', cursor: 'pointer' }
  const tabOn = { background: '#1a1a1a', color: '#c9a84c', borderColor: '#1a1a1a', fontWeight: 600 }
  const navBtn = (on) => ({ padding: '6px 12px', border: '1px solid #e0e0e0', background: '#fff', borderRadius: '3px', fontSize: '16px', lineHeight: 1, color: on ? '#1a1a1a' : '#ddd', cursor: on ? 'pointer' : 'default' })

  const monthNav = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '8px 0', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
      <button onClick={() => { if (canGoBack) { setViewMonth(addMonthsToKey(viewMonth, -1)); setPickedDays([]); setBlockerDate('') } }} disabled={!canGoBack} style={navBtn(canGoBack)}>‹</button>
      <span style={{ fontSize: '14px', fontWeight: 600 }}>
        {viewMonthLabel}
        {viewMonth === planMonth && <span style={{ color: '#c9a84c', fontSize: '11px', marginLeft: '8px', fontWeight: 700 }}>AKTUELL</span>}
        {readOnly && <span style={{ color: '#999', fontSize: '11px', marginLeft: '8px', fontWeight: 600 }}>NUR ANSICHT</span>}
      </span>
      <button onClick={() => { if (canGoForward) { setViewMonth(addMonthsToKey(viewMonth, 1)); setPickedDays([]); setBlockerDate('') } }} disabled={!canGoForward} style={navBtn(canGoForward)}>›</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#1a1a1a', padding: '0 24px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <span style={{ color: '#c9a84c', fontSize: '13px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}>Dienstplan · {employee?.name}</span>
          <button onClick={() => { localStorage.removeItem('nipps_email'); window.location.href = '/login' }} style={{ background: 'none', border: 'none', color: '#999', fontSize: '13px', cursor: 'pointer' }}>Abmelden</button>
        </div>
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px' }}>

        <div style={{ ...card, padding: '8px 16px' }}>{monthNav}</div>

        <div style={card}>
          <h2 style={heading}>Meine Schichten</h2>
          <p style={sub}>{viewMonthLabel}</p>
          {shiftsInView.length === 0 ? (
            <p style={{ color: '#999', fontSize: '14px' }}>Für diesen Monat ist noch kein Plan veröffentlicht.</p>
          ) : shiftsInView.map(shift => (
            <div key={shift.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
              <span style={{ fontWeight: 500 }}>{format(new Date(shift.date), 'dd.MM.yyyy')}</span>
              <span style={{ color: '#666' }}>{shift.shift_type === 'morning' ? 'Vormittag' : shift.shift_type === 'afternoon' ? 'Nachmittag' : 'Samstag'} · {shift.area === 'shop' ? 'Laden' : 'Post'}</span>
            </div>
          ))}
        </div>

        <div style={card}>
          <h2 style={heading}>Blockertage</h2>
          <p style={sub}>Tage an denen du nicht arbeiten kannst. Für {nextMonthLabel} bitte bis zum 24. eintragen.</p>

          {readOnly && (
            <div style={{ padding: '12px', background: '#fafafa', borderLeft: '3px solid #ccc', borderRadius: '3px', marginBottom: '20px', fontSize: '13px', color: '#777' }}>
              {viewMonthLabel} ist schon geplant. Du kannst hier nachschauen, was eingetragen war,
              aber nichts mehr ändern. Wenn sich kurzfristig etwas ergibt, sag Peter Bescheid.
            </div>
          )}

          {!readOnly && (confirmed ? (
            <div style={{ padding: '12px', background: '#f0fff4', borderLeft: '3px solid #1a7a3a', borderRadius: '3px', marginBottom: '20px', fontSize: '14px', color: '#1a7a3a' }}>
              ✓ Keine Blockertage für {nextMonthLabel} bestätigt.
            </div>
          ) : (
            <button onClick={confirmNoBlockers} style={{ width: '100%', padding: '12px', background: '#f0fff4', border: '1px solid #1a7a3a', borderRadius: '3px', color: '#1a7a3a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '20px' }}>
              Ich habe keine Blockertage für {nextMonthLabel}
            </button>
          ))}

          {!readOnly && (<>
          <label style={label}>Datum</label>
          <input type="date" value={blockerDate} onChange={e => setBlockerDate(e.target.value)} min={monthMin} max={monthMax} style={inp} />

          <label style={label}>Zeitraum</label>
          {blockerDateIsSaturday ? (
            <div style={{ ...inp, color: '#999', background: '#fafafa' }}>Samstag · nur ganzer Tag möglich</div>
          ) : (
            <select value={blockerShift} onChange={e => setBlockerShift(e.target.value)} style={inp}>
              <option value="">Ganzer Tag</option>
              <option value="morning">Nur Vormittag (09–14)</option>
              <option value="afternoon">Nur Nachmittag (14–19)</option>
            </select>
          )}

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
          </>)}

          {readOnly && blockersInView.length === 0 && (
            <p style={{ color: '#999', fontSize: '14px' }}>Keine Blockertage eingetragen.</p>
          )}

          {blockersInView.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              {blockersInView.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
                  <span>
                    {format(new Date(b.date), 'dd.MM.yyyy')}
                    <span style={{ color: '#666', marginLeft: '8px' }}>
                      {b.shift_type === 'morning' ? 'Vormittag' : b.shift_type === 'afternoon' ? 'Nachmittag' : 'ganzer Tag'}
                    </span>
                    {b.reason && <span style={{ color: '#999', marginLeft: '8px' }}>({b.reason})</span>}
                  </span>
                  {!readOnly && <button onClick={() => removeEntry(b.id)} style={{ background: 'none', border: 'none', color: '#e8000d', cursor: 'pointer', fontSize: '13px' }}>Löschen</button>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={heading}>Urlaub · {viewMonthLabel}</h2>
          <p style={sub}>Angerechnet werden nur die Tage, an denen du normalerweise arbeitest – 5 Stunden pro Tag. Samstag und Sonntag zählen nicht.</p>

          {!readOnly && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => setVacMode('days')} style={{ ...tab, ...(vacMode === 'days' ? tabOn : {}) }}>Einzelne Tage</button>
              <button onClick={() => setVacMode('range')} style={{ ...tab, ...(vacMode === 'range' ? tabOn : {}) }}>Ganzer Zeitraum</button>
            </div>
          )}

          {(readOnly || vacMode === 'days') ? (
            <>
              {!readOnly && (
                <p style={{ ...sub, marginBottom: '12px' }}>
                  Tage antippen, an denen du frei hast. Wenn du zum Beispiel nur freitags arbeitest,
                  reicht es, deine Freitage anzuklicken.
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '12px' }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#999', fontWeight: 600, paddingBottom: '4px' }}>{d}</div>
                ))}
                {Array.from({ length: (calFirst.getDay() + 6) % 7 }).map((_, i) => <div key={'pad' + i} />)}
                {calDays.map(d => {
                  const ds = format(d, 'yyyy-MM-dd')
                  const dow = d.getDay()
                  const already = savedVacationDays.has(ds)
                  const picked = pickedDays.includes(ds)
                  const isSun = dow === 0
                  return (
                    <button
                      key={ds}
                      onClick={() => !readOnly && !already && !isSun && toggleDay(ds)}
                      disabled={readOnly || already || isSun}
                      style={{
                        padding: '10px 0', fontSize: '13px', borderRadius: '3px', cursor: already || isSun ? 'default' : 'pointer',
                        border: '1px solid ' + (picked ? '#1a1a1a' : already ? '#c9a84c' : '#e8e8e8'),
                        background: picked ? '#1a1a1a' : already ? '#faf3e0' : isSun ? '#fafafa' : '#fff',
                        color: picked ? '#c9a84c' : already ? '#8a6d1a' : isSun ? '#ccc' : '#1a1a1a',
                        fontWeight: picked || already ? 600 : 400,
                      }}
                    >
                      {format(d, 'd')}
                    </button>
                  )
                })}
              </div>

              {readOnly ? (
                <p style={{ fontSize: '12px', color: '#999' }}>
                  {vacationsInView.length > 0
                    ? `${vacationsInView.length} Urlaubstag${vacationsInView.length === 1 ? '' : 'e'} · beige markiert`
                    : 'Kein Urlaub eingetragen.'}
                </p>
              ) : (
                <>
                  <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
                    {pickedDays.length > 0
                      ? `${pickedDays.length} Tag${pickedDays.length === 1 ? '' : 'e'} ausgewählt`
                      : 'Noch nichts ausgewählt'}
                    {savedVacationDays.size > 0 && ' · beige = schon eingetragen'}
                  </p>

                  <button onClick={savePickedDays} disabled={!pickedDays.length} style={{ width: '100%', padding: '12px', background: pickedDays.length ? '#1a1a1a' : '#ccc', color: pickedDays.length ? '#c9a84c' : '#fff', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: pickedDays.length ? 'pointer' : 'default' }}>
                    Ausgewählte Tage eintragen
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <p style={{ ...sub, marginBottom: '12px' }}>Für längeren Urlaub am Stück.</p>
              <label style={label}>Von</label>
              <input type="date" value={vacationFrom} onChange={e => setVacationFrom(e.target.value)} min={monthMin} max={monthMax} style={inp} />
              <label style={label}>Bis</label>
              <input type="date" value={vacationTo} onChange={e => setVacationTo(e.target.value)} min={vacationFrom || monthMin} max={monthMax} style={inp} />
              <button onClick={addVacation} style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#c9a84c', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>
                Urlaub eintragen
              </button>
            </>
          )}

          {vacationsInView.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              {vacationsInView.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }}>
                  <span style={{ color: '#1a1a1a' }}>{format(new Date(b.date), 'dd.MM.yyyy')}</span>
                  {!readOnly && <button onClick={() => removeEntry(b.id)} style={{ background: 'none', border: 'none', color: '#e8000d', cursor: 'pointer', fontSize: '13px' }}>Löschen</button>}
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
