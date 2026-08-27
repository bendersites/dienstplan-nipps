// @ts-nocheck

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, addMonths, subMonths, addDays, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { 
  ChevronLeft, 
  ChevronRight, 
  Mail,
  AlertCircle,
  Settings,
  LogOut,
  Trash2,
  Save,
  Printer
} from 'lucide-react'
import MonatsplanGrid from '@/components/MonatsplanGrid'
import { getMonthDays, getDayName, isSaturday } from '@/lib/utils'
import { computeVacationHours } from '@/lib/planner'
import { getShiftDuration, getTargetHours, getMaxHours } from '@/lib/rules'

type Employee = {
  id: string
  name: string
  email: string
  role: string
  qualification: string
  target_hours: number
  active: boolean
}

type Shift = {
  id: string
  date: string
  shift_type: 'morning' | 'afternoon' | 'saturday'
  area: 'shop' | 'post'
  employee_id: string | null
  is_open: boolean
  employee?: Employee
}

type Schedule = {
  id: string
  month: string
  status: 'draft' | 'published'
}

export default function AdminPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [blockers, setBlockers] = useState<{ employee_id: string; date: string; type: string }[]>([])
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [openShifts, setOpenShifts] = useState(0)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingShift, setEditingShift] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  // Zeilen die Peter gerade selbst geaendert hat - damit er sieht wo er war.
  const [touchedDays, setTouchedDays] = useState<Set<string>>(new Set())
  // Blockertage/Urlaub die Peter fuer eine Mitarbeiterin eintraegt (Zettel-Faelle).
  const [adminEntryEmp, setAdminEntryEmp] = useState('')
  const [adminEntryFrom, setAdminEntryFrom] = useState('')
  const [adminEntryTo, setAdminEntryTo] = useState('')
  const [adminEntryType, setAdminEntryType] = useState('blocker')
  const [adminEntryShift, setAdminEntryShift] = useState('')
  const [adminEntryReason, setAdminEntryReason] = useState('')
  const [adminEntrySaving, setAdminEntrySaving] = useState(false)

  const monthStart = startOfMonth(currentDate)
  const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth())

  useEffect(() => {
    if (localStorage.getItem('nipps_admin_authed') !== 'true') {
      window.location.href = '/login'
      return
    }
    fetchData()
  }, [currentDate])

  async function fetchData() {
    setLoading(true)
    
    const { data: empData } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)
      .order('name')
    
    setEmployees(empData || [])

    const monthStr = format(monthStart, 'yyyy-MM-dd')
    const nextMonthStr = format(addMonths(monthStart, 1), 'yyyy-MM-dd')

    const { data: blockerData } = await supabase
      .from('blocker_days')
      .select('employee_id, date, type, shift_type, reason')
      .gte('date', monthStr)
      .lt('date', nextMonthStr)
      .order('date')

    setBlockers(blockerData || [])

    let { data: schedData } = await (supabase as any)
      .from('schedules')
      .select('*')
      .eq('month', monthStr)
      .single()

    if (!schedData) {
      const { data: newSched } = await supabase
        .from('schedules')
        .insert([{ month: monthStr, status: 'draft' }] as any)
        .select()
        .single()
      schedData = newSched
    }
    
    setSchedule(schedData)

    if (schedData) {
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*, employee:employees(*)')
        .eq('schedule_id', schedData.id)
      
      setShifts(shiftData || [])
      setOpenShifts((shiftData || []).filter(s => s.is_open).length)
    }

    setLoading(false)
  }

  async function generatePlan() {
    setGenerating(true)
    setGenError(null)

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: format(monthStart, 'yyyy-MM-dd'),
          scheduleId: schedule?.id
        })
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const detail = result?.details?.length ? ' — ' + result.details.slice(0, 3).join('; ') : ''
        setGenError((result?.error || `Fehler ${response.status}`) + detail)
      } else {
        await fetchData()
      }
    } catch (error: any) {
      setGenError('Netzwerkfehler: ' + (error?.message || 'unbekannt'))
    }

    setGenerating(false)
  }

  async function deletePlan() {
    if (!schedule) return
    
    await supabase.from('shifts').delete().eq('schedule_id', schedule.id)
    await supabase.from('schedules').update({ status: 'draft', published_at: null }).eq('id', schedule.id)
    
    setShowDeleteModal(false)
    await fetchData()
  }

  async function updateShift(shiftId: string, employeeId: string | null) {
    await supabase
      .from('shifts')
      .update({ employee_id: employeeId, is_open: !employeeId })
      .eq('id', shiftId)

    setEditingShift(null)

    // Tag merken, damit die Zeile sichtbar markiert bleibt.
    const changed = shifts.find(s => s.id === shiftId)
    if (changed) setTouchedDays(prev => new Set(prev).add(changed.date))

    // Nur den lokalen State anpassen statt die ganze Seite neu zu laden.
    // fetchData() wuerde loading=true setzen, die Seite kurz leeren und
    // nach oben springen lassen - genau das soll beim Bearbeiten nicht passieren.
    setShifts(prev => {
      const next = prev.map(s =>
        s.id === shiftId
          ? {
              ...s,
              employee_id: employeeId,
              is_open: !employeeId,
              employee: employeeId ? employees.find(e => e.id === employeeId) : undefined
            }
          : s
      )
      setOpenShifts(next.filter(s => s.is_open).length)
      return next
    })
  }

  // Peter traegt fuer eine Mitarbeiterin ein - z.B. wenn ihm ein Zettel
  // zugesteckt wird. Von/Bis, alles dazwischen wird angelegt.
  async function saveAdminEntry() {
    if (!adminEntryEmp || !adminEntryFrom) return
    setAdminEntrySaving(true)

    const from = parseISO(adminEntryFrom)
    const to = adminEntryTo ? parseISO(adminEntryTo) : from
    const rows: any[] = []

    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d.getDay() === 0) continue // Sonntag hat sowieso zu
      rows.push({
        employee_id: adminEntryEmp,
        date: format(d, 'yyyy-MM-dd'),
        type: adminEntryType,
        // Urlaub gilt immer ganztaegig, nur Blocker kann auf eine Schicht begrenzt sein
        shift_type: adminEntryType === 'vacation' ? null : (adminEntryShift || null),
        reason: adminEntryReason || null
      })
    }

    if (rows.length) {
      await supabase.from('blocker_days').insert(rows)
      // Zaehlt genauso als "gemeldet" wie wenn die Mitarbeiterin selbst eintraegt
      await supabase
        .from('employees')
        .update({ blocker_confirmed: true, blocker_confirmed_month: format(monthStart, 'yyyy-MM') })
        .eq('id', adminEntryEmp)
    }

    setAdminEntryFrom('')
    setAdminEntryTo('')
    setAdminEntryShift('')
    setAdminEntryReason('')
    setAdminEntrySaving(false)
    await fetchData()
  }

  async function removeBlockerEntry(employeeId: string, date: string) {
    await supabase.from('blocker_days').delete().eq('employee_id', employeeId).eq('date', date)
    await fetchData()
  }

  async function publishPlan() {
    if (!schedule) return
    
    await supabase
      .from('schedules')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', schedule.id)

    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduleId: schedule.id,
        month: format(monthStart, 'MMMM yyyy', { locale: de })
      })
    })

    setShowPublishModal(false)
    await fetchData()
  }

  function getShiftForDay(date: Date, shiftType: 'morning' | 'afternoon' | 'saturday', area: 'shop' | 'post'): Shift | undefined {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.find(s => s.date === dateStr && s.shift_type === shiftType && s.area === area)
  }

  function getShiftColor(shift: Shift | undefined): string {
    if (!shift) return 'bg-gray-100'
    if (shift.is_open) return 'bg-red-100 border-red-300 text-red-800'
    return 'bg-white border-gray-200'
  }

  function getAvailableEmployees(shift: Shift): Employee[] {
    // Manuelle Bearbeitung: keine Tages-Sonderregeln mehr, Peter kann frei überschreiben.
    // Einschränkung bleibt: Qualifikation für den Bereich + kein Urlaub/Blocker an dem Tag.
    return employees.filter(e => {
      if (e.qualification !== 'both' && e.qualification !== shift.area) return false
      const isBlocked = blockers.some(b =>
        b.employee_id === e.id &&
        b.date === shift.date &&
        (!b.shift_type || b.shift_type === shift.shift_type)
      )
      if (isBlocked) return false
      return true
    })
  }

  // Alle Mitarbeiterinnen mit Hinweis warum sie ggf. nicht passen.
  // Peter sieht so immer den ganzen Kader statt einer stillen Auswahl -
  // "warum kann ich Ines nicht nehmen" soll nicht mehr vorkommen.
  function getEmployeeOptions(shift: Shift) {
    return employees.map(e => {
      const wrongArea = e.qualification !== 'both' && e.qualification !== shift.area
      const blocked = blockers.find(b =>
        b.employee_id === e.id &&
        b.date === shift.date &&
        (!b.shift_type || b.shift_type === shift.shift_type)
      )
      // Schon in einer anderen Schicht am selben Tag?
      const otherSameDay = shifts.find(s =>
        s.date === shift.date && s.id !== shift.id && s.employee_id === e.id
      )

      let note = ''
      let blocking = false
      if (wrongArea) {
        note = e.qualification === 'post' ? 'nur Post' : 'nur Laden'
        blocking = true
      } else if (blocked) {
        note = blocked.type === 'vacation' ? 'Urlaub' : 'Blockertag'
        blocking = true
      } else if (otherSameDay) {
        note = 'schon eingeteilt'
      }

      return { emp: e, note, blocking }
    })
  }

  // Steht jemand an dem Tag zweimal drin?
  function getDoubleBookedNames(dateStr: string): string[] {
    const counts: Record<string, number> = {}
    shifts
      .filter(s => s.date === dateStr && s.employee_id)
      .forEach(s => { counts[s.employee_id!] = (counts[s.employee_id!] || 0) + 1 })
    return Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([id]) => employees.find(e => e.id === id)?.name)
      .filter(Boolean) as string[]
  }

  // Aufeinanderfolgende Tage zu Zeitraeumen zusammenfassen,
  // damit aus 16 Urlaubszeilen "08.08. – 23.08." wird.
  function groupRanges(dates: string[]) {
    const sorted = [...new Set(dates)].sort()
    const out: { from: string; to: string }[] = []
    for (const d of sorted) {
      const last = out[out.length - 1]
      if (last && format(addDays(parseISO(last.to), 1), 'yyyy-MM-dd') === d) last.to = d
      else out.push({ from: d, to: d })
    }
    return out
  }

  const shiftLabel = (t: string | null) =>
    t === 'morning' ? 'nur Vormittag' : t === 'afternoon' ? 'nur Nachmittag' : 'ganzer Tag'

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1))

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Lädt...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Nipps Dienstplan</h1>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                Admin
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  localStorage.removeItem('nipps_email')
                  localStorage.removeItem('nipps_admin_authed')
                  window.location.href = '/login'
                }}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Abmelden
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <button onClick={handlePrevMonth} className="p-2 rounded-md hover:bg-gray-200">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: de })}
            </h2>
            <button onClick={handleNextMonth} className="p-2 rounded-md hover:bg-gray-200">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => window.print()}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50"
              title="Druckt nur den Monatsplan, A4 quer. Im Druckdialog „Als PDF sichern“ für die Datei."
            >
              <Printer className="w-4 h-4 mr-2" />
              Drucken / PDF
            </button>

            {openShifts > 0 && (
              <div className="flex items-center px-3 py-2 bg-red-50 text-red-700 rounded-md text-sm">
                <AlertCircle className="w-4 h-4 mr-2" />
                {openShifts} offene Schichten
              </div>
            )}
            
            {schedule?.status === 'draft' ? (
              <>
                <button
                  onClick={generatePlan}
                  disabled={generating}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Settings className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Generiere...' : 'KI: Plan generieren'}
                </button>
                <button
                  onClick={() => setShowPublishModal(true)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Veröffentlichen
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Löschen
                </button>
              </>
            ) : (
              <>
                <span className="px-4 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md">
                  ✓ Veröffentlicht
                </span>
                {/* Nach dem Veroeffentlichen kann Peter weiter aendern und
                    den Plan erneut rausschicken - vorher war hier eine Sackgasse. */}
                <button
                  onClick={() => setShowPublishModal(true)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Erneut senden
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Löschen
                </button>
              </>
            )}
          </div>
        </div>

        {genError && (
          <div className="mb-4 flex items-start px-4 py-3 bg-red-50 border border-red-300 text-red-800 rounded-md text-sm">
            <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">Plan wurde NICHT geändert</div>
              <div>{genError}</div>
            </div>
          </div>
        )}

        {/* Der Aushang. Genau das kommt auf Papier - A4 quer, ohne Stunden.
            Alles andere auf der Seite wird beim Drucken ausgeblendet. */}
        <div className="print-area bg-white rounded-lg shadow p-4 mb-6">
          <MonatsplanGrid
            month={format(monthStart, 'yyyy-MM')}
            employees={employees}
            shifts={shifts}
            blockers={blockers}
          />
        </div>

        {/* Peter traegt selbst ein - fuer die Zettel die im Laden zugesteckt werden */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-gray-900">Blockertag / Urlaub eintragen</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Für Mitarbeiterinnen die dir einen Zettel geben statt es selbst einzutragen.
            </p>
          </div>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Mitarbeiterin</label>
              <select
                value={adminEntryEmp}
                onChange={e => setAdminEntryEmp(e.target.value)}
                className="w-full text-sm border rounded px-2 py-2"
              >
                <option value="">wählen…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Art</label>
              <select
                value={adminEntryType}
                onChange={e => setAdminEntryType(e.target.value)}
                className="w-full text-sm border rounded px-2 py-2"
              >
                <option value="blocker">Blockertag</option>
                <option value="vacation">Urlaub</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Von</label>
              <input
                type="date"
                value={adminEntryFrom}
                onChange={e => setAdminEntryFrom(e.target.value)}
                className="w-full text-sm border rounded px-2 py-2"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Bis <span className="text-gray-400">(optional)</span></label>
              <input
                type="date"
                value={adminEntryTo}
                min={adminEntryFrom}
                onChange={e => setAdminEntryTo(e.target.value)}
                className="w-full text-sm border rounded px-2 py-2"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Schicht</label>
              <select
                value={adminEntryShift}
                onChange={e => setAdminEntryShift(e.target.value)}
                disabled={adminEntryType === 'vacation'}
                className="w-full text-sm border rounded px-2 py-2 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">ganzer Tag</option>
                <option value="morning">nur Vormittag</option>
                <option value="afternoon">nur Nachmittag</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <button
                onClick={saveAdminEntry}
                disabled={!adminEntryEmp || !adminEntryFrom || adminEntrySaving}
                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {adminEntrySaving ? 'Speichert…' : 'Eintragen'}
              </button>
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-gray-500 mb-1">Grund <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={adminEntryReason}
                onChange={e => setAdminEntryReason(e.target.value)}
                placeholder="z.B. Arzttermin"
                className="w-full text-sm border rounded px-2 py-2"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Eingetragener Urlaub & Blockertage · {format(currentDate, 'MMMM yyyy', { locale: de })}
            </h3>
            <span className="text-xs text-gray-500">{blockers.length} Einträge</span>
          </div>

          {blockers.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-500">
              Für diesen Monat hat niemand etwas eingetragen.
            </div>
          ) : (
            <div className="divide-y">
              {employees.map(emp => {
                const mine = blockers.filter(b => b.employee_id === emp.id)
                if (!mine.length) return null

                const vacRanges = groupRanges(mine.filter(b => b.type === 'vacation').map(b => b.date))
                const blockDays = mine.filter(b => b.type !== 'vacation')
                const vacHours = computeVacationHours([emp], blockers)[emp.id] || 0

                return (
                  <div key={emp.id} className="px-4 py-3 flex flex-wrap items-start gap-x-6 gap-y-2">
                    <div className="w-24 font-medium text-sm">{emp.name}</div>
                    <div className="flex-1 min-w-[16rem] space-y-1 text-sm">
                      {vacRanges.map((r, i) => (
                        <div key={'v' + i} className="flex items-center group">
                          <span className="inline-block w-16 text-xs font-medium text-amber-700">Urlaub</span>
                          <span>
                            {r.from === r.to
                              ? format(parseISO(r.from), 'dd.MM.yyyy')
                              : `${format(parseISO(r.from), 'dd.MM.')} – ${format(parseISO(r.to), 'dd.MM.yyyy')}`}
                            <span className="text-gray-500 ml-2">
                              ({Math.round((parseISO(r.to).getTime() - parseISO(r.from).getTime()) / 86400000) + 1} Tage)
                            </span>
                          </span>
                        </div>
                      ))}
                      {blockDays.map((b, i) => (
                        <div key={'b' + i} className="flex items-center group">
                          <span className="inline-block w-16 text-xs font-medium text-red-700">Blocker</span>
                          <span>
                            {format(parseISO(b.date), 'dd.MM.yyyy')}
                            <span className="text-gray-500 ml-2">{shiftLabel(b.shift_type)}</span>
                            {b.reason && <span className="text-gray-400 ml-2">· {b.reason}</span>}
                          </span>
                          <button
                            onClick={() => removeBlockerEntry(emp.id, b.date)}
                            className="ml-3 text-xs text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                            title="Eintrag löschen"
                          >
                            löschen
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm text-gray-600 whitespace-nowrap">
                      {vacHours > 0 ? `${vacHours}h angerechnet` : '–'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Tag
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vormittag Laden (09–14)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vormittag Post (09–14)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nachmittag Laden (14–19)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nachmittag Post (14–19)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {days.map((day) => {
                  const isSat = isSaturday(day)
                  const isSun = day.getDay() === 0
                  const dayStr = format(day, 'yyyy-MM-dd')
                  const touched = touchedDays.has(dayStr)
                  const doubled = getDoubleBookedNames(dayStr)
                  // Gelber Balken links + heller Hintergrund auf geaenderten Zeilen.
                  // Doppelbelegung sticht mit rot heraus und schlaegt die gelbe Markierung.
                  const touchedRow = doubled.length
                    ? 'bg-red-50 border-l-4 border-l-red-500'
                    : touched ? 'bg-amber-50 border-l-4 border-l-amber-400' : ''
                  if (isSun) {
                    return (
                      <tr key={day.toISOString()} className="bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-400">
                          {format(day, 'dd.MM.')} {getDayName(day)}
                        </td>
                        <td colSpan={4} className="px-4 py-3 text-sm text-gray-400 text-center">
                          Geschlossen
                        </td>
                      </tr>
                    )
                  }

                  if (isSat) {
                    const satShop = getShiftForDay(day, 'saturday', 'shop')
                    const satPost = getShiftForDay(day, 'saturday', 'post')
                    
                    return (
                      <tr key={day.toISOString()} className={touchedRow}>
                        <td className="px-4 py-3 text-sm font-medium">
                          {format(day, 'dd.MM.')} {getDayName(day)}
                          {doubled.length > 0 && (
                            <span className="ml-2 text-[10px] font-semibold text-red-700 uppercase">
                              {doubled.join(', ')} doppelt
                            </span>
                          )}
                          {!doubled.length && touched && <span className="ml-2 text-[10px] font-semibold text-amber-700 uppercase">geändert</span>}
                        </td>
                        <td className={`px-4 py-3 text-sm border ${getShiftColor(satShop)}`}>
                          {renderShiftCell(satShop)}
                        </td>
                        <td className={`px-4 py-3 text-sm border ${getShiftColor(satPost)}`}>
                          {renderShiftCell(satPost)}
                        </td>
                        <td className="px-4 py-3 text-sm bg-gray-100 text-gray-400 text-center" colSpan={2}>
                          —
                        </td>
                      </tr>
                    )
                  }

                  const mShop = getShiftForDay(day, 'morning', 'shop')
                  const mPost = getShiftForDay(day, 'morning', 'post')
                  const aShop = getShiftForDay(day, 'afternoon', 'shop')
                  const aPost = getShiftForDay(day, 'afternoon', 'post')

                  return (
                    <tr key={day.toISOString()} className={touchedRow}>
                      <td className="px-4 py-3 text-sm font-medium">
                        {format(day, 'dd.MM.')} {getDayName(day)}
                        {doubled.length > 0 && (
                          <span className="ml-2 text-[10px] font-semibold text-red-700 uppercase">
                            {doubled.join(', ')} doppelt
                          </span>
                        )}
                        {!doubled.length && touched && <span className="ml-2 text-[10px] font-semibold text-amber-700 uppercase">geändert</span>}
                      </td>
                      <td className={`px-4 py-3 text-sm border ${getShiftColor(mShop)}`}>
                        {renderShiftCell(mShop)}
                      </td>
                      <td className={`px-4 py-3 text-sm border ${getShiftColor(mPost)}`}>
                        {renderShiftCell(mPost)}
                      </td>
                      <td className={`px-4 py-3 text-sm border ${getShiftColor(aShop)}`}>
                        {renderShiftCell(aShop)}
                      </td>
                      <td className={`px-4 py-3 text-sm border ${getShiftColor(aPost)}`}>
                        {renderShiftCell(aPost)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {employees.map(emp => {
            // Exakt dieselbe Rechnung wie im Generator - eine Quelle, lib/planner.ts
            const shiftHours = shifts
              .filter(s => s.employee_id === emp.id)
              .reduce((acc, s) => acc + getShiftDuration(s.shift_type), 0)
            const vacHours = computeVacationHours([emp], blockers)[emp.id] || 0
            const hours = shiftHours + vacHours
            const target = getTargetHours(emp.name) || emp.target_hours || 0
            const max = getMaxHours(emp.name)
            const over = max !== null && hours > max

            return (
              <div key={emp.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{emp.name}</span>
                  <span className={`text-sm ${over ? 'text-red-600 font-semibold' : hours >= target ? 'text-green-600' : 'text-gray-500'}`}>
                    {hours}h / {target}h
                  </span>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${over ? 'bg-red-600' : 'bg-blue-600'}`}
                    style={{ width: `${Math.min((hours / Math.max(target, 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {shiftHours}h gearbeitet
                  {vacHours > 0 && <> · {vacHours}h Urlaub</>}
                  {max !== null && <> · max {max}h</>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">
              {schedule?.status === 'published' ? 'Plan erneut senden?' : 'Plan veröffentlichen?'}
            </h3>
            <p className="text-gray-600 mb-6">
              {schedule?.status === 'published'
                ? 'Alle Mitarbeiterinnen bekommen den aktuellen Stand noch einmal per E-Mail. Nutze das, wenn du nach dem Veröffentlichen noch etwas geändert hast.'
                : 'Der Dienstplan wird für alle Mitarbeiterinnen sichtbar und per E-Mail versendet.'}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Abbrechen
              </button>
              <button
                onClick={publishPlan}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                {schedule?.status === 'published' ? 'Erneut senden' : 'Veröffentlichen & E-Mail senden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Plan löschen?</h3>
            <p className="text-gray-600 mb-6">
              Alle Schichten für diesen Monat werden gelöscht. Dies kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Abbrechen
              </button>
              <button
                onClick={deletePlan}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function renderShiftCell(shift: Shift | undefined) {
    if (!shift) return '-'
    
    if (editingShift === shift.id) {
      const options = getEmployeeOptions(shift)
      return (
        <div className="flex items-center space-x-2">
          <select
            className="text-sm border rounded px-2 py-1"
            onChange={(e) => updateShift(shift.id, e.target.value || null)}
            defaultValue={shift.employee_id || ''}
          >
            <option value="">OFFEN</option>
            {options.map(({ emp, note, blocking }) => (
              <option key={emp.id} value={emp.id} disabled={blocking}>
                {emp.name}{note ? ` — ${note}` : ''}
              </option>
            ))}
          </select>
          <button onClick={() => setEditingShift(null)} className="text-xs text-gray-500">
            ✕
          </button>
        </div>
      )
    }
    
    return (
      <div 
        className="cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 -my-1"
        onClick={() => setEditingShift(shift.id)}
      >
        {shift.is_open ? 'OFFEN' : shift.employee?.name || '-'}
      </div>
    )
  }
}