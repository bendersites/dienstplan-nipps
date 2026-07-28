// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { buildPlan } from '@/lib/planner'
import { getNextMonthStart, getMaxHours, getTargetHours } from '@/lib/rules'

export async function POST(request) {
  try {
    const body = await request.json()
    const { month, scheduleId } = body || {}

    if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(month))
      return NextResponse.json({ error: 'Ungueltiger Monat' }, { status: 400 })
    if (!scheduleId)
      return NextResponse.json({ error: 'Keine scheduleId uebergeben' }, { status: 400 })

    const supabase = createServerClient()
    const nextMonth = getNextMonthStart(month)

    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)
    if (empErr) throw new Error('Mitarbeiter laden fehlgeschlagen: ' + empErr.message)
    if (!employees?.length) throw new Error('Keine aktiven Mitarbeiter gefunden')

    const { data: blockers, error: blkErr } = await supabase
      .from('blocker_days')
      .select('employee_id, date, type, shift_type')
      .gte('date', month)
      .lt('date', nextMonth)
    if (blkErr) throw new Error('Blockertage laden fehlgeschlagen: ' + blkErr.message)

    const plan = buildPlan({ month, employees, blockers: blockers || [] })

    // Selbstkontrolle: bei einem harten Regelverstoss wird NICHTS gespeichert.
    // Lieber der alte Plan als ein kaputter neuer.
    if (!plan.validation.ok) {
      return NextResponse.json(
        { error: 'Plan verletzt Regeln, nichts gespeichert', details: plan.validation.errors },
        { status: 422 }
      )
    }

    const { error: delErr } = await supabase.from('shifts').delete().eq('schedule_id', scheduleId)
    if (delErr) throw new Error('Alte Schichten loeschen fehlgeschlagen: ' + delErr.message)

    const rows = plan.assignments.map((a) => ({
      date: a.date,
      shift_type: a.shift_type,
      area: a.area,
      employee_id: a.employee_id,
      schedule_id: scheduleId,
      is_open: a.is_open,
    }))

    // In Bloecken schreiben und JEDEN Fehler pruefen.
    for (let i = 0; i < rows.length; i += 50) {
      const { error: insErr } = await supabase.from('shifts').insert(rows.slice(i, i + 50))
      if (insErr) throw new Error('Schichten speichern fehlgeschlagen: ' + insErr.message)
    }

    // Gegenkontrolle: steht wirklich alles in der Datenbank?
    const { count, error: cntErr } = await supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('schedule_id', scheduleId)
    if (cntErr) throw new Error('Kontrolle fehlgeschlagen: ' + cntErr.message)
    if (count !== rows.length)
      throw new Error(`Kontrolle fehlgeschlagen: ${count} von ${rows.length} Schichten gespeichert`)

    const byId = Object.fromEntries(employees.map((e) => [e.id, e]))
    const hours = {}
    for (const e of employees) {
      hours[e.name] = {
        gesamt: plan.hours[e.id] || 0,
        urlaub: plan.vacationHours[e.id] || 0,
        gearbeitet: (plan.hours[e.id] || 0) - (plan.vacationHours[e.id] || 0),
        soll: getTargetHours(e.name),
        max: getMaxHours(e.name),
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        total: plan.assignments.length,
        open: plan.assignments.filter((a) => a.is_open).length,
        hours,
        warnings: plan.warnings,
      },
    })
  } catch (error) {
    console.error('generate-plan:', error)
    return NextResponse.json(
      { error: error?.message || 'Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
