import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, password, role, bar_id } = await request.json();

    console.log('📦 Body recibido:', { email, role, bar_id, passwordLength: password?.length });
    console.log('🔑 SERVICE_ROLE_KEY existe:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('🌐 SUPABASE_URL existe:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);

    if (!email || !password || !role || !bar_id) {
      return NextResponse.json(
        { error: 'Faltan campos: email, password, role o bar_id' },
        { status: 400 }
      );
    }

    // ✅ Cliente correcto para tareas admin (service role)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 1. Crear usuario en Auth
    console.log('👤 Creando usuario en Auth...');
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, bar_id },
      });

    if (authError) {
      console.error('❌ Error en Auth:', authError);
      throw authError;
    }

    const userId = authData.user.id;
    console.log('✅ Usuario creado:', userId);

    // 2. Crear perfil (sin `email`, con `full_name` que es NOT NULL)
    console.log('📝 Creando perfil en profiles...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        role,
        bar_id,
        full_name: email.split('@')[0], // 👈 NOT NULL, así que siempre lo mandamos
      });

    if (profileError) {
      console.error('❌ Error en profiles:', profileError);
      throw profileError;
    }

    console.log('✅ Perfil creado. Todo OK.');
    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error('💥 ERROR COMPLETO:', error);
    console.error('💥 MENSAJE:', error?.message);
    console.error('💥 DETALLES:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { error: error?.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}