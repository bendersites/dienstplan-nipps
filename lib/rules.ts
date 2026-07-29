// @ts-nocheck
// ============================================================
// ZENTRALE REGELN - EINZIGE QUELLE DER WAHRHEIT
// Generator (lib/planner.ts) UND Admin-Anzeige nutzen diese Datei.
// Wer hier etwas aendert, aendert es ueberall. Nirgendwo sonst
// duerfen Stundenzahlen oder Fixslots hartkodiert werden.
// ============================================================

// Harte Obergrenze. Wird NIE ueberschritten - auch nicht bei Luecken.
export const MAX_HOURS = {
  Cindy: 25,
  Anni: 40,
  Marika: 40,
  Ines: 80,
  Gudrun: 120,
  Belli: 135,
  Peter: 70,
}

// Notreserve: nur wenn ein Slot sonst OFFEN bleiben wuerde.
// Wer hier nicht steht, hat keine Reserve.
export const OVERFLOW_HOURS = {
  Belli: 150,
  Peter: 110,
}

// Sollstunden fuer die Balkenanzeige im Admin.
export const TARGET_HOURS = {
  Cindy: 25,
  Anni: 40,
  Marika: 40,
  Ines: 80,
  Gudrun: 120,
  Belli: 120,
  Peter: 70,
}

// Wer darf allgemeine Luecken fuellen (nicht-fixe Slots)
export const GENERAL_POOL_NAMES = ['Gudrun', 'Belli', 'Ines']

// Peter ist Springer: kein Pool-Mitglied, aber ueberall einsetzbar als Fallback.
export const SPRINGER_NAME = 'Peter'

// Samstagsrotation
export const SATURDAY_MAX_NORMAL = 2
export const SATURDAY_MAX_OVERFLOW = 3

// Schichtdauer in Stunden
export const SHIFT_HOURS = { morning: 5, afternoon: 5, saturday: 6 }

// Ein Urlaubstag wird mit einer Schicht angerechnet.
export const VACATION_HOURS_PER_DAY = 5

// Bis zu diesem Tag im Monat traegt man fuer den Folgemonat ein.
// Danach ist der Folgemonat durch und es geht um den Monat danach.
export const BLOCKER_DEADLINE_DAY = 24

// Welcher Monat wird gerade geplant? Bis zum 24. der Folgemonat,
// ab dem 25. der uebernaechste. Gibt "YYYY-MM" zurueck.
export function getPlanningMonth(ref = new Date()) {
  const ahead = ref.getDate() > BLOCKER_DEADLINE_DAY ? 2 : 1
  const total = ref.getMonth() + ahead
  return `${ref.getFullYear() + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

// "2026-09" + 2 -> "2026-11", auch rueckwaerts ueber den Jahreswechsel.
// JavaScript rechnet -1 % 12 = -1, deshalb der Zusatz.
export function addMonthsToKey(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number)
  const total = m - 1 + n
  const mod = ((total % 12) + 12) % 12
  return `${y + Math.floor(total / 12)}-${String(mod + 1).padStart(2, '0')}`
}

// Fixe Slots: dayOfWeek (1=Mo..5=Fr) -> shiftType -> area -> Name
export const FIXED_SLOTS = {
  1: { morning: { shop: 'Belli', post: 'Anni' }, afternoon: { shop: 'Gudrun', post: 'Ines' } },
  2: { morning: { shop: 'Gudrun', post: 'Ines' }, afternoon: { post: 'Belli' } },
  3: { morning: { shop: 'Gudrun' }, afternoon: { shop: 'Marika', post: 'Belli' } },
  4: { morning: { post: 'Belli' }, afternoon: { shop: 'Gudrun', post: 'Ines' } },
  5: { morning: { shop: 'Cindy', post: 'Belli' }, afternoon: { shop: 'Marika', post: 'Gudrun' } },
}

export const DAY_KEY = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }

export function getShiftDuration(shiftType) {
  return SHIFT_HOURS[shiftType] ?? 5
}

export function getMaxHours(name) {
  return MAX_HOURS[name] ?? null
}

export function getOverflowHours(name) {
  return OVERFLOW_HOURS[name] ?? MAX_HOURS[name] ?? null
}

export function getTargetHours(name) {
  return TARGET_HOURS[name] ?? 0
}

// Zeitzonensicher: kein new Date(), kein toISOString(), reine Stringarithmetik.
export function parseISODate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { y, m, d }
}

// Wochentag ohne Zeitzoneneffekte (Zeller-Variante ueber UTC).
export function getDayOfWeek(dateStr) {
  const { y, m, d } = parseISODate(dateStr)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function toISODate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Erster Tag des Folgemonats als YYYY-MM-DD. Ohne Date-Objekt = ohne Zeitzonenbug.
export function getNextMonthStart(monthStr) {
  const { y, m } = parseISODate(monthStr)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

// An welchen Wochentagen steht eine Person ueberhaupt fix im Plan?
export function fixedWeekdaysFor(name) {
  const out = new Set()
  for (const [dow, shifts] of Object.entries(FIXED_SLOTS)) {
    for (const areas of Object.values(shifts)) {
      if (Object.values(areas).includes(name)) out.add(Number(dow))
    }
  }
  return out
}

// Kernregel fuer die Urlaubsanrechnung:
// Ein Urlaubstag zaehlt genau dann 5h, wenn die Person an diesem Wochentag
// ueberhaupt eine Schicht haette. Samstag und Sonntag zaehlen nie.
//   - Poolkraefte und Peter: jeder Werktag Mo-Fr, an dem sie verfuegbar sind
//   - Fixkraefte (Cindy, Anni, Marika): nur ihre festen Wochentage
export function countsAsVacationDay(emp, dateStr) {
  const dow = getDayOfWeek(dateStr)
  if (dow === 0 || dow === 6) return false

  const isPool = GENERAL_POOL_NAMES.includes(emp.name) || emp.name === SPRINGER_NAME
  if (isPool) {
    const key = DAY_KEY[dow]
    const av = emp.availability || {}
    return av[`${key}_morning`] === true || av[`${key}_afternoon`] === true
  }
  return fixedWeekdaysFor(emp.name).has(dow)
}
