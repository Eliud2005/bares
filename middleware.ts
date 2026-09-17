// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // 1. Crear un cliente de Supabase que puede leer/escribir cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 2. Obtener el usuario actual (valida el token y refresca la sesión si es necesario)
  const { data: { user } } = await supabase.auth.getUser()

  // 3. Definir las reglas de protección
  const path = request.nextUrl.pathname
  
  // Rutas que requieren estar logueado
  const protectedRoutes = ['/admin', '/cashier', '/waiter']
  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route))

  // 4. Lógica de Guardia
  if (isProtectedRoute && !user) {
    // Si intenta entrar a una ruta protegida SIN sesión -> Redirigir al Login
    return NextResponse.redirect(new URL('/', request.url))
  }

  // (Opcional) Si ya está logueado e intenta ir al login -> Mandarlo a su panel
  if (path === '/' && user) {
    // Aquí podrías consultar su rol para mandarlo a su panel correspondiente
    // const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    // if (profile?.role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

// 5. Configurar en qué rutas se ejecuta el middleware (excluyendo assets estáticos)
export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas de solicitud excepto las que empiezan con:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico (archivo de icono)
     * - archivos con extensiones de imagen
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}