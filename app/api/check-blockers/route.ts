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

    if (peter) {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: peter.email,
        subject: 'Alle Blockertage eingetragen – ' + nextMonthLabel,
        html: '<h2>Alle Mitarbeiterinnen haben ihre Blockertage für ' + nextMonthLabel + ' eingetragen.</h2><h3>Übersicht:</h3>' + blockerHtml + '<p><a href="' + appUrl + '/admin" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Plan generieren</a></p>'
      })
    }

    return NextResponse.json({ allConfirmed: true })
  } catch (error) {
    console.error('Check error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
