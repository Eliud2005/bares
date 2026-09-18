'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

function LoginContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')

  // Si vienes redirigido por bar inactivo, mostrar aviso
  useEffect(() => {
    if (searchParams.get('reason') === 'bar_inactive') {
      setInfoMsg(
        'Tu sucursal está temporalmente desactivada. Contacta al administrador del sistema.'
      )
    }
    if (searchParams.get('reason') === 'session_expired') {
      setInfoMsg('Tu sesión expiró. Vuelve a iniciar sesión.')
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setInfoMsg('')

    console.log('🚀 ============ INICIANDO LOGIN ============')
    console.log('📧 Email:', email)

    // 1. Cerrar cualquier sesión previa
    await supabase.auth.signOut()

    // 2. Autenticar
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      // Mensajes más amigables según el tipo de error
      let msg = authError.message
      if (msg.toLowerCase().includes('invalid login')) {
        msg = 'Correo o contraseña incorrectos. Verifica tus datos.'
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        msg = 'Debes confirmar tu correo antes de iniciar sesión.'
      }
      setErrorMsg(msg)
      setLoading(false)
      return
    }

    const user = authData.user
    if (!user) {
      setErrorMsg('No se pudo obtener el usuario. Intenta de nuevo.')
      setLoading(false)
      return
    }

    // 3. Obtener rol + bar_id del perfil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, bar_id')
      .eq('id', user.id)
      .single()

    console.log('👤 PROFILE:', profile, profileError)

    if (profileError || !profile) {
      setErrorMsg('Este usuario no tiene un perfil asignado. Contacta a soporte.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    const role = profile.role.trim().toLowerCase()

    // 4. Validar que el bar esté activo (excepto super_admin)
    if (role !== 'super_admin' && profile.bar_id) {
      const { data: barInfo, error: barError } = await supabase
        .from('bars')
        .select('is_active, name')
        .eq('id', profile.bar_id)
        .single()

      if (barError || !barInfo) {
        setErrorMsg('No se encontró la sucursal asociada. Contacta a soporte.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      if (!barInfo.is_active) {
        setErrorMsg(
          `La sucursal "${barInfo.name}" está desactivada. Contacta al administrador del sistema.`
        )
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
    }

    console.log('✅ Rol detectado:', role)

    // 5. Redirigir según el rol
    if (role === 'super_admin') {
      window.location.href = '/super-admin'
    } else if (role === 'admin') {
      window.location.href = '/admin'
    } else if (role === 'cashier') {
      window.location.href = '/cashier'
    } else if (role === 'waiter') {
      window.location.href = '/waiter'
    } else if (role === 'cook') {
      window.location.href = '/kitchen'
    } else {
      setErrorMsg(
        `Rol desconocido: "${role}". Contacta a soporte técnico.`
      )
      await supabase.auth.signOut()
      setLoading(false)
    }
  }

  return (
    <main
      className="min-h-screen text-white flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        backgroundColor: '#0A0F1A',
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(0,229,255,0.10) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,184,77,0.08) 0%, transparent 50%)',
      }}
    >
      <div
        className="w-full max-w-md p-8 rounded-3xl shadow-2xl relative z-10 border"
        style={{
          backgroundColor: 'rgba(20, 27, 45, 0.85)',
          borderColor: 'rgba(0, 229, 255, 0.2)',
          backdropFilter: 'blur(20px)',
          boxShadow:
            '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 229, 255, 0.05) inset',
        }}
      >
        {/* LOGO */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-3xl blur-2xl opacity-50"
                style={{ background: '#00E5FF' }}
              ></div>
              <div
                className="relative w-24 h-24 rounded-3xl flex items-center justify-center overflow-hidden p-3 border"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#00E5FF',
                  boxShadow: '0 15px 35px -10px rgba(0, 229, 255, 0.5)',
                }}
              >
                <Image
                  src="/logo.png"
                  alt="Diamond Code"
                  width={96}
                  height={96}
                  className="object-contain w-full h-full"
                  priority
                />
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white">
            Diamond Code{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, #00E5FF 0%, #00B8CC 100%)',
              }}
            >
              POS
            </span>
          </h1>
          <p className="text-sm mt-2" style={{ color: '#94A3B8' }}>
            Sistema de punto de venta para bares y restaurantes
          </p>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              className="block text-xs font-semibold uppercase mb-2 tracking-wider"
              style={{ color: '#94A3B8' }}
            >
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
              className="w-full rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none transition border"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderColor: 'rgba(0, 229, 255, 0.2)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#00E5FF'
                e.target.style.boxShadow = '0 0 0 3px rgba(0, 229, 255, 0.15)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(0, 229, 255, 0.2)'
                e.target.style.boxShadow = 'none'
              }}
              required
            />
          </div>

          <div>
            <label
              className="block text-xs font-semibold uppercase mb-2 tracking-wider"
              style={{ color: '#94A3B8' }}
            >
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-600 focus:outline-none transition border"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderColor: 'rgba(0, 229, 255, 0.2)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#00E5FF'
                  e.target.style.boxShadow = '0 0 0 3px rgba(0, 229, 255, 0.15)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(0, 229, 255, 0.2)'
                  e.target.style.boxShadow = 'none'
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm transition px-2 py-1 rounded"
                style={{ color: '#64748B' }}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* MENSAJE INFO (bar inactivo, sesión expirada, etc.) */}
          {infoMsg && !errorMsg && (
            <div
              className="p-3 text-sm rounded-xl border flex items-start gap-2"
              style={{
                backgroundColor: 'rgba(255, 184, 77, 0.1)',
                borderColor: 'rgba(255, 184, 77, 0.3)',
                color: '#FFB84D',
              }}
            >
              <span className="shrink-0">ℹ️</span>
              <span>{infoMsg}</span>
            </div>
          )}

          {/* ERROR */}
          {errorMsg && (
            <div
              className="p-3 text-sm rounded-xl border flex items-start gap-2"
              style={{
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                borderColor: 'rgba(255, 107, 107, 0.3)',
                color: '#FF6B6B',
              }}
            >
              <span className="shrink-0">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-bold py-3.5 rounded-xl transition text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #00E5FF 0%, #00B8CC 100%)',
              boxShadow: '0 10px 30px -10px rgba(0, 229, 255, 0.6)',
            }}
          >
            {loading ? (
              <>
                <span
                  className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"
                ></span>
                Entrando...
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        {/* FOOTER */}
        <div
          className="mt-8 pt-6 border-t text-center"
          style={{ borderColor: 'rgba(0, 229, 255, 0.15)' }}
        >
          <p className="text-xs" style={{ color: '#64748B' }}>
            © {new Date().getFullYear()} Diamond Code · Todos los derechos reservados
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0F1A]"></div>}>
      <LoginContent />
    </Suspense>
  )
}