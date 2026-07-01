// @ts-nocheck
'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(needsPassword ? { email, password } : { email })
    })
    const data = await res.json()

    if (data.success) {
      localStorage.setItem('nipps_email', email)
      if (data.role === 'admin') {
        localStorage.setItem('nipps_admin_authed', 'true')
      }
      window.location.href = data.role === 'admin' ? '/admin' : '/employee'
    } else if (data.needsPassword) {
      setNeedsPassword(true)
      if (data.error) setError(data.error)
    } else {
      setError('E-Mail-Adresse nicht gefunden.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>
          <Image src="/logo.png" alt="Schreibwaren Nipps" width={260} height={120} style={{ objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '40px' }}>
          Dienstplan
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: '4px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'left' }}>
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#999', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              E-Mail-Adresse
            </label>
            <input
              type="email"
              required
              disabled={needsPassword}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.de"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '20px', color: '#1a1a1a', background: needsPassword ? '#f5f5f5' : '#fff' }}
            />
            {needsPassword && (
              <>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#999', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Passwort
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort"
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid #e0e0e0', borderRadius: '3px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '20px', color: '#1a1a1a' }}
                />
              </>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '14px', background: loading ? '#ccc' : '#e8000d', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Lädt...' : 'Weiter'}
            </button>
          </form>
          {error && (
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '3px', fontSize: '14px', background: '#fff0f0', color: '#c00', borderLeft: '3px solid #e8000d' }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#bbb' }}>
          Schreibwaren Nipps
        </div>
      </div>
    </div>
  )
}
