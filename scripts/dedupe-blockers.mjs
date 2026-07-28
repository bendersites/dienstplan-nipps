// Entfernt doppelte Zeilen aus blocker_days.
// Aufruf:  SRK=<service_role_key> node scripts/dedupe-blockers.mjs [--apply]
const URL_ = 'https://wywnxjtbopkfsulnmmwl.supabase.co'
const KEY = process.env.SRK
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const apply = process.argv.includes('--apply')

const rows = await (await fetch(`${URL_}/rest/v1/blocker_days?select=*&order=created_at.asc`, { headers: H })).json()
const emps = await (await fetch(`${URL_}/rest/v1/employees?select=id,name`, { headers: H })).json()
const name = Object.fromEntries(emps.map(e => [e.id, e.name]))

const seen = new Map()
const kill = []
for (const r of rows) {
  const k = `${r.employee_id}|${r.date}|${r.type}|${r.shift_type || 'all'}`
  if (seen.has(k)) kill.push(r)
  else seen.set(k, r)
}

console.log(`Zeilen gesamt: ${rows.length}   eindeutig: ${seen.size}   doppelt: ${kill.length}`)
for (const r of kill) console.log(`   loeschen: ${name[r.employee_id]} ${r.date} ${r.type} ${r.shift_type || 'ganzer Tag'}`)

if (!kill.length) { console.log('Nichts zu tun.'); process.exit(0) }
if (!apply) { console.log('\nProbelauf. Mit --apply wirklich loeschen.'); process.exit(0) }

for (const r of kill) {
  const res = await fetch(`${URL_}/rest/v1/blocker_days?id=eq.${r.id}`, { method: 'DELETE', headers: H })
  if (!res.ok) { console.error('FEHLER', r.id, await res.text()); process.exit(1) }
}
console.log(`\n${kill.length} doppelte Zeilen geloescht.`)
