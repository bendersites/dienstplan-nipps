'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setMessage('Magic Link gesendet! Bitte E-Mail prüfen.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '0 24px' }}>
        <div style={{ background: '#fff', borderRadius: '4px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          
          <div style={{ background: '#1a1a1a', padding: '40px 40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Image src="/logo.png" alt="Schreibwaren Nipps" width={180} height={80} style={{ objectFit: 'contain' }} />
            <div style={{ marginTop: '16px', color: '#c9a84c', fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 500 }}>
              Dienstplan
            </div>
          </div>

          <div style={{ padding: '40px' }}>
            <form onSubmit={handleLogin}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#666', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.de"
                style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '13px', background: loading ? '#999' : '#e8000d', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '14px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Wird gesendet...' : 'Login-Link anfordern'}
              </button>
            </form>

            {message && (
              <div style={{ marginTop: '20px', padding: '12px 16px', borderRadius: '3px', fontSize: '14px', background: message.includes('Fehler') ? '#fff0f0' : '#f0fff4', color: message.includes('Fehler') ? '#c00' : '#1a7a3a', borderLeft: `3px solid ${message.includes('Fehler') ? '#e8000d' : '#1a7a3a'}` }}>
                {message}
              </div>
            )}
          </div>

        </div>
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#999' }}>
          Schreibwaren Nipps · Dienstplan-App
        </div>
      </div>
    </div>
  )
}
