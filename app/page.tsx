'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

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

    // 4. Redirigir con recarga completa (window.location.href)
    //    en vez de router.push para limpiar todo el estado en memoria
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
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-blue-500 mb-1">BarSaaS PWA</h1>
          <p className="text-sm text-gray-400">Inicia sesión para acceder a tu panel</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
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
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </main>
  )
}