// Testet lib/planner.ts gegen die ECHTEN Supabase-Daten.
// Aufruf:  SRK=<service_role_key> node scripts/test-planner.mjs 2026-07 2026-08 2026-09
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
const rules = await import(path.join(tmp, 'rules.mjs'))

const URL_ = 'https://wywnxjtbopkfsulnmmwl.supabase.co'
const KEY = process.env.SRK
const q = async (p) => {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
  return r.json()
}

const months = process.argv.slice(2)
if (!months.length) months.push('2026-07', '2026-08', '2026-09')

const employees = await q('employees?select=*&active=eq.true')
let failed = 0

for (const m of months) {
  const monthStr = `${m}-01`
  const next = rules.getNextMonthStart(monthStr)
  const blockers = await q(`blocker_days?select=employee_id,date,type,shift_type&date=gte.${monthStr}&date=lt.${next}`)
  const plan = buildPlan({ month: monthStr, employees, blockers })

  const open = plan.assignments.filter((a) => a.is_open).length
  console.log(`\n================ ${m} ================`)
  console.log(`Slots gesamt: ${plan.assignments.length}   OFFEN: ${open}   (Blockerzeilen: ${blockers.length})`)
  console.log('Name      gearb.  Urlaub  gesamt   Soll   Max   Status')
  for (const e of [...employees].sort((a, b) => a.name.localeCompare(b.name))) {
    const total = plan.hours[e.id] || 0
    const vac = plan.vacationHours[e.id] || 0
    const max = rules.getMaxHours(e.name)
    const soll = rules.getTargetHours(e.name)
    const bad = max !== null && total > rules.getOverflowHours(e.name)
    if (bad) failed++
    console.log(
      e.name.padEnd(9),
      String(total - vac).padStart(6),
      String(vac).padStart(7),
      String(total).padStart(7),
      String(soll).padStart(6),
      String(max).padStart(5),
      '  ' + (bad ? 'KAPPE GESPRENGT' : total > max ? 'Notreserve' : 'ok')
    )
  }

  if (plan.validation.ok) {
    console.log('Selbstkontrolle: OK (Slots eindeutig, keine Doppelbelegung, keine Kappenverletzung, Blocker respektiert)')
  } else {
    failed++
    console.log('Selbstkontrolle: FEHLER')
    plan.validation.errors.slice(0, 20).forEach((e) => console.log('   - ' + e))
  }

  const notfall = plan.warnings.filter((w) => w.startsWith('Notfall') || w.startsWith('Notreserve'))
  if (notfall.length) console.log(`Sondereinsaetze zum Auffuellen: ${notfall.length}`)
  const other = plan.warnings.filter((w) => !w.startsWith('Notfall') && !w.startsWith('Notreserve'))
  other.forEach((w) => console.log('   ! ' + w))

  if (open) {
    const list = plan.assignments.filter((a) => a.is_open)
    console.log('Offene Slots:')
    for (const a of list) console.log(`   ${a.date} ${a.shift_type}/${a.area}`)
  }
}

console.log(failed ? `\nERGEBNIS: ${failed} Problem(e)` : '\nERGEBNIS: alle Monate sauber')
process.exit(failed ? 1 : 0)
