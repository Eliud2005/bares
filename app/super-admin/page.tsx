'use client';

import { createClient } from '@/lib/supabase';
import { useEffect, useState } from 'react';

type Bar = {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  admin_phone?: string;
  is_active?: boolean;
  created_at?: string;
  trial_until?: string | null;
  subscription_status?: string;
};

type Profile = {
  id: string;
  full_name?: string;
  role: string;
  bar_id?: string;
};

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [barRevenues, setBarRevenues] = useState<Record<string, number>>({});

  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');

  const [isCreatingBar, setIsCreatingBar] = useState(false);
  const [newBarName, setNewBarName] = useState('');
  const [newBarAddress, setNewBarAddress] = useState('');
  const [newBarPhone, setNewBarPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [selectedBarForStaff, setSelectedBarForStaff] = useState<Bar | null>(null);
  const [managingBar, setManagingBar] = useState<Bar | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [editingTrialBar, setEditingTrialBar] = useState<Bar | null>(null);
  const [newTrialDate, setNewTrialDate] = useState('');

  const [appAlert, setAppAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const supabase = createClient();

  const loadSuperAdminData = async (userId: string) => {
    // 1. Verificar rol con reintentos
    let profileData: { role: string } | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !profileData) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (data) profileData = data;
      else {
        attempts++;
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!profileData || profileData.role !== 'super_admin') {
      setAppAlert({ type: 'error', message: 'Acceso denegado. No eres Super Administrador.' });
      await supabase.auth.signOut();
      window.location.href = '/';
      return;
    }

    // 2. Cargar bares
    const { data: barsData, error: barsError } = await supabase
      .from('bars')
      .select('id, name, slug, address, phone, admin_phone, is_active, created_at, trial_until, subscription_status')
      .order('name', { ascending: true });

    if (!barsError && barsData) {
      setBars(barsData);

      // 3. Calcular ingresos del mes por bar
      const revenues: Record<string, number> = {};
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      for (const bar of barsData) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, status, created_at, order_items(price)')
          .eq('bar_id', bar.id)
          .in('status', ['paid', 'completed'])
          .gte('created_at', firstDayOfMonth);

        const total = (ordersData || []).reduce((sum, order: any) => {
          const itemsSum = (order.order_items || []).reduce(
            (s: number, it: any) => s + Number(it.price || 0),
            0
          );
          return sum + itemsSum;
        }, 0);

        revenues[bar.id] = total;
      }
      setBarRevenues(revenues);
    }

    // 4. Cargar perfiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, role, bar_id');

    if (!profilesError && profilesData) setProfiles(profilesData as Profile[]);

    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !user) {
        window.location.href = '/';
        return;
      }
      await loadSuperAdminData(user.id);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;
        if (event === 'SIGNED_OUT' || !session) {
          window.location.href = '/';
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const getTrialStatus = (bar: Bar) => {
    if (!bar.trial_until) return { label: 'Sin trial', color: 'text-slate-400', days: -999 };

    const now = new Date();
    const trialEnd = new Date(bar.trial_until);
    const diffDays = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Expirado', color: 'text-red-400', days: diffDays };
    if (diffDays <= 3) return { label: `${diffDays} días restantes`, color: 'text-amber-400', days: diffDays };
    return { label: `${diffDays} días restantes`, color: 'text-emerald-400', days: diffDays };
  };

  const handleCreateBarWithAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarName.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setAppAlert({ type: 'error', message: 'Por favor llena todos los campos obligatorios.' });
      return;
    }
    setSubmitting(true);

    try {
      const slug = newBarName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const trialUntil = new Date();
      trialUntil.setDate(trialUntil.getDate() + 30);

      const { data: barData, error: barError } = await supabase
        .from('bars')
        .insert({
          name: newBarName.trim(),
          slug,
          address: newBarAddress.trim() || null,
          phone: newBarPhone.trim() || null,
          admin_phone: adminPhone.trim() || null,
          is_active: true,
          trial_until: trialUntil.toISOString(),
          subscription_status: 'trial',
        })
        .select()
        .single();

      if (barError) throw new Error('Error al crear el bar: ' + barError.message);

      const { data: rpcData, error: rpcError } = await supabase.rpc('create_bar_admin', {
        bar_id_input: barData.id,
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword.trim(),
        admin_name: adminName.trim(),
      });

      if (rpcError) throw new Error('Error en función SQL: ' + rpcError.message);
      if (rpcData && rpcData.success === false) throw new Error('No se pudo registrar el administrador.');

      setAppAlert({ type: 'success', message: '¡Sucursal y Administrador creados con 30 días de prueba!' });
      setNewBarName('');
      setNewBarAddress('');
      setNewBarPhone('');
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminPhone('');
      setIsCreatingBar(false);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await loadSuperAdminData(user.id);
    } catch (err: any) {
      setAppAlert({ type: 'error', message: err.message || 'Ocurrió un error inesperado.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBarStatus = async (barId: string, status: boolean) => {
    try {
      setSubmitting(true);
      const { error } = await supabase.from('bars').update({ is_active: status }).eq('id', barId);
      if (error) throw new Error(error.message);

      setAppAlert({
        type: 'success',
        message: status ? '¡Sucursal reactivada correctamente!' : 'Sucursal desactivada con éxito.',
      });
      setManagingBar(null);
      setConfirmDeactivate(false);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await loadSuperAdminData(user.id);
    } catch (err: any) {
      setAppAlert({ type: 'error', message: 'Error al cambiar estado: ' + err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrialBar || !newTrialDate) return;
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('bars')
        .update({
          trial_until: new Date(newTrialDate + 'T23:59:59').toISOString(),
          subscription_status: 'trial',
        })
        .eq('id', editingTrialBar.id);

      if (error) throw new Error(error.message);

      setAppAlert({ type: 'success', message: 'Fecha de trial actualizada.' });
      setEditingTrialBar(null);
      setNewTrialDate('');

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await loadSuperAdminData(user.id);
    } catch (err: any) {
      setAppAlert({ type: 'error', message: 'Error: ' + err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendWhatsApp = (bar: Bar) => {
    const trial = getTrialStatus(bar);
    const phone = (bar.admin_phone || bar.phone || '').replace(/[^\d]/g, '');

    if (!phone) {
      setAppAlert({
        type: 'error',
        message: 'Este bar no tiene teléfono/WhatsApp. Edítalo primero.',
      });
      return;
    }

    const message =
      `Hola 👋 te contacto de *Diamond Code SaaS*.\n\n` +
      `Tu bar *${bar.name}* está en período de prueba.\n` +
      (trial.days >= 0
        ? `⏳ Te quedan *${trial.days} días* de prueba.\n`
        : `🔴 Tu período de prueba ha *expirado*.\n`) +
      `\nPara renovar o más información, respóndeme por aquí.\n\n` +
      `¡Gracias por usar nuestro sistema! 🍻`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');

    setAppAlert({ type: 'success', message: `WhatsApp abierto con mensaje para ${bar.name}.` });
  };

  if (loading) return <div className="p-8 text-white bg-slate-950 min-h-screen">Cargando panel maestro...</div>;

  const activeBarsList = bars.filter((b) => b.is_active === true || b.is_active === undefined);
  const inactiveBarsList = bars.filter((b) => b.is_active === false);
  const displayedBars = activeTab === 'active' ? activeBarsList : inactiveBarsList;

  const totalRevenue = Object.values(barRevenues).reduce((s, v) => s + v, 0);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 relative">
      {appAlert && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
              appAlert.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-red-950/90 border-red-500 text-red-200'
            } backdrop-blur-md`}
          >
            <span className="text-xl font-bold">{appAlert.type === 'success' ? '✅' : '❌'}</span>
            <p className="text-sm font-semibold">{appAlert.message}</p>
            <button
              onClick={() => setAppAlert(null)}
              className="ml-4 text-xs bg-black/20 hover:bg-black/40 px-2.5 py-1 rounded-lg transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b border-slate-800 pb-5">
          <div>
            <span className="bg-purple-600 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">
              Diamond Code SaaS
            </span>
            <h1 className="text-3xl font-black mt-2">Panel Maestro de Bares</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsCreatingBar(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-lg shadow-purple-600/20"
            >
              + Registrar Bar + Admin
            </button>
            <button
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium transition"
            >
              Cerrar Sesión
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Bares Activos</h2>
            <p className="text-4xl font-black text-purple-400">{activeBarsList.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Bares Inactivos</h2>
            <p className="text-4xl font-black text-amber-400">{inactiveBarsList.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
              Ingresos Totales (mes)
            </h2>
            <p className="text-4xl font-black text-emerald-400">
              ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <div className="flex border-b border-slate-800 gap-4 pb-3">
            <button
              onClick={() => setActiveTab('active')}
              className={`pb-2 text-sm font-bold transition relative ${
                activeTab === 'active'
                  ? 'text-purple-400 border-b-2 border-purple-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🟢 Bares Activos ({activeBarsList.length})
            </button>
            <button
              onClick={() => setActiveTab('inactive')}
              className={`pb-2 text-sm font-bold transition relative ${
                activeTab === 'inactive'
                  ? 'text-amber-400 border-b-2 border-amber-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⛔ Bares Inactivos ({inactiveBarsList.length})
            </button>
          </div>

          {displayedBars.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {activeTab === 'active' ? 'No hay bares activos registrados.' : 'No hay ningún bar inactivo.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedBars.map((bar) => {
                const barStaff = profiles.filter((p) => p.bar_id === bar.id);
                const isInactive = bar.is_active === false;
                const trial = getTrialStatus(bar);
                const revenue = barRevenues[bar.id] || 0;

                return (
                  <div
                    key={bar.id}
                    className={`border rounded-xl p-5 flex flex-col justify-between space-y-4 transition ${
                      isInactive
                        ? 'bg-slate-950/60 border-amber-900/30 opacity-80'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <h3
                          className={`font-bold text-lg ${
                            isInactive ? 'text-slate-400 line-through' : 'text-white'
                          }`}
                        >
                          {bar.name}
                        </h3>
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            isInactive ? 'bg-amber-500/10 text-amber-400' : 'bg-purple-500/10 text-purple-400'
                          }`}
                        >
                          {isInactive ? 'Inactivo' : 'Activo'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="text-slate-500">Trial:</span>
                        <span className={`font-bold ${trial.color}`}>{trial.label}</span>
                        {trial.days >= 0 && trial.days <= 3 && (
                          <span className="bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">
                            ¡POR VENCER!
                          </span>
                        )}
                        {trial.days < 0 && (
                          <span className="bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            EXPIRADO
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Ingresos (mes):</span>
                        <span className="font-bold text-emerald-400">
                          ${revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400">📍 {bar.address || 'Sin dirección'}</p>
                      <p className="text-xs text-slate-400">📞 {bar.phone || 'Sin teléfono'}</p>
                      <p className="text-xs font-mono px-2 py-1 rounded border inline-block text-purple-300 bg-purple-950/40 border-purple-900/50">
                        slug: /{bar.slug}
                      </p>
                    </div>

                    <div className="border-t border-slate-900 pt-3 flex flex-col gap-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Staff:</span>
                        <button
                          onClick={() => setSelectedBarForStaff(bar)}
                          className="font-bold text-sky-400 hover:underline bg-sky-950/40 px-2.5 py-1 rounded border border-sky-900/50"
                        >
                          {barStaff.length} empleados (Ver)
                        </button>
                      </div>

                      <button
                        onClick={() => handleSendWhatsApp(bar)}
                        className="w-full mt-1 font-semibold py-2 rounded-lg border transition text-center bg-green-950/60 hover:bg-green-900/60 text-green-300 border-green-800/60"
                      >
                        📱 Recordar Pago (WhatsApp)
                      </button>

                      <button
                        onClick={() => {
                          setEditingTrialBar(bar);
                          setNewTrialDate(
                            bar.trial_until
                              ? new Date(bar.trial_until).toISOString().split('T')[0]
                              : ''
                          );
                        }}
                        className="w-full font-semibold py-2 rounded-lg border transition text-center bg-sky-950/60 hover:bg-sky-900/60 text-sky-200 border-sky-800/60"
                      >
                        🗓️ Editar Trial
                      </button>

                      <button
                        onClick={() => {
                          setManagingBar(bar);
                          setConfirmDeactivate(false);
                        }}
                        className="w-full font-semibold py-2 rounded-lg border transition text-center bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 border-purple-800/60"
                      >
                        ⚙️ Administrar Sucursal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODAL: Editar trial */}
        {editingTrialBar && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Editar Trial: {editingTrialBar.name}</h3>
                <button
                  onClick={() => setEditingTrialBar(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateTrial} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nueva fecha de fin de prueba
                  </label>
                  <input
                    type="date"
                    required
                    value={newTrialDate}
                    onChange={(e) => setNewTrialDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingTrialBar(null)}
                    className="w-1/2 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-1/2 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: Administrar sucursal */}
        {managingBar && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <span className="text-xs text-purple-400 font-semibold uppercase">Gestión de Sucursal</span>
                  <h3 className="text-xl font-bold text-white">{managingBar.name}</h3>
                </div>
                <button
                  onClick={() => {
                    setManagingBar(null);
                    setConfirmDeactivate(false);
                  }}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {!confirmDeactivate ? (
                <div className="space-y-4">
                  <button
                    onClick={() => {
                      setSelectedBarForStaff(managingBar);
                      setManagingBar(null);
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-left px-4 py-3 rounded-xl text-sm font-medium transition flex justify-between items-center"
                  >
                    <span>👥 Ver y auditar personal</span>
                    <span>→</span>
                  </button>

                  <div className="border-t border-slate-800 pt-4">
                    {managingBar.is_active === false ? (
                      <button
                        disabled={submitting}
                        onClick={() => handleUpdateBarStatus(managingBar.id, true)}
                        className="w-full bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-900/60 text-emerald-300 text-left px-4 py-3 rounded-xl text-sm font-medium transition"
                      >
                        🟢 Reactivar Sucursal
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeactivate(true)}
                        className="w-full bg-amber-950/40 hover:bg-amber-900/50 border border-amber-900/60 text-amber-300 text-left px-4 py-3 rounded-xl text-sm font-medium transition"
                      >
                        ⛔ Desactivar Sucursal
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 bg-amber-950/20 border border-amber-900/40 p-4 rounded-xl">
                  <h4 className="font-bold text-amber-200 text-sm">¿Deseas desactivar este bar?</h4>
                  <div className="flex gap-3 pt-2">
                    <button
                      disabled={submitting}
                      onClick={() => setConfirmDeactivate(false)}
                      className="w-1/2 bg-slate-800 text-white py-2 rounded-lg text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={submitting}
                      onClick={() => handleUpdateBarStatus(managingBar.id, false)}
                      className="w-1/2 bg-amber-600 text-white font-bold py-2 rounded-lg text-xs"
                    >
                      Sí, Desactivar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: Staff del bar */}
        {selectedBarForStaff && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-5">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-xl font-bold text-white">Staff de {selectedBarForStaff.name}</h3>
                <button
                  onClick={() => setSelectedBarForStaff(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto">
                {profiles.filter((p) => p.bar_id === selectedBarForStaff.id).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Sin personal registrado.</p>
                ) : (
                  profiles
                    .filter((p) => p.bar_id === selectedBarForStaff.id)
                    .map((emp) => (
                      <div
                        key={emp.id}
                        className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-bold text-white">{emp.full_name || 'Sin nombre'}</p>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded uppercase text-[10px] font-bold bg-purple-900/50 text-purple-300 border border-purple-700">
                            {emp.role}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
              <button
                onClick={() => setSelectedBarForStaff(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl text-sm transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* MODAL: Crear bar + admin */}
        {isCreatingBar && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-xl font-bold text-white">Nuevo Bar & Administrador</h3>
                <button
                  onClick={() => setIsCreatingBar(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateBarWithAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nombre del Administrador *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carlos Pérez"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nombre del Bar *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: La Taberna"
                    value={newBarName}
                    onChange={(e) => setNewBarName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Dirección (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Juárez #405"
                    value={newBarAddress}
                    onChange={(e) => setNewBarAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Teléfono del Bar (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 951 123 4567"
                    value={newBarPhone}
                    onChange={(e) => setNewBarPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    WhatsApp del Admin (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 5219511234567"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Correo del Admin *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@lataberna.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingBar(false)}
                    className="w-1/2 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl text-sm transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-1/2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
                  >
                    {submitting ? 'Creando...' : 'Crear'}
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