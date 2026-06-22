// @ts-nocheck
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setMessage('Login-Link gesendet! Bitte E-Mail prüfen.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '0 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Image src="/logo.png" alt="Schreibwaren Nipps" width={220} height={100} style={{ objectFit: 'contain' }} />
          <div style={{ marginTop: '12px', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: '#999', fontWeight: 500 }}>
            Dienstplan
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: '4px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#999', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              E-Mail-Adresse
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.de"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '20px', color: '#1a1a1a' }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '14px', background: loading ? '#ccc' : '#e8000d', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Wird gesendet...' : 'Login-Link anfordern'}
            </button>
          </form>

          {message && (
            <div style={{ marginTop: '20px', padding: '12px 16px', borderRadius: '3px', fontSize: '14px', background: message.includes('Fehler') ? '#fff0f0' : '#f6fff9', color: message.includes('Fehler') ? '#c00' : '#1a7a3a', borderLeft: `3px solid ${message.includes('Fehler') ? '#e8000d' : '#1a7a3a'}` }}>
              {message}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#bbb' }}>
          Schreibwaren Nipps · Euskirchen
        </div>

      </div>
    </div>
  )
}
