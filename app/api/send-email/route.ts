import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { scheduleId, month } = await request.json()
    const supabase = createServerClient()

    const { data: shifts } = await supabase
      .from('shifts')
      .select('*, employee:employees(name, email)')
      .eq('schedule_id', scheduleId)
      .order('date')

    const { data: employees } = await supabase
      .from('employees')
      .select('*')
      .eq('active', true)

    const planHtml = generatePlanHtml(shifts || [], month)

    for (const emp of employees || []) {
      const personalShifts = (shifts || []).filter(s => s.employee_id === emp.id)
      const personalHtml = generatePersonalHtml(personalShifts, emp.name, month)

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: emp.email,
        subject: `Dienstplan ${month}`,
        html: `
          <h2>Hallo ${emp.name},</h2>
          <p>der neue Dienstplan für ${month} ist veröffentlicht.</p>
          ${personalHtml}
          <hr>
          <h3>Gesamtplan:</h3>
          ${planHtml}
        `
      })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Email error:', error)
    return NextResponse.json({ error: 'Email failed' }, { status: 500 })
  }
}

function generatePlanHtml(shifts: any[], month: string): string {
  let html = '<table border="1" cellpadding="8" style="border-collapse: collapse;">'
  html += '<tr><th>Datum</th><th>Schicht</th><th>Bereich</th><th>Mitarbeiter</th></tr>'

  for (const shift of shifts) {
    html += `<tr>
      <td>${format(new Date(shift.date), 'dd.MM.yyyy')}</td>
      <td>${shift.shift_type}</td>
      <td>${shift.area}</td>
      <td>${shift.is_open ? '<strong style="color:red">OFFEN</strong>' : shift.employee?.name}</td>
    </tr>`
  }

  html += '</table>'
  return html
}

function generatePersonalHtml(shifts: any[], name: string, month: string): string {
  if (shifts.length === 0) return '<p>Du hast keine Schichten in diesem Monat.</p>'

  let html = '<h3>Deine Schichten:</h3><ul>'
  for (const shift of shifts) {
    html += `<li>${format(new Date(shift.date), 'dd.MM.yyyy')} – ${shift.shift_type} (${shift.area})</li>`
  }
  html += '</ul>'
  return html
}