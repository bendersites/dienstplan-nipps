// Rechnet einen Monat neu und schreibt ihn in Supabase.
// Gleiche Logik wie /api/generate-plan, nur von der Kommandozeile.
// Aufruf:  SRK=<service_role_key> node scripts/regenerate-month.mjs 2026-08 [--apply]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nipps-'))
for (const f of ['rules', 'planner']) {
  let src = fs.readFileSync(path.join(ROOT, 'lib', `${f}.ts`), 'utf8')
  src = src.replace(/from '\.\/rules'/g, "from './rules.mjs'")
  fs.writeFileSync(path.join(tmp, `${f}.mjs`), src)
}
const { buildPlan } = await import(path.join(tmp, 'planner.mjs'))
const { getNextMonthStart } = await import(path.join(tmp, 'rules.mjs'))

const URL_ = 'https://wywnxjtbopkfsulnmmwl.supabase.co'
const KEY = process.env.SRK
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const q = async (p, opt = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H, ...opt })
  const text = await r.text()
  if (!r.ok) throw new Error(`${p}: ${r.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const month = process.argv[2]
const apply = process.argv.includes('--apply')
if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Monat angeben, z.B. 2026-08')

const monthStr = `${month}-01`
const employees = await q('employees?select=*&active=eq.true')
const blockers = await q(
  `blocker_days?select=employee_id,date,type,shift_type&date=gte.${monthStr}&date=lt.${getNextMonthStart(monthStr)}`
)
const schedules = await q(`schedules?select=*&month=eq.${monthStr}`)
if (!schedules.length) throw new Error(`Kein Schedule fuer ${monthStr}`)
const schedule = schedules[0]

const plan = buildPlan({ month: monthStr, employees, blockers })
if (!plan.validation.ok) {
  console.error('Plan verletzt Regeln, nichts geschrieben:')
  plan.validation.errors.forEach((e) => console.error('  - ' + e))
  process.exit(1)
}

const open = plan.assignments.filter((a) => a.is_open).length
console.log(`${month}: ${plan.assignments.length} Slots, ${open} OFFEN, Status ${schedule.status}`)
for (const e of employees)
  console.log(`  ${e.name.padEnd(8)} ${String(plan.hours[e.id]).padStart(4)}h  (davon ${plan.vacationHours[e.id]}h Urlaub)`)

if (!apply) { console.log('\nProbelauf. Mit --apply schreiben.'); process.exit(0) }

await q(`shifts?schedule_id=eq.${schedule.id}`, { method: 'DELETE' })
const rows = plan.assignments.map((a) => ({ ...a, schedule_id: schedule.id }))
for (let i = 0; i < rows.length; i += 50)
  await q('shifts', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 50)) })

const check = await q(`shifts?select=id&schedule_id=eq.${schedule.id}`)
if (check.length !== rows.length) throw new Error(`Kontrolle: ${check.length} von ${rows.length} gespeichert`)
console.log(`\nGeschrieben und geprueft: ${check.length} Schichten.`)
