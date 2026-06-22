// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  const supabase = createServerClient()

  const { data: employee } = await supabase
    .from('employees')
    .select('email, role')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!employee) {
    return NextResponse.json({ success: false })
  }

  return NextResponse.json({ success: true, role: employee.role })
}
