// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()
  const supabase = createServerClient()

  const { data: employee } = await supabase
    .from('employees')
    .select('email, role')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!employee) {
    return NextResponse.json({ success: false })
  }

  // Admin (Peter) braucht zusätzlich ein Passwort. Mitarbeiterinnen bleiben
  // wie bisher rein über die E-Mail-Adresse.
  if (employee.role === 'admin') {
    if (!password) {
      return NextResponse.json({ success: false, needsPassword: true })
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ success: false, needsPassword: true, error: 'Falsches Passwort.' })
    }
  }

  return NextResponse.json({ success: true, role: employee.role })
}
