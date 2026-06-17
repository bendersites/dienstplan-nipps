import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

type Employee = {
  id: string
  name: string
  qualification: 'shop' | 'post' | 'both'
  target_hours: number
  availability: Record<string, boolean>
}

type Blocker = {
  employee_id: string
  date: string
}

type ShiftAssignment = {
  date: string
  shift_type: 'morning' | 'afternoon' | 'saturday'
  area: 'shop' | 'post'
  employee_id: string | null
  is_open: boolean
}

const MAX_HOURS: Record<string, number> = {
  'Cindy': 25,
  'Anni': 40,
  'Marika': 40,
  'Ines': 80,
  'Belli': 135,
  'Gudrun': 130,
  'Peter': 70
}

export async function POST(request: NextRequest) {
  try {
    const { month, scheduleId } = await request.json()
    const supabase = createServerClient()

    const { data: employeesData } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)

    const { data: blockersData } = await supabase
      .from('blocker_days')
      .select('employee_id, date')
      .gte('date', month)
      .lt('date', getNextMonth(month))

    const employees = employeesData as Employee[] || []
    const blockers = blockersData as Blocker[] || []
    const blockerSet = new Set(blockers.map(b => `${b.employee_id}|${b.date}`))

    const year = parseInt(month.split('-')[0])
    const mon = parseInt(month.split('-')[1]) - 1
    const daysInMonth = new Date(year, mon + 1, 0).getDate()
    
    const assignments: ShiftAssignment[] = []
    const employeeHours: Record<string, number> = {}
    const assignedToday: Record<string, Set<string>> = {}
    
    employees.forEach(e => {
      employeeHours[e.id] = 0
    })

    const isBlocked = (empId: string, dateStr: string) => 
      blockerSet.has(`${empId}|${dateStr}`)

    const getShiftDuration = (shiftType: string) => 
      shiftType === 'saturday' ? 6 : 5

    const getMaxHours = (emp: Employee): number => {
      return MAX_HOURS[emp.name] !== undefined ? MAX_HOURS[emp.name] : emp.target_hours
    }

    const hasReachedMaxHours = (emp: Employee): boolean => {
      return employeeHours[emp.id] >= getMaxHours(emp)
    }

    const isAlreadyAssignedToday = (empId: string, dateStr: string): boolean => {
      return assignedToday[dateStr]?.has(empId) || false
    }

    const getEmployeeByName = (name: string): Employee | undefined => {
      return employees.find(e => e.name === name)
    }

    const addAssignment = (dateStr: string, shiftType: string, area: 'shop' | 'post', emp: Employee) => {
      assignments.push({
        date: dateStr,
        shift_type: shiftType as 'morning' | 'afternoon' | 'saturday',
        area,
        employee_id: emp.id,
        is_open: false
      })
      employeeHours[emp.id] += getShiftDuration(shiftType)
      if (!assignedToday[dateStr]) assignedToday[dateStr] = new Set()
      assignedToday[dateStr].add(emp.id)
    }

    const addOpen = (dateStr: string, shiftType: string, area: 'shop' | 'post') => {
      assignments.push({
        date: dateStr,
        shift_type: shiftType as 'morning' | 'afternoon' | 'saturday',
        area,
        employee_id: null,
        is_open: true
      })
    }

    const canWork = (emp: Employee, dateStr: string, shiftType: string, area: 'shop' | 'post') => {
      if (isBlocked(emp.id, dateStr)) return false
      if (isAlreadyAssignedToday(emp.id, dateStr)) return false
      if (emp.qualification !== 'both' && emp.qualification !== area) return false
      
      const dayOfWeek = new Date(dateStr).getDay()
      const dayMap: Record<number, string> = {1:'mon', 2:'tue', 3:'wed', 4:'thu', 5:'fri', 6:'sat'}
      const dayKey = dayMap[dayOfWeek]
      const availKey = shiftType === 'saturday' ? 'sat_morning' : `${dayKey}_${shiftType === 'morning' ? 'morning' : 'afternoon'}`
      
      if (emp.availability && !emp.availability[availKey]) return false
      
      return true
    }

    const scoreCandidate = (emp: Employee, dateStr: string, shiftType: string, area: 'shop' | 'post', isZigaretteDay: boolean) => {
      let score = 0
      const target = emp.target_hours
      const remaining = target - employeeHours[emp.id]
      const currentHours = employeeHours[emp.id]
      
      if (remaining > 0) score += remaining * 50
      if (currentHours >= target && target > 0) score -= 5000
      if (emp.name === 'Peter') score -= 500
      if (isZigaretteDay && emp.name === 'Belli') score += 500
      
      return score
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const date = new Date(dateStr)
      const dayOfWeek = date.getDay()
      
      if (dayOfWeek === 0) continue
      
      const isSat = dayOfWeek === 6
      const shiftTypes: ('morning' | 'afternoon' | 'saturday')[] = isSat 
        ? ['saturday'] 
        : ['morning', 'afternoon']
      const areas: ('shop' | 'post')[] = ['shop', 'post']
      
      for (const shiftType of shiftTypes) {
        for (const area of areas) {
          let assigned = false
          
          // Cindy: Freitag Vormittag Laden
          if (dayOfWeek === 5 && shiftType === 'morning' && area === 'shop') {
            const cindy = getEmployeeByName('Cindy')
            if (cindy && !isBlocked(cindy.id, dateStr) && !hasReachedMaxHours(cindy)) {
              addAssignment(dateStr, shiftType, area, cindy)
              assigned = true
            }
          }
          
          // Anni: Montag Vormittag Post
          if (dayOfWeek === 1 && shiftType === 'morning' && area === 'post') {
            const anni = getEmployeeByName('Anni')
            if (anni && !isBlocked(anni.id, dateStr) && !hasReachedMaxHours(anni)) {
              addAssignment(dateStr, shiftType, area, anni)
              assigned = true
            }
          }
          
         // Peter: Montag Vormittag Laden (Springer-Priorität)
          if (dayOfWeek === 1 && shiftType === 'morning' && area === 'shop') {
            const peter = getEmployeeByName('Peter')
            if (peter && !isBlocked(peter.id, dateStr) && !hasReachedMaxHours(peter) && !isAlreadyAssignedToday(peter.id, dateStr)) {
              addAssignment(dateStr, shiftType, area, peter)
              assigned = true
            }
          }// Marika: Mittwoch + Freitag Nachmittag Laden
          if ((dayOfWeek === 3 || dayOfWeek === 5) && shiftType === 'afternoon' && area === 'shop') {
            const marika = getEmployeeByName('Marika')
            if (marika && !isBlocked(marika.id, dateStr) && !hasReachedMaxHours(marika) && !isAlreadyAssignedToday(marika.id, dateStr)) {
              addAssignment(dateStr, shiftType, area, marika)
              assigned = true
            }
          }
          
          // Peter: Donnerstag Vormittag Laden
          if (dayOfWeek === 4 && shiftType === 'morning' && area === 'shop') {
            const peter = getEmployeeByName('Peter')
            if (peter && !isBlocked(peter.id, dateStr) && !hasReachedMaxHours(peter) && !isAlreadyAssignedToday(peter.id, dateStr)) {
              addAssignment(dateStr, shiftType, area, peter)
              assigned = true
            }
          }
          
          if (assigned) continue
          
          const alreadyAssigned = assignments.some(a => 
            a.date === dateStr && a.shift_type === shiftType && a.area === area && !a.is_open
          )
          if (alreadyAssigned) continue
          
          const isZigaretteDay = (dayOfWeek === 1 || dayOfWeek === 4) && shiftType === 'morning' && area === 'shop'
          
          let candidates = employees
            .filter(e => canWork(e, dateStr, shiftType, area))
            .filter(e => !hasReachedMaxHours(e))
            .sort((a, b) => scoreCandidate(b, dateStr, shiftType, area, isZigaretteDay) - scoreCandidate(a, dateStr, shiftType, area, isZigaretteDay))
          
          if (isZigaretteDay) {
            const bellis = candidates.filter(e => e.name === 'Belli')
            if (bellis.length > 0) candidates = bellis
          }
          
          const selected = candidates[0]
          
          if (selected) {
            addAssignment(dateStr, shiftType, area, selected)
          } else {
            const peter = getEmployeeByName('Peter')
            if (peter && canWork(peter, dateStr, shiftType, area) && !hasReachedMaxHours(peter)) {
              addAssignment(dateStr, shiftType, area, peter)
            } else {
              addOpen(dateStr, shiftType, area)
            }
          }
        }
      }
    }

    await supabase.from('shifts').delete().eq('schedule_id', scheduleId)
    
    const shiftsToInsert = assignments.map(a => ({
      date: a.date,
      shift_type: a.shift_type,
      area: a.area,
      employee_id: a.employee_id,
      schedule_id: scheduleId,
      is_open: a.is_open
    }))
    
    await supabase.from('shifts').insert(shiftsToInsert)

    return NextResponse.json({ 
      success: true,
      stats: {
        total: assignments.length,
        open: assignments.filter(a => a.is_open).length,
        hours: employeeHours
      }
    })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}

function getNextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const next = new Date(year, mon, 1)
  return next.toISOString().split('T')[0]
}
