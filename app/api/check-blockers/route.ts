// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { format, addMonths, startOfMonth } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const nextMonthDate = addMonths(startOfMonth(new Date()), 1)
    const nextMonth = format(nextMonthDate, 'yyyy-MM')
    const nextMonthLabel = format(nextMonthDate, 'MMMM yyyy')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)

    const allDone = (employees || []).every(e =>
      e.blocker_confirmed && e.blocker_confirmed_month === nextMonth
    )

    if (!allDone) {
      return NextResponse.json({ allConfirmed: false })
    }

    const nextMonthStart = nextMonth + '-01'
    const nextMonthEnd = format(addMonths(new Date(nextMonthStart), 1), 'yyyy-MM-dd')

    const { data: blockers } = await supabase
      .from('blocker_days')
      .select('*, employee:employees(name)')
      .gte('date', nextMonthStart)
      .lt('date', nextMonthEnd)

    let blockerHtml = '<p>Keine Blockertage eingetragen.</p>'
    if (blockers && blockers.length > 0) {
      blockerHtml = '<ul>'
      for (const b of blockers) {
        const reason = b.reason ? ' (' + b.reason + ')' : ''
        blockerHtml += '<li>' + b.employee?.name + ': ' + format(new Date(b.date), 'dd.MM.yyyy') + reason + '</li>'
      }
      blockerHtml += '</ul>'
    }

    const { data: peter } = await supabase
      .from('employees')
      .select('email')
      .eq('name', 'Peter')
      .single()

    // Schon mal "alle fertig" für diesen Monat gemeldet? Dann ist das hier eine
    // nachträgliche Änderung (jemand hat nach der ersten Meldung nochmal was
    // eingetragen/geändert) - Peter kriegt eine andere, kürzere Mail statt der
    // vollen "Alle fertig"-Meldung nochmal.
    const { data: notification } = await supabase
      .from('blocker_notifications')
      .select('*')
      .eq('month', nextMonth)
      .single()

    if (peter && notification?.all_confirmed_sent_at) {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: peter.email,
        subject: 'Änderung an Blockertagen – ' + nextMonthLabel,
        html: '<h2>Eine Mitarbeiterin hat ihre Blockertage/Urlaub für ' + nextMonthLabel + ' nachträglich geändert.</h2><h3>Aktuelle Übersicht:</h3>' + blockerHtml + '<p>Falls du den Plan schon generiert hast, prüf ob er noch passt.</p><p><a href="' + appUrl + '/admin" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Zum Plan</a></p>'
      })
      return NextResponse.json({ allConfirmed: true, changeNotified: true })
    }

    if (peter) {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: peter.email,
        subject: 'Alle Blockertage eingetragen – ' + nextMonthLabel,
        html: '<h2>Alle Mitarbeiterinnen haben ihre Blockertage für ' + nextMonthLabel + ' eingetragen.</h2><h3>Übersicht:</h3>' + blockerHtml + '<p><a href="' + appUrl + '/admin" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Plan generieren</a></p>'
      })
    }

    await supabase
      .from('blocker_notifications')
      .upsert({ month: nextMonth, all_confirmed_sent_at: new Date().toISOString() })

    return NextResponse.json({ allConfirmed: true, firstNotification: true })
  } catch (error) {
    console.error('Check error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
