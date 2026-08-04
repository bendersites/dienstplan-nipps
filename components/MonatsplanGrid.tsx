// @ts-nocheck
'use client'

// ============================================================
// MONATSPLAN-RASTER
// Eine Darstellung fuer alle: Ausdruck (A4 quer), Adminansicht
// und Mitarbeiteransicht. Wer hier etwas aendert, aendert es
// ueberall. Keine zweite Plandarstellung mehr bauen.
//
// Aufbau wie der handschriftliche Zettel im Laden:
//   Wochentag ueber Datum, Block "Laden" oben, "Post" unten,
//   Sonntag als schwarzer Balken (Wochengrenze),
//   V = Vormittag, N = Nachmittag, V/N = Doppeldienst,
//   U = Urlaub, B = Blockertag.
//
// Bewusst KEINE Stundenzahlen - unter dem Plan stehen
// stattdessen Urlaub und Blockertage der Mitarbeiter.
// ============================================================

const WD = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function pad(n) {
  return String(n).padStart(2, '0')
}

// Zeitzonensicher: reine Stringarithmetik, kein new Date() auf Datumsstrings.
function daysOfMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const out = []
  for (let d = 1; d <= count; d++) {
    out.push({
      date: `${y}-${pad(m)}-${pad(d)}`,
      day: d,
      dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    })
  }
  return out
}

function fmtDE(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

function fmtDEShort(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${d}.${m}.`
}

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const nd = new Date(Date.UTC(y, m - 1, d + 1))
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`
}

// Aufeinanderfolgende Tage zu Zeitraeumen zusammenfassen.
function groupRanges(dates) {
  const sorted = [...new Set(dates)].sort()
  const out = []
  for (const d of sorted) {
    const last = out[out.length - 1]
    if (last && nextDay(last.to) === d) last.to = d
    else out.push({ from: d, to: d })
  }
  return out
}

function daysBetween(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1
}

const shiftLabel = (t) =>
  t === 'morning' ? 'nur Vormittag' : t === 'afternoon' ? 'nur Nachmittag' : 'ganzer Tag'

// Wer taucht in welchem Block auf? Ines und Anni arbeiten nie im
// Laden, Marika und Cindy nie in der Post. Deren Zeilen gehoeren
// dort nicht hin - sie machen den Plan nur breit.
function worksIn(emp, area) {
  const q = emp.qualification
  // Ohne gepflegte Qualifikation lieber in beiden Bloecken zeigen als
  // jemanden stillschweigend aus dem Plan verschwinden zu lassen.
  if (q !== 'shop' && q !== 'post') return true
  return q === area
}

export default function MonatsplanGrid({
  month,                 // 'YYYY-MM'
  employees = [],
  shifts = [],
  blockers = [],
  highlightEmployeeId = null,
  showOpen = true,
}) {
  const [y, m] = month.split('-').map(Number)
  const days = daysOfMonth(month)
  const emps = [...employees].sort((a, b) => a.name.localeCompare(b.name))

  // Nachschlagewerke einmal aufbauen statt in jeder Zelle zu filtern.
  const shiftMap = new Map()   // empId|date|area -> Set(shift_type)
  for (const s of shifts) {
    if (!s.employee_id) continue
    const k = `${s.employee_id}|${s.date}|${s.area}`
    if (!shiftMap.has(k)) shiftMap.set(k, new Set())
    shiftMap.get(k).add(s.shift_type)
  }

  // Doppeldienst wird ueber BEIDE Bereiche hinweg erkannt. Wer vormittags
  // in der Post und nachmittags im Laden steht, hat einen ganzen Tag -
  // dann steht in jeder seiner Zellen an dem Tag V/N.
  const dayTypes = new Map()   // empId|date -> Set(shift_type)
  for (const s of shifts) {
    if (!s.employee_id) continue
    const k = `${s.employee_id}|${s.date}`
    if (!dayTypes.has(k)) dayTypes.set(k, new Set())
    dayTypes.get(k).add(s.shift_type)
  }
  const fullDay = new Set()
  for (const [k, t] of dayTypes) {
    if (t.has('morning') && t.has('afternoon')) fullDay.add(k)
  }

  const openMap = new Map()    // date|area -> Set(shift_type)
  for (const s of shifts) {
    if (!s.is_open) continue
    const k = `${s.date}|${s.area}`
    if (!openMap.has(k)) openMap.set(k, new Set())
    openMap.get(k).add(s.shift_type)
  }

  // Urlaub und Blocker haengen an der Person, nicht am Bereich.
  // Deshalb erscheinen sie in BEIDEN Bloecken, wenn jemand in
  // beiden arbeitet - vorher stand Gudruns Urlaub nur beim Laden.
  const vacSet = new Set()     // empId|date
  const blockMap = new Map()   // empId|date -> shift_type|null
  for (const b of blockers) {
    if (b.type === 'vacation') vacSet.add(`${b.employee_id}|${b.date}`)
    else blockMap.set(`${b.employee_id}|${b.date}`, b.shift_type ?? null)
  }

  function cellFor(emp, day, area) {
    const types = shiftMap.get(`${emp.id}|${day.date}|${area}`)
    if (types && types.size) {
      if (fullDay.has(`${emp.id}|${day.date}`)) return { text: 'V/N', kind: 'shift' }
      if (types.has('afternoon')) return { text: 'N', kind: 'shift' }
      return { text: 'V', kind: 'shift' }   // morning oder saturday
    }
    if (vacSet.has(`${emp.id}|${day.date}`)) return { text: 'U', kind: 'vac' }
    if (blockMap.has(`${emp.id}|${day.date}`)) {
      const st = blockMap.get(`${emp.id}|${day.date}`)
      return { text: st === 'morning' ? 'B/V' : st === 'afternoon' ? 'B/N' : 'B', kind: 'block' }
    }
    return null
  }

  function renderBlock(title, area) {
    const rows = emps.filter(e => worksIn(e, area))
    const openRow = showOpen
      ? days.map(d => {
          const t = openMap.get(`${d.date}|${area}`)
          if (!t || !t.size) return null
          const hasM = t.has('morning')
          const hasA = t.has('afternoon')
          if (hasM && hasA) return 'V/N'
          if (hasA) return 'N'
          return 'V'
        })
      : null
    const hasOpen = openRow && openRow.some(Boolean)

    return (
      <>
        <tr className="mp-section">
          <td className="mp-name">{title}</td>
          {days.map(d => (
            <td key={d.date} className={d.dow === 0 ? 'mp-sun' : ''} />
          ))}
        </tr>
        {rows.map(emp => (
          <tr key={area + emp.id} className={emp.id === highlightEmployeeId ? 'mp-me' : ''}>
            <td className="mp-name">{emp.name}</td>
            {days.map(d => {
              if (d.dow === 0) return <td key={d.date} className="mp-sun" />
              const c = cellFor(emp, d, area)
              return (
                <td key={d.date} className={c ? `mp-cell mp-${c.kind}` : 'mp-cell'}>
                  {c ? c.text : ''}
                </td>
              )
            })}
          </tr>
        ))}
        {hasOpen && (
          <tr className="mp-openrow">
            <td className="mp-name">OFFEN</td>
            {days.map((d, i) => {
              if (d.dow === 0) return <td key={d.date} className="mp-sun" />
              return <td key={d.date} className="mp-cell mp-open">{openRow[i] || ''}</td>
            })}
          </tr>
        )}
      </>
    )
  }

  // Fussbereich: statt Stundenzahlen die Abwesenheiten.
  // Nur Personen, die tatsaechlich etwas eingetragen haben.
  const absences = emps
    .map(emp => {
      const mine = blockers.filter(b => b.employee_id === emp.id && b.date.startsWith(month))
      if (!mine.length) return null
      const vac = groupRanges(mine.filter(b => b.type === 'vacation').map(b => b.date))
      const blk = mine.filter(b => b.type !== 'vacation').sort((a, b) => a.date.localeCompare(b.date))
      return { emp, vac, blk }
    })
    .filter(Boolean)

  const colWidth = `${(100 - 7) / days.length}%`

  return (
    <div className="mp-root">
      <div className="mp-head">
        <div className="mp-title">Monatsplan {MONTH_NAMES[m - 1]} {y}</div>
        <div className="mp-brand">Schreibwaren Nipps</div>
      </div>

      <table className="mp-table">
        <colgroup>
          <col style={{ width: '7%' }} />
          {days.map(d => <col key={d.date} style={{ width: colWidth }} />)}
        </colgroup>
        <thead>
          <tr className="mp-wd">
            <th className="mp-name" />
            {days.map(d => (
              <th key={d.date} className={d.dow === 0 ? 'mp-sun' : d.dow === 6 ? 'mp-sat' : ''}>
                {d.dow === 0 ? '' : WD[d.dow]}
              </th>
            ))}
          </tr>
          <tr className="mp-dates">
            <th className="mp-name">{MONTH_NAMES[m - 1].slice(0, 3)} {String(y).slice(2)}</th>
            {days.map(d => (
              <th key={d.date} className={d.dow === 0 ? 'mp-sun' : d.dow === 6 ? 'mp-sat' : ''}>
                {d.dow === 0 ? '' : d.day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderBlock('Laden', 'shop')}
          {renderBlock('Post', 'post')}
        </tbody>
      </table>

      <div className="mp-legend">
        V = Vormittag 09–14 &nbsp;·&nbsp; N = Nachmittag 14–19 &nbsp;·&nbsp; V/N = Doppeldienst
        &nbsp;·&nbsp; Samstag 09–15 &nbsp;·&nbsp; U = Urlaub &nbsp;·&nbsp; B = Blockertag
        &nbsp;·&nbsp; schwarzer Balken = Sonntag geschlossen
      </div>

      <div className="mp-absences">
        <div className="mp-abs-title">Urlaub &amp; Blockertage</div>
        {absences.length === 0 ? (
          <div className="mp-abs-empty">Für diesen Monat ist nichts eingetragen.</div>
        ) : (
          absences.map(({ emp, vac, blk }) => (
            <div key={emp.id} className="mp-abs-row">
              <span className="mp-abs-name">{emp.name}</span>
              <span className="mp-abs-body">
                {vac.map((r, i) => (
                  <span key={'v' + i} className="mp-abs-item">
                    Urlaub {r.from === r.to
                      ? fmtDE(r.from)
                      : `${fmtDEShort(r.from)} – ${fmtDE(r.to)} (${daysBetween(r.from, r.to)} Tage)`}
                  </span>
                ))}
                {blk.map((b, i) => (
                  <span key={'b' + i} className="mp-abs-item">
                    Blocker {fmtDE(b.date)}, {shiftLabel(b.shift_type)}
                    {b.reason ? ` · ${b.reason}` : ''}
                  </span>
                ))}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
