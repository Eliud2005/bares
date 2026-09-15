'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

export default function LoginPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    // 1. Cerrar cualquier sesión previa antes de loguearse
    await supabase.auth.signOut()

    // 2. Autenticar
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (authError) {
      setErrorMsg(authError.message)
      setLoading(false)
      return
    }

    const user = authData.user
    if (!user) {
      setErrorMsg('No se pudo obtener el usuario.')
      setLoading(false)
      return
    }

    // 3. Obtener el rol del perfil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      setErrorMsg('Este usuario no tiene un perfil o rol asignado en el sistema.')
      setLoading(false)
      return
    }

    console.log('✅ Rol detectado:', profile.role)

    const role = profile.role.trim().toLowerCase()

    // 4. Redirigir con recarga completa para limpiar estado
    if (role === 'super_admin') {
      window.location.href = '/super-admin'
    } else if (role === 'admin') {
      window.location.href = '/admin'
    } else if (role === 'cashier') {
      window.location.href = '/cashier'
    } else if (role === 'waiter') {
      window.location.href = '/waiter'
    } else {
      alert(`Rol desconocido detectado: "${role}". Redirigiendo al inicio.`)
      window.location.href = '/'
    }

    setLoading(false)
  }

  return (
    <main
      className="min-h-screen text-white flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        backgroundColor: '#000000',
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(41,140,154,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(48,108,137,0.15) 0%, transparent 50%)',
      }}
    >
      <div
        className="w-full max-w-md p-8 rounded-3xl shadow-2xl relative z-10 border"
        style={{
          backgroundColor: 'rgba(40, 58, 75, 0.6)',
          borderColor: 'rgba(41, 140, 154, 0.3)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* LOGO / ISOTIPO */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center overflow-hidden p-3 border"
              style={{
                backgroundColor: '#FFFFFF',
                boxShadow: '0 20px 40px -10px rgba(41, 140, 154, 0.5)',
                borderColor: 'rgba(41, 140, 154, 0.3)',
              }}
            >
              {/* 👇 TU LOGO 👇 */}
              <Image
                src="/logo.png"
                alt="Diamond Code"
                width={96}
                height={96}
                className="object-contain w-full h-full"
                priority
              />

              {/* ⚠️ Si aún no tienes el archivo /logo.png,
                  comenta el <Image /> de arriba y descomenta este SVG temporal: */}
              {/*
              <svg
                viewBox="0 0 40 40"
                className="w-14 h-14"
                fill="none"
                stroke="#298C9A"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <path d="M10 4 L30 4 L36 14 L20 36 L4 14 Z" />
                <path d="M4 14 L36 14" />
                <path d="M10 4 L16 14 L20 36" />
                <path d="M30 4 L24 14 L20 36" />
              </svg>
              */}
            </div>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white">
            Diamond Code{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #298C9A 0%, #306C89 100%)',
              }}
            >
              POS
            </span>
          </h1>
          <p className="text-sm mt-2" style={{ color: '#8fa3b3' }}>
            Sistema de punto de venta para bares y restaurantes
          </p>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              className="block text-xs font-semibold uppercase mb-2 tracking-wider"
              style={{ color: '#8fa3b3' }}
            >
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none transition border"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'rgba(48, 108, 137, 0.4)',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#298C9A')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(48, 108, 137, 0.4)')}
              required
            />
          </div>

          <div>
            <label
              className="block text-xs font-semibold uppercase mb-2 tracking-wider"
              style={{ color: '#8fa3b3' }}
            >
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none transition border"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'rgba(48, 108, 137, 0.4)',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#298C9A')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(48, 108, 137, 0.4)')}
              required
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-bold py-3.5 rounded-xl transition text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #298C9A 0%, #306C89 100%)',
              boxShadow: '0 10px 30px -10px rgba(41, 140, 154, 0.5)',
            }}
          >
            {loading ? 'Entrando...' : 'Iniciar Sesión'}
          </button>
        </form>

        {/* FOOTER */}
        <div
          className="mt-8 pt-6 border-t text-center"
          style={{ borderColor: 'rgba(48, 108, 137, 0.3)' }}
        >
          <p className="text-xs" style={{ color: '#5d7285' }}>
            © {new Date().getFullYear()} Diamond Code · Todos los derechos reservados
          </p>
        </div>
      </div>
    </main>
  )
}