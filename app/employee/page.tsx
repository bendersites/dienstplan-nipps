'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, addMonths } from 'date-fns'
import { Calendar, AlertCircle, LogOut, CheckCircle } from 'lucide-react'

type Shift = {
  id: string
  date: string
  shift_type: string
  area: string
}

type Blocker = {
  id: string
  date: string
  reason: string | null
}

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
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }
    setUser(user)
    await fetchData(user.email)
  }

  async function fetchData(email: string) {
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('email', email)
      .single()

    if (!emp) return
    setEmployee(emp)
    setConfirmed(emp.blocker_confirmed && emp.blocker_confirmed_month === nextMonth)

    const now = new Date()
    const monthStart = startOfMonth(now)
    const { data: schedule } = await supabase
      .from('schedules')
      .select('id')
      .eq('month', format(monthStart, 'yyyy-MM-dd'))
      .eq('status', 'published')
      .single()

    if (schedule) {
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*')
        .eq('schedule_id', schedule.id)
        .eq('employee_id', emp.id)
        .order('date')
      setShifts(shiftData || [])
    }

    const { data: blockerData } = await supabase
      .from('blocker_days')
      .select('*')
      .eq('employee_id', emp.id)
      .gte('date', format(new Date(), 'yyyy-MM-dd'))
      .order('date')

    setBlockers(blockerData || [])
    setLoading(false)
  }

  async function addBlocker() {
    if (!newBlockerDate || !user || !employee) return
    await supabase.from('blocker_days').insert({
      employee_id: employee.id,
      date: newBlockerDate,
      reason: newBlockerReason || null
    })
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
    await supabase
      .from('employees')
      .update({ blocker_confirmed: true, blocker_confirmed_month: nextMonth })
      .eq('id', employee.id)
    setConfirmed(true)
    await fetch('/api/check-blockers', { method: 'POST' })
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Lädt...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Mein Dienstplan</h1>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            Aktueller Monat
          </h2>
          {shifts.length === 0 ? (
            <p className="text-gray-500">Noch kein Plan veröffentlicht.</p>
          ) : (
            <div className="space-y-2">
              {shifts.map(shift => (
                <div key={shift.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-md">
                  <span className="font-medium">{format(new Date(shift.date), 'dd.MM.yyyy')}</span>
                  <span className="text-sm text-gray-600">
                    {shift.shift_type === 'morning' ? 'Vormittag' :
                     shift.shift_type === 'afternoon' ? 'Nachmittag' : 'Samstag'}
                    {' '}({shift.area === 'shop' ? 'Laden' : 'Post'})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-1 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            Blockertage für {nextMonthLabel}
          </h2>
          <p className="text-sm text-gray-500 mb-4">Bitte bis zum 24. des Monats eintragen.</p>

          {confirmed ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-md text-green-700 mb-4">
              <CheckCircle className="w-5 h-5" />
              <span>Du hast bestätigt, dass du keine Blockertage für {nextMonthLabel} hast.</span>
            </div>
          ) : (
            <button
              onClick={confirmNoBlockers}
              className="w-full py-2 mb-4 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Ich habe keine Blockertage für {nextMonthLabel}
            </button>
          )}

          <div className="space-y-3 mb-4">
            <input
              type="date"
              value={newBlockerDate}
              onChange={(e) => setNewBlockerDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              min={format(new Date(), 'yyyy-MM-dd')}
            />
            <select
              value={newBlockerReason}
              onChange={(e) => setNewBlockerReason(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="">Grund (optional)</option>
              <option value="Arzttermin">Arzttermin</option>
              <option value="Kinderbetreuung">Kinderbetreuung</option>
              <option value="Privat">Privat</option>
            </select>
            <button
              onClick={addBlocker}
              className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Blockertag eintragen
            </button>
          </div>

          <div className="space-y-2">
            {blockers.map(blocker => (
              <div key={blocker.id} className="flex items-center justify-between p-3 bg-red-50 rounded-md">
                <div>
                  <span className="font-medium">{format(new Date(blocker.date), 'dd.MM.yyyy')}</span>
                  {blocker.reason && <span className="text-sm text-gray-600 ml-2">({blocker.reason})</span>}
                </div>
                <button
                  onClick={() => removeBlocker(blocker.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Löschen
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
