// @ts-nocheck

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { 
  ChevronLeft, 
  ChevronRight, 
  Mail,
  AlertCircle,
  Settings,
  LogOut,
  Trash2,
  Save
} from 'lucide-react'
import { getMonthDays, getDayName, isSaturday } from '@/lib/utils'

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
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [openShifts, setOpenShifts] = useState(0)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingShift, setEditingShift] = useState<string | null>(null)

  const monthStart = startOfMonth(currentDate)
  const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth())

  useEffect(() => {
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
    
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: format(monthStart, 'yyyy-MM-dd'),
          scheduleId: schedule?.id
        })
      })

      if (response.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error('Fehler:', error)
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
    const dayOfWeek = new Date(shift.date).getDay()
    const shiftType = shift.shift_type
    
    return employees.filter(e => {
      // Qualification check
      if (e.qualification !== 'both' && e.qualification !== shift.area) return false
      
      // Special rules
      if (e.name === 'Cindy') {
        if (dayOfWeek !== 5 || shiftType !== 'morning' || shift.area !== 'shop') return false
      }
      if (e.name === 'Marika') {
        if ((dayOfWeek !== 3 && dayOfWeek !== 5) || shift.area !== 'shop') return false
        if (shiftType === 'afternoon') return false
      }
      if (e.name === 'Anni' && shift.area !== 'post') return false
      if (e.name === 'Ines' && shift.area !== 'post') return false
      if (e.name === 'Peter') {
        if (dayOfWeek === 1 && shiftType === 'afternoon') return false
        if (dayOfWeek === 4 && shiftType === 'afternoon') return false
      }
      
      return true
    })
  }

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
                onClick={() => supabase.auth.signOut()}
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
                      <tr key={day.toISOString()}>
                        <td className="px-4 py-3 text-sm font-medium">
                          {format(day, 'dd.MM.')} {getDayName(day)}
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
                    <tr key={day.toISOString()}>
                      <td className="px-4 py-3 text-sm font-medium">
                        {format(day, 'dd.MM.')} {getDayName(day)}
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
            const empShifts = shifts.filter(s => s.employee_id === emp.id)
            const hours = empShifts.reduce((acc, s) => {
              if (s.shift_type === 'saturday') return acc + 6
              return acc + 5
            }, 0)
            
            return (
              <div key={emp.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{emp.name}</span>
                  <span className={`text-sm ${hours >= emp.target_hours ? 'text-green-600' : 'text-gray-500'}`}>
                    {hours}h / {emp.target_hours}h
                  </span>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((hours / Math.max(emp.target_hours, 1)) * 100, 100)}%` }}
                  />
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
            <h3 className="text-lg font-medium mb-4">Plan veröffentlichen?</h3>
            <p className="text-gray-600 mb-6">
              Der Dienstplan wird für alle Mitarbeiterinnen sichtbar und per E-Mail versendet.
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
                Veröffentlichen & E-Mail senden
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
      const availableEmps = getAvailableEmployees(shift)
      return (
        <div className="flex items-center space-x-2">
          <select
            className="text-sm border rounded px-2 py-1"
            onChange={(e) => updateShift(shift.id, e.target.value || null)}
            defaultValue={shift.employee_id || ''}
          >
            <option value="">OFFEN</option>
            {availableEmps.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
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