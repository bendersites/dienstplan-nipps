// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Harte Stundenkappen für ALLE Mitarbeiterinnen – keine Ausnahmen.
const MAX_HOURS = {
  'Cindy': 25, 'Anni': 40, 'Marika': 40,
  'Ines': 80, 'Belli': 135, 'Gudrun': 120, 'Peter': 70
}

// Wer darf in den allgemeinen Lückenfüll-Pool (nicht-fixe Slots)
const GENERAL_POOL_NAMES = ['Gudrun', 'Belli', 'Ines']

// Fixe Slots: dayOfWeek (1=Mo..5=Fr) -> shiftType -> area -> Name
const FIXED_SLOTS = {
  1: { morning: { shop: 'Belli', post: 'Anni' }, afternoon: { shop: 'Gudrun', post: 'Ines' } },
  2: { morning: { shop: 'Gudrun', post: 'Ines' }, afternoon: { post: 'Belli' } },
  3: { morning: { shop: 'Gudrun' }, afternoon: { shop: 'Marika', post: 'Belli' } },
  4: { morning: { post: 'Belli' }, afternoon: { shop: 'Gudrun', post: 'Ines' } },
  5: { morning: { shop: 'Cindy', post: 'Belli' }, afternoon: { shop: 'Marika', post: 'Gudrun' } },
}

export async function POST(request) {
  try {
    const { month, scheduleId } = await request.json()
    const supabase = createServerClient()

    const { data: employeesData } = await supabase.from('employees').select('*').eq('active', true)
    const { data: blockersData } = await supabase
      .from('blocker_days').select('employee_id, date, type')
      .gte('date', month).lt('date', getNextMonth(month))

    const employees = employeesData || []
    const blockers = blockersData || []

    // Urlaubstage vorab als Stunden anrechnen
    const vacationHours = {}
    employees.forEach(e => { vacationHours[e.id] = 0 })
    blockers.filter(b => b.type === 'vacation').forEach(b => {
      if (vacationHours[b.employee_id] !== undefined) vacationHours[b.employee_id] += 5
    })

    const blockerSet = new Set(blockers.map(b => `${b.employee_id}|${b.date}`))

    const year = parseInt(month.split('-')[0])
    const mon = parseInt(month.split('-')[1]) - 1
    const daysInMonth = new Date(year, mon + 1, 0).getDate()

    const assignments = []
    const employeeHours = {}
    const assignedToday = {}
    const saturdayCount = {}

    employees.forEach(e => {
      employeeHours[e.id] = vacationHours[e.id] || 0
      saturdayCount[e.id] = 0
    })

    const isBlocked = (empId, dateStr) => blockerSet.has(`${empId}|${dateStr}`)
    const getShiftDuration = (shiftType) => shiftType === 'saturday' ? 6 : 5

    // Prüft VOR der Zuweisung ob diese Schicht die Kappe sprengt.
    // Gilt für ALLE – auch Cindy/Anni/Marika über ihre fixen Slots.
    const wouldExceedMax = (emp, shiftType) => {
      const cap = MAX_HOURS[emp.name]
      if (cap === undefined) return false
      return (employeeHours[emp.id] + getShiftDuration(shiftType)) > cap
    }

    const isAlreadyAssignedToday = (empId, dateStr) => assignedToday[dateStr]?.has(empId) || false
    const getEmployeeByName = (name) => employees.find(e => e.name === name)

    const addAssignment = (dateStr, shiftType, area, emp) => {
      assignments.push({ date: dateStr, shift_type: shiftType, area, employee_id: emp.id, is_open: false })
      employeeHours[emp.id] += getShiftDuration(shiftType)
      if (!assignedToday[dateStr]) assignedToday[dateStr] = new Set()
      assignedToday[dateStr].add(emp.id)
      if (shiftType === 'saturday') saturdayCount[emp.id] = (saturdayCount[emp.id] || 0) + 1
    }

    const addOpen = (dateStr, shiftType, area) => {
      assignments.push({ date: dateStr, shift_type: shiftType, area, employee_id: null, is_open: true })
    }

    const canWork = (emp, dateStr, shiftType, area) => {
      if (isBlocked(emp.id, dateStr)) return false
      if (isAlreadyAssignedToday(emp.id, dateStr)) return false
      if (emp.qualification !== 'both' && emp.qualification !== area) return false
      const dayOfWeek = new Date(dateStr).getDay()
      const dayMap = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
      const dayKey = dayMap[dayOfWeek]
      const availKey = shiftType === 'saturday' ? 'sat_morning' : `${dayKey}_${shiftType === 'morning' ? 'morning' : 'afternoon'}`
      if (emp.availability && !emp.availability[availKey]) return false
      if (emp.name === 'Peter' && shiftType === 'afternoon' && (dayOfWeek === 1 || dayOfWeek === 4)) return false
      if (shiftType === 'saturday' && saturdayCount[emp.id] >= 2) return false
      return true
    }

    const scoreCandidate = (emp) => {
      let score = 0
      const cap = MAX_HOURS[emp.name] || emp.target_hours
      const remaining = cap - employeeHours[emp.id]
      if (remaining > 0) score += remaining * 50
      if (employeeHours[emp.id] >= cap) score -= 5000
      return score
    }

    const isZigaretteSlot = (dayOfWeek, shiftType, area) =>
      (dayOfWeek === 1 || dayOfWeek === 4) && shiftType === 'morning' && area === 'shop'

    const tryFixedAssignment = (dateStr, dayOfWeek, shiftType, area) => {
      const name = FIXED_SLOTS[dayOfWeek]?.[shiftType]?.[area]
      if (!name) return false
      const emp = getEmployeeByName(name)
      if (!emp) return false
      if (isBlocked(emp.id, dateStr)) return false
      if (isAlreadyAssignedToday(emp.id, dateStr)) return false
      if (wouldExceedMax(emp, shiftType)) return false  // Kappe gilt auch für fixe Slots
      addAssignment(dateStr, shiftType, area, emp)
      return true
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const date = new Date(dateStr)
      const dayOfWeek = date.getDay()
      if (dayOfWeek === 0) continue

      const isSat = dayOfWeek === 6
      const shiftTypes = isSat ? ['saturday'] : ['morning', 'afternoon']
      const areas = ['shop', 'post']

      // PASS 1: fixe Slots zuerst
      if (!isSat) {
        for (const shiftType of shiftTypes) {
          for (const area of areas) {
            tryFixedAssignment(dateStr, dayOfWeek, shiftType, area)
          }
        }
      }

      // PASS 2: offene Slots füllen
      for (const shiftType of shiftTypes) {
        for (const area of areas) {
          const alreadyAssigned = assignments.some(a =>
            a.date === dateStr && a.shift_type === shiftType && a.area === area && !a.is_open
          )
          if (alreadyAssigned) continue

          // Zigarettenslot: nur Belli oder Peter
          if (!isSat && isZigaretteSlot(dayOfWeek, shiftType, area)) {
            const belli = getEmployeeByName('Belli')
            const peter = getEmployeeByName('Peter')
            if (belli && canWork(belli, dateStr, shiftType, area) && !wouldExceedMax(belli, shiftType)) {
              addAssignment(dateStr, shiftType, area, belli); continue
            }
            if (peter && canWork(peter, dateStr, shiftType, area) && !wouldExceedMax(peter, shiftType)) {
              addAssignment(dateStr, shiftType, area, peter); continue
            }
            addOpen(dateStr, shiftType, area); continue
          }

          // Allgemeiner Pool: Gudrun, Belli, Ines
          const candidates = employees
            .filter(e => GENERAL_POOL_NAMES.includes(e.name))
            .filter(e => canWork(e, dateStr, shiftType, area))
            .filter(e => !wouldExceedMax(e, shiftType))
            .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))

          if (candidates[0]) {
            addAssignment(dateStr, shiftType, area, candidates[0]); continue
          }

          // Fallback: Peter (nur wenn er sein Limit noch nicht erreicht hat)
          const peter = getEmployeeByName('Peter')
          if (peter && canWork(peter, dateStr, shiftType, area) && !wouldExceedMax(peter, shiftType)) {
            addAssignment(dateStr, shiftType, area, peter); continue
          }

          addOpen(dateStr, shiftType, area)
        }
      }
    }

    await supabase.from('shifts').delete().eq('schedule_id', scheduleId)
    await supabase.from('shifts').insert(assignments.map(a => ({
      date: a.date, shift_type: a.shift_type, area: a.area,
      employee_id: a.employee_id, schedule_id: scheduleId, is_open: a.is_open
    })))

    return NextResponse.json({
      success: true,
      stats: {
        total: assignments.length,
        open: assignments.filter(a => a.is_open).length,
        hours: Object.fromEntries(
          employees.map(e => [e.name, employeeHours[e.id]])
        )
      }
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}

function getNextMonth(month) {
  const [year, mon] = month.split('-').map(Number)
  const next = new Date(year, mon, 1)
  return next.toISOString().split('T')[0]
}
