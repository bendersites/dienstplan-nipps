import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect based on role
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('email', user.email)
      .single()

    if (employee?.role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
  }

  return NextResponse.redirect(new URL('/employee', request.url))
}