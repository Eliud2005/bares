'use client';

import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Bar = {
  id: string;
  name: string;
  address?: string;
  created_at?: string;
};

type Profile = {
  id: string;
  email?: string;
  role: string;
  bar_id?: string;
  bars?: { name: string } | { name: string }[]; // 👈 Actualizado aquí
};

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  
  // Estado para el modal de crear nuevo bar
  const [isCreatingBar, setIsCreatingBar] = useState(false);
  const [newBarName, setNewBarName] = useState('');
  const [newBarAddress, setNewBarAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Alerta bonita
  const [appAlert, setAppAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadSuperAdminData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/');
      return;
    }

    // Verificar opcionalmente si es super admin por seguridad en el cliente
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profileData?.role !== 'super_admin') {
      setAppAlert({ type: 'error', message: 'Acceso denegado. No eres Super Administrador.' });
      setLoading(false);
      return;
    }

    // 1. Cargar todos los bares de la cadena/negocio
    const { data: barsData, error: barsError } = await supabase
      .from('bars')
      .select('*')
      .order('name', { ascending: true });

    if (barsError) {
      console.error('Error cargando bares:', barsError.message);
    } else if (barsData) {
      setBars(barsData);
    }

    // 2. Cargar perfiles de usuarios (empleados/admins de sucursales)
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        role,
        bar_id,
        bars (
          name
        )
      `);

    if (profilesError) {
      console.error('Error cargando perfiles:', profilesError.message);
    } else if (profilesData) {
      setProfiles(profilesData as Profile[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadSuperAdminData();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Función para registrar un nuevo bar
  const handleCreateBar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarName.trim()) return;
    setSubmitting(true);

    const { error } = await supabase
      .from('bars')
      .insert({
        name: newBarName.trim(),
        address: newBarAddress.trim() || null
      });

    if (error) {
      setAppAlert({ type: 'error', message: 'Error al crear el bar: ' + error.message });
    } else {
      setAppAlert({ type: 'success', message: '¡Bar creado exitosamente!' });
      setNewBarName('');
      setNewBarAddress('');
      setIsCreatingBar(false);
      await loadSuperAdminData();
    }

    setSubmitting(false);
  };

  if (loading) return <div className="p-8 text-white bg-slate-950 min-h-screen">Cargando panel maestro...</div>;

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 relative">
      
      {/* ALERTA FLOTANTE */}
      {appAlert && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
            appAlert.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200' 
              : 'bg-red-950/90 border-red-500 text-red-200'
          } backdrop-blur-md`}>
            <span className="text-xl font-bold">{appAlert.type === 'success' ? '✅' : '❌'}</span>
            <p className="text-sm font-semibold">{appAlert.message}</p>
            <button onClick={() => setAppAlert(null)} className="ml-4 text-xs bg-black/20 hover:bg-black/40 px-2.5 py-1 rounded-lg transition">
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-5">
          <div>
            <span className="bg-purple-600 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">Super Administrador</span>
            <h1 className="text-3xl font-black mt-2">Panel Maestro de Bares</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsCreatingBar(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-lg shadow-purple-600/20"
            >
              + Registrar Nuevo Bar
            </button>
            <button 
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-xl text-sm font-medium transition"
            >
              Cerrar Sesión
            </button>
          </div>
        </header>

        {/* MÉTRICAS RÁPIDAS GLOBALES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Total de Bares Activos</h2>
            <p className="text-4xl font-black text-purple-400">{bars.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Personal Registrado (Staff)</h2>
            <p className="text-4xl font-black text-sky-400">{profiles.length}</p>
          </div>
        </div>

        {/* LISTADO DE BARES */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Mis Sucursales / Bares</h2>
          </div>

          {bars.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No hay bares registrados en la base de datos todavía. ¡Crea el primero arriba!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bars.map((bar) => {
                const staffCount = profiles.filter(p => p.bar_id === bar.id).length;

                return (
                  <div key={bar.id} className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-purple-500/50 transition">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-white">{bar.name}</h3>
                        <span className="text-xs bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-full font-semibold">
                          Activo
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        📍 {bar.address || 'Sin dirección especificada'}
                      </p>
                    </div>

                    <div className="border-t border-slate-900 pt-3 flex justify-between items-center text-xs">
                      <span className="text-slate-400">Personal en sucursal:</span>
                      <span className="font-bold text-sky-400">{staffCount} empleados</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODAL PARA CREAR NUEVO BAR */}
        {isCreatingBar && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5">
              
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <span className="text-xs text-purple-400 font-semibold uppercase">Expansión</span>
                  <h3 className="text-xl font-bold text-white">Registrar Nueva Sucursal</h3>
                </div>
                <button 
                  onClick={() => setIsCreatingBar(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateBar} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nombre del Bar / Sucursal
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: DiamondCode Bar Centro"
                    value={newBarName}
                    onChange={(e) => setNewBarName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Dirección (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Principal #123"
                    value={newBarAddress}
                    onChange={(e) => setNewBarAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingBar(false)}
                    className="w-1/2 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl text-sm transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-1/2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-purple-600/20 disabled:opacity-50"
                  >
                    {submitting ? 'Guardando...' : 'Guardar Bar'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </div>
    </main>
  );
}