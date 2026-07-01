// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { format, addMonths, startOfMonth, subDays } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)

// Wird taeglich per Vercel Cron aufgerufen. Prueft selbst ob heute der Tag ist
// (7 Tage vor dem 1. des naechsten Monats) - Vercel Cron kann keine relativen
// Monatsdaten, deswegen taeglicher Trigger + interner Check statt Spezial-Cron.
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()

    const nextMonthDate = addMonths(startOfMonth(new Date()), 1)
    const nextMonth = format(nextMonthDate, 'yyyy-MM')
    const nextMonthLabel = format(nextMonthDate, 'MMMM yyyy')
    const targetDate = format(subDays(nextMonthDate, 7), 'yyyy-MM-dd')
    const today = format(new Date(), 'yyyy-MM-dd')

    if (today !== targetDate) {
      return NextResponse.json({ skipped: true, reason: 'not the day', today, targetDate })
    }

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)

    const missing = (employees || []).filter(e =>
      e.role !== 'admin' && !(e.blocker_confirmed && e.blocker_confirmed_month === nextMonth)
    )

    if (missing.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'all already confirmed' })
    }

    const { data: peter } = await supabase
      .from('employees')
      .select('email')
      .eq('name', 'Peter')
      .single()

    if (!peter) {
      return NextResponse.json({ error: 'Peter nicht gefunden' }, { status: 500 })
    }

    const namesHtml = '<ul>' + missing.map(e => '<li>' + e.name + '</li>').join('') + '</ul>'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dienstplan.schreibwaren-nipps.de'

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: peter.email,
      subject: 'Blockertage noch offen - ' + nextMonthLabel,
      html: '<h2>Noch nicht alle haben ihre Blockertage fuer ' + nextMonthLabel + ' eingetragen.</h2>' +
        '<p>1 Woche bis zum Monatswechsel. Folgende Personen fehlen noch:</p>' +
        namesHtml +
        '<p><a href="' + appUrl + '/admin" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Zur App</a></p>'
    })

    return NextResponse.json({ success: true, notified: missing.map(e => e.name) })
  } catch (error) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
