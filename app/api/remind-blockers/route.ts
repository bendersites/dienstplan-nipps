import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { format, addMonths, startOfMonth } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const nextMonthDate = addMonths(startOfMonth(new Date()), 1)
    const nextMonthLabel = format(nextMonthDate, 'MMMM yyyy')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)

    for (const emp of employees || []) {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: emp.email,
        subject: 'Blockertage eintragen – ' + nextMonthLabel,
        html: '<h2>Hallo ' + emp.name + ',</h2><p>bitte trage deine Blockertage für <strong>' + nextMonthLabel + '</strong> bis zum <strong>24. des Monats</strong> ein.</p><p>Falls du keine Blockertage hast, bestätige das bitte kurz in der App.</p><p><a href="' + appUrl + '/employee" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Zur App</a></p><p>Vielen Dank,<br>Peter</p>'
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remind error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
