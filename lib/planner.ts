// @ts-nocheck
// ============================================================
// PLANER - reine Funktion, keine Datenbank, keine Seiteneffekte.
// Dadurch gegen echte Daten testbar (siehe scripts/test-planner.mjs).
// ============================================================

import {
  FIXED_SLOTS,
  GENERAL_POOL_NAMES,
  SPRINGER_NAME,
  SATURDAY_MAX_NORMAL,
  SATURDAY_MAX_OVERFLOW,
  VACATION_HOURS_PER_DAY,
  DAY_KEY,
  getShiftDuration,
  getMaxHours,
  getOverflowHours,
  getDayOfWeek,
  toISODate,
  daysInMonth,
  parseISODate,
  countsAsVacationDay,
} from './rules'

// ------------------------------------------------------------
// Urlaubsstunden pro Person fuer einen Monat.
// Deduppliziert doppelte Datenbankzeilen, zaehlt nur echte
// Arbeitstage der Person und deckelt zusaetzlich auf die Kappe,
// damit ein Datenfehler den Monat nicht mehr sprengen kann.
// ------------------------------------------------------------
export function computeVacationHours(employees, blockers) {
  const out = {}
  for (const emp of employees) {
    const days = new Set(
      blockers
        .filter((b) => b.employee_id === emp.id && b.type === 'vacation' && !b.shift_type)
        .map((b) => b.date)
    )
    let h = 0
    for (const d of days) if (countsAsVacationDay(emp, d)) h += VACATION_HOURS_PER_DAY
    const cap = getMaxHours(emp.name)
    out[emp.id] = cap === null ? h : Math.min(h, cap)
  }
  return out
}

export function buildPlan({ month, employees, blockers }) {
  const warnings = []
  const { y: year, m: monthNum } = parseISODate(month)
  const totalDays = daysInMonth(year, monthNum)

  const byName = (n) => employees.find((e) => e.name === n)

  // --- Blocker-Indizes ---
  const fullDayBlock = new Set(
    blockers.filter((b) => !b.shift_type).map((b) => `${b.employee_id}|${b.date}`)
  )
  const shiftBlock = new Set(
    blockers.filter((b) => b.shift_type).map((b) => `${b.employee_id}|${b.date}|${b.shift_type}`)
  )
  const isBlocked = (empId, dateStr, shiftType) =>
    fullDayBlock.has(`${empId}|${dateStr}`) ||
    (!!shiftType && shiftBlock.has(`${empId}|${dateStr}|${shiftType}`))

  // --- Stundenkonten ---
  const vacationHours = computeVacationHours(employees, blockers)
  const hours = {}
  const saturdays = {}
  const assignedToday = {}
  for (const e of employees) {
    hours[e.id] = vacationHours[e.id] || 0
    saturdays[e.id] = 0
  }

  const assignments = []

  const wouldExceed = (emp, shiftType, overflow) => {
    const cap = overflow ? getOverflowHours(emp.name) : getMaxHours(emp.name)
    if (cap === null) return false
    return hours[emp.id] + getShiftDuration(shiftType) > cap
  }

  const assign = (dateStr, shiftType, area, emp) => {
    assignments.push({
      date: dateStr,
      shift_type: shiftType,
      area,
      employee_id: emp.id,
      is_open: false,
    })
    hours[emp.id] += getShiftDuration(shiftType)
    if (!assignedToday[dateStr]) assignedToday[dateStr] = new Set()
    assignedToday[dateStr].add(emp.id)
    if (shiftType === 'saturday') saturdays[emp.id] += 1
  }

  // Grundvoraussetzungen, die IMMER gelten - auch im Notfall.
  const canWork = (emp, dateStr, shiftType, area, overflow = false) => {
    if (isBlocked(emp.id, dateStr, shiftType)) return false
    if (assignedToday[dateStr]?.has(emp.id)) return false
    if (emp.qualification !== 'both' && emp.qualification !== area) return false

    const dow = getDayOfWeek(dateStr)
    const key = DAY_KEY[dow]
    const availKey = shiftType === 'saturday' ? 'sat_morning' : `${key}_${shiftType}`
    if (emp.availability && emp.availability[availKey] !== true) return false

    // Peter ist Montag- und Donnerstagnachmittag hart gesperrt.
    if (emp.name === SPRINGER_NAME && shiftType === 'afternoon' && (dow === 1 || dow === 4))
      return false

    const satMax = overflow ? SATURDAY_MAX_OVERFLOW : SATURDAY_MAX_NORMAL
    if (shiftType === 'saturday' && saturdays[emp.id] >= satMax) return false

    return true
  }

  // Wer am weitesten von seiner Kappe entfernt ist, kommt zuerst.
  const score = (emp) => {
    const cap = getMaxHours(emp.name) ?? 0
    return cap - hours[emp.id]
  }

  const pickBest = (cands) => {
    if (!cands.length) return null
    return cands.slice().sort((a, b) => score(b) - score(a))[0]
  }

  const isZigarette = (dow, shiftType, area) =>
    (dow === 1 || dow === 4) && shiftType === 'morning' && area === 'shop'

  // --- Alle Slots des Monats aufbauen ---
  const slots = []
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = toISODate(year, monthNum, d)
    const dow = getDayOfWeek(dateStr)
    if (dow === 0) continue
    const shiftTypes = dow === 6 ? ['saturday'] : ['morning', 'afternoon']
    for (const shiftType of shiftTypes) {
      for (const area of ['shop', 'post']) {
        slots.push({ dateStr, dow, shiftType, area, filled: false })
      }
    }
  }

  // ============================================================
  // DURCHGANG 1 - feste Slots
  // ============================================================
  for (const s of slots) {
    if (s.dow === 6) continue
    const name = FIXED_SLOTS[s.dow]?.[s.shiftType]?.[s.area]
    if (!name) continue
    const emp = byName(name)
    if (!emp) {
      warnings.push(`Fixslot ${s.dateStr} ${s.shiftType}/${s.area}: "${name}" nicht gefunden`)
      continue
    }
    if (isBlocked(emp.id, s.dateStr, s.shiftType)) continue
    if (assignedToday[s.dateStr]?.has(emp.id)) continue
    if (wouldExceed(emp, s.shiftType, false)) continue
    assign(s.dateStr, s.shiftType, s.area, emp)
    s.filled = true
  }

  // ============================================================
  // DURCHGANG 2 - Zigarettenslots (Mo/Do vormittags Laden: nur Belli oder Peter)
  // ============================================================
  for (const s of slots) {
    if (s.filled || s.dow === 6) continue
    if (!isZigarette(s.dow, s.shiftType, s.area)) continue
    for (const n of ['Belli', SPRINGER_NAME]) {
      const emp = byName(n)
      if (emp && canWork(emp, s.dateStr, s.shiftType, s.area) && !wouldExceed(emp, s.shiftType, false)) {
        assign(s.dateStr, s.shiftType, s.area, emp)
        s.filled = true
        break
      }
    }
  }

  // ============================================================
  // DURCHGANG 3 - allgemeiner Pool im Normalbetrieb
  // ============================================================
  for (const s of slots) {
    if (s.filled) continue
    if (s.dow !== 6 && isZigarette(s.dow, s.shiftType, s.area)) continue
    const cands = employees
      .filter((e) => GENERAL_POOL_NAMES.includes(e.name))
      .filter((e) => canWork(e, s.dateStr, s.shiftType, s.area))
      .filter((e) => !wouldExceed(e, s.shiftType, false))
    const pick = pickBest(cands)
    if (pick) {
      assign(s.dateStr, s.shiftType, s.area, pick)
      s.filled = true
    }
  }

  // ============================================================
  // DURCHGANG 4 - Peter als Springer im Normalbetrieb
  // ============================================================
  for (const s of slots) {
    if (s.filled) continue
    const peter = byName(SPRINGER_NAME)
    if (peter && canWork(peter, s.dateStr, s.shiftType, s.area) && !wouldExceed(peter, s.shiftType, false)) {
      assign(s.dateStr, s.shiftType, s.area, peter)
      s.filled = true
    }
  }

  // ============================================================
  // DURCHGANG 5 - Notfall: Fixkraefte an ihren erlaubten Tagen.
  // Kappe bleibt HART. Cindy kommt hier nie ueber 25h.
  // ============================================================
  const fixedOnly = employees.filter(
    (e) => !GENERAL_POOL_NAMES.includes(e.name) && e.name !== SPRINGER_NAME
  )
  for (const s of slots) {
    if (s.filled) continue
    const cands = fixedOnly
      .filter((e) => canWork(e, s.dateStr, s.shiftType, s.area))
      .filter((e) => !wouldExceed(e, s.shiftType, false))
    const pick = pickBest(cands)
    if (pick) {
      assign(s.dateStr, s.shiftType, s.area, pick)
      s.filled = true
      warnings.push(`Notfall: ${pick.name} zusaetzlich am ${s.dateStr} ${s.shiftType}/${s.area}`)
    }
  }

  // ============================================================
  // DURCHGANG 6 - Notreserve: Belli bis 150h, Peter bis 110h,
  // Samstagsrotation ausnahmsweise bis 3. Nur fuer Slots, die
  // sonst OFFEN blieben.
  // ============================================================
  for (const s of slots) {
    if (s.filled) continue
    const cands = employees
      .filter((e) => getOverflowHours(e.name) > getMaxHours(e.name) || e.name === SPRINGER_NAME)
      .filter((e) => canWork(e, s.dateStr, s.shiftType, s.area, true))
      .filter((e) => !wouldExceed(e, s.shiftType, true))
    const pick = pickBest(cands)
    if (pick) {
      assign(s.dateStr, s.shiftType, s.area, pick)
      s.filled = true
      warnings.push(`Notreserve: ${pick.name} am ${s.dateStr} ${s.shiftType}/${s.area}`)
    }
  }

  // ============================================================
  // Rest bleibt ehrlich OFFEN
  // ============================================================
  for (const s of slots) {
    if (s.filled) continue
    assignments.push({
      date: s.dateStr,
      shift_type: s.shiftType,
      area: s.area,
      employee_id: null,
      is_open: true,
    })
  }

  assignments.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.shift_type.localeCompare(b.shift_type) ||
      a.area.localeCompare(b.area)
  )

  return {
    assignments,
    hours,
    vacationHours,
    warnings,
    validation: validatePlan({ assignments, employees, blockers, slots, hours }),
  }
}

// ------------------------------------------------------------
// SELBSTKONTROLLE - laeuft bei jeder Generierung.
// Findet sie einen Fehler, wird nichts gespeichert.
// ------------------------------------------------------------
export function validatePlan({ assignments, employees, blockers, slots, hours }) {
  const errors = []
  const byId = Object.fromEntries(employees.map((e) => [e.id, e]))

  // 1. Jeder Slot genau einmal
  const seen = new Set()
  for (const a of assignments) {
    const k = `${a.date}|${a.shift_type}|${a.area}`
    if (seen.has(k)) errors.push(`Slot doppelt belegt: ${k}`)
    seen.add(k)
  }
  if (slots && assignments.length !== slots.length)
    errors.push(`Slotanzahl falsch: ${assignments.length} statt ${slots.length}`)

  // 2. Niemand zweimal am selben Tag
  const perDay = {}
  for (const a of assignments) {
    if (!a.employee_id) continue
    const k = `${a.employee_id}|${a.date}`
    perDay[k] = (perDay[k] || 0) + 1
    if (perDay[k] > 1) errors.push(`${byId[a.employee_id]?.name} doppelt am ${a.date}`)
  }

  // 3. Keine Kappe gesprengt
  for (const e of employees) {
    const cap = getOverflowHours(e.name)
    if (cap !== null && (hours[e.id] || 0) > cap)
      errors.push(`${e.name}: ${hours[e.id]}h ueber Obergrenze ${cap}h`)
  }

  // 4. Niemand an einem Blockertag oder im Urlaub eingeplant
  const blocked = new Set(
    blockers.filter((b) => !b.shift_type).map((b) => `${b.employee_id}|${b.date}`)
  )
  const blockedShift = new Set(
    blockers.filter((b) => b.shift_type).map((b) => `${b.employee_id}|${b.date}|${b.shift_type}`)
  )
  for (const a of assignments) {
    if (!a.employee_id) continue
    if (blocked.has(`${a.employee_id}|${a.date}`))
      errors.push(`${byId[a.employee_id]?.name} am ${a.date} eingeplant trotz Blocker/Urlaub`)
    if (blockedShift.has(`${a.employee_id}|${a.date}|${a.shift_type}`))
      errors.push(`${byId[a.employee_id]?.name} am ${a.date} ${a.shift_type} trotz Schichtblocker`)
  }

  // 5. Qualifikation eingehalten
  for (const a of assignments) {
    if (!a.employee_id) continue
    const e = byId[a.employee_id]
    if (e && e.qualification !== 'both' && e.qualification !== a.area)
      errors.push(`${e.name} am ${a.date} im Bereich ${a.area} ohne Qualifikation`)
  }

  return { ok: errors.length === 0, errors }
}
