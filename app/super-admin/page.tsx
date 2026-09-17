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

  // 🎨 Paleta Diamond Code — Vibrante V2
  const brand = {
    bg: '#0A0F1A',
    surface: '#141B2D',
    surfaceLight: '#1E2842',
    border: '#2A3654',
    cyan: '#00E5FF',
    cyanDark: '#00B8CC',
    amber: '#FFB84D',
    green: '#00E0A4',
    coral: '#FF6B6B',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
  };

  const loadSuperAdminData = async (userId: string) => {
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

    const { data: barsData, error: barsError } = await supabase
      .from('bars')
      .select('id, name, slug, address, phone, admin_phone, is_active, created_at, trial_until, subscription_status')
      .order('name', { ascending: true });

    if (!barsError && barsData) {
      setBars(barsData);

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
    if (!bar.trial_until) return { label: 'Sin trial', color: brand.textMuted, days: -999 };

    const now = new Date();
    const trialEnd = new Date(bar.trial_until);
    const diffDays = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Expirado', color: brand.coral, days: diffDays };
    if (diffDays <= 3) return { label: `${diffDays} días restantes`, color: brand.amber, days: diffDays };
    return { label: `${diffDays} días restantes`, color: brand.cyan, days: diffDays };
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
      trialUntil.setDate(trialUntil.getDate() + 15);

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

      setAppAlert({ type: 'success', message: '¡Sucursal y Administrador creados con 15 días de prueba!' });
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
        message: status
          ? '✅ Sucursal reactivada. Los usuarios ya pueden iniciar sesión.'
          : '⛔ Sucursal desactivada. Los usuarios ya no podrán acceder.',
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
      `Hola 👋 te contacto de *Diamond Code POS*.\n\n` +
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

  if (loading)
    return (
      <div
        className="p-8 text-white min-h-screen flex items-center justify-center"
        style={{ backgroundColor: brand.bg }}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className="inline-block w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: brand.cyan, borderTopColor: 'transparent' }}
          ></span>
          <span style={{ color: brand.textSecondary }}>Cargando panel maestro...</span>
        </div>
      </div>
    );

  const activeBarsList = bars.filter((b) => b.is_active === true || b.is_active === undefined);
  const inactiveBarsList = bars.filter((b) => b.is_active === false);
  const displayedBars = activeTab === 'active' ? activeBarsList : inactiveBarsList;

  const totalRevenue = Object.values(barRevenues).reduce((s, v) => s + v, 0);

  // 🆕 Métricas nuevas
  const totalUsers = profiles.filter((p) => p.role !== 'super_admin').length;
  const expiringSoonList = activeBarsList.filter((b) => {
    if (!b.trial_until) return false;
    const days = Math.ceil((new Date(b.trial_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 3;
  });

  return (
    <main
      className="min-h-screen text-white p-6 relative overflow-hidden"
      style={{ backgroundColor: brand.bg }}
    >
      {/* Grid de fondo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(${brand.cyan} 1px, transparent 1px), linear-gradient(90deg, ${brand.cyan} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      ></div>

      {/* Alert flotante */}
      {appAlert && (
        <div className="fixed top-6 right-6 z-50 animate-bounce max-w-md">
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
              appAlert.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-red-950/90 border-red-500 text-red-200'
            } backdrop-blur-md`}
          >
            <span className="text-xl font-bold">{appAlert.type === 'success' ? '✅' : '❌'}</span>
            <p className="text-sm font-semibold flex-1">{appAlert.message}</p>
            <button
              onClick={() => setAppAlert(null)}
              className="ml-2 text-xs bg-black/20 hover:bg-black/40 px-2.5 py-1 rounded-lg transition shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        <header
          className="flex justify-between items-start pb-5 gap-4 flex-wrap border-b"
          style={{ borderColor: brand.border }}
        >
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border p-2 relative"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: brand.cyan,
                boxShadow: `0 15px 35px -10px rgba(0, 229, 255, 0.6), 0 0 30px -5px rgba(0, 229, 255, 0.3)`,
              }}
            >
              <img
                src="/logo.png"
                alt="Diamond Code"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="%2300E5FF" stroke-width="2.5"><path d="M10 4 L30 4 L36 14 L20 36 L4 14 Z"/><path d="M4 14 L36 14"/><path d="M10 4 L16 14 L20 36"/><path d="M30 4 L24 14 L20 36"/></svg>';
                }}
              />
            </div>

            <div className="min-w-0">
              <span
                className="text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider text-black"
                style={{
                  background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                  boxShadow: `0 6px 15px -5px rgba(0, 229, 255, 0.6)`,
                }}
              >
                Diamond Code POS
              </span>
              <h1 className="text-3xl font-black mt-2">Panel Maestro</h1>
              <p className="text-xs mt-1" style={{ color: brand.textSecondary }}>
                Gestión de sucursales y suscripciones
              </p>
            </div>
          </div>

          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => setIsCreatingBar(true)}
              className="font-bold px-4 py-2.5 rounded-xl text-sm transition"
              style={{
                background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                color: '#0A0F1A',
                boxShadow: `0 10px 25px -10px rgba(0, 229, 255, 0.6)`,
              }}
            >
              + Registrar Bar + Admin
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition border"
              style={{
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                borderColor: 'rgba(255, 107, 107, 0.3)',
                color: brand.coral,
              }}
            >
              Cerrar Sesión
            </button>
          </div>
        </header>

        {/* MÉTRICAS — 4 tarjetas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className="p-5 rounded-2xl shadow-xl border"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(0, 229, 255, 0.3)' }}
          >
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: brand.textSecondary }}>
              Bares Activos
            </h2>
            <p className="text-3xl font-black" style={{ color: brand.cyan }}>
              {activeBarsList.length}
            </p>
          </div>
          <div
            className="p-5 rounded-2xl shadow-xl border"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(255, 184, 77, 0.3)' }}
          >
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: brand.textSecondary }}>
              Bares Inactivos
            </h2>
            <p className="text-3xl font-black" style={{ color: brand.amber }}>
              {inactiveBarsList.length}
            </p>
          </div>
          <div
            className="p-5 rounded-2xl shadow-xl border"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(0, 224, 164, 0.3)' }}
          >
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: brand.textSecondary }}>
              Ingresos (mes)
            </h2>
            <p className="text-3xl font-black" style={{ color: brand.green }}>
              ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div
            className="p-5 rounded-2xl shadow-xl border"
            style={{
              backgroundColor: brand.surface,
              borderColor: expiringSoonList.length > 0 ? 'rgba(255, 184, 77, 0.4)' : 'rgba(100, 116, 139, 0.3)',
            }}
          >
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: brand.textSecondary }}>
              Por Vencer (≤3 días)
            </h2>
            <p
              className="text-3xl font-black"
              style={{ color: expiringSoonList.length > 0 ? brand.amber : brand.textMuted }}
            >
              {expiringSoonList.length}
            </p>
          </div>
        </div>

        {/* MÉTRICA USUARIOS TOTALES */}
        <div
          className="p-5 rounded-2xl shadow-xl border flex items-center justify-between flex-wrap gap-3"
          style={{ backgroundColor: brand.surface, borderColor: brand.border }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)' }}
            >
              👥
            </div>
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brand.textSecondary }}>
                Usuarios Totales (todos los bares)
              </h2>
              <p className="text-3xl font-black" style={{ color: brand.textPrimary }}>
                {totalUsers}
              </p>
            </div>
          </div>
          <div className="text-xs text-right" style={{ color: brand.textMuted }}>
            {profiles.filter((p) => p.role === 'admin').length} admins ·{' '}
            {profiles.filter((p) => p.role === 'cashier').length} cajeros ·{' '}
            {profiles.filter((p) => p.role === 'waiter').length} meseros
          </div>
        </div>

        {/* ALERTA DE BARES POR VENCER */}
        {expiringSoonList.length > 0 && (
          <div
            className="p-4 rounded-2xl border flex items-start gap-3"
            style={{
              backgroundColor: 'rgba(255, 184, 77, 0.08)',
              borderColor: 'rgba(255, 184, 77, 0.4)',
            }}
          >
            <span className="text-2xl shrink-0">⏰</span>
            <div className="flex-1">
              <p className="font-bold text-sm" style={{ color: brand.amber }}>
                {expiringSoonList.length} {expiringSoonList.length === 1 ? 'bar está' : 'bares están'} por vencer su trial
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#FFD79A' }}>
                {expiringSoonList.map((b) => b.name).join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* LISTA DE BARES */}
        <div
          className="p-6 rounded-2xl shadow-xl space-y-6 border"
          style={{ backgroundColor: brand.surface, borderColor: brand.border }}
        >
          <div
            className="flex gap-4 pb-3 border-b"
            style={{ borderColor: brand.border }}
          >
            <button
              onClick={() => setActiveTab('active')}
              className="pb-2 text-sm font-bold transition relative"
              style={{
                color: activeTab === 'active' ? brand.cyan : brand.textSecondary,
                borderBottom:
                  activeTab === 'active' ? `2px solid ${brand.cyan}` : '2px solid transparent',
              }}
            >
              🟢 Bares Activos ({activeBarsList.length})
            </button>
            <button
              onClick={() => setActiveTab('inactive')}
              className="pb-2 text-sm font-bold transition relative"
              style={{
                color: activeTab === 'inactive' ? brand.amber : brand.textSecondary,
                borderBottom:
                  activeTab === 'inactive' ? `2px solid ${brand.amber}` : '2px solid transparent',
              }}
            >
              ⛔ Bares Inactivos ({inactiveBarsList.length})
            </button>
          </div>

          {displayedBars.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: brand.textSecondary }}>
              {activeTab === 'active'
                ? 'No hay bares activos registrados.'
                : 'No hay ningún bar inactivo.'}
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
                    className="rounded-2xl p-5 flex flex-col justify-between space-y-4 transition border relative overflow-hidden"
                    style={{
                      backgroundColor: brand.surfaceLight,
                      borderColor: isInactive
                        ? 'rgba(255, 184, 77, 0.3)'
                        : brand.border,
                      opacity: isInactive ? 0.75 : 1,
                    }}
                  >
                    {/* Barra superior de color */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: isInactive ? brand.amber : brand.cyan }}
                    ></div>

                    <div className="space-y-2 mt-1">
                      <div className="flex justify-between items-start">
                        <h3
                          className={`font-bold text-lg ${isInactive ? 'line-through' : 'text-white'}`}
                          style={{ color: isInactive ? brand.textMuted : '#FFFFFF' }}
                        >
                          {bar.name}
                        </h3>
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-semibold border"
                          style={{
                            backgroundColor: isInactive
                              ? 'rgba(255, 184, 77, 0.15)'
                              : 'rgba(0, 229, 255, 0.15)',
                            color: isInactive ? brand.amber : brand.cyan,
                            borderColor: isInactive
                              ? 'rgba(255, 184, 77, 0.3)'
                              : 'rgba(0, 229, 255, 0.3)',
                          }}
                        >
                          {isInactive ? 'Inactivo' : 'Activo'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span style={{ color: brand.textMuted }}>Trial:</span>
                        <span className="font-bold" style={{ color: trial.color }}>
                          {trial.label}
                        </span>
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
                        <span style={{ color: brand.textMuted }}>Ingresos (mes):</span>
                        <span className="font-bold" style={{ color: brand.green }}>
                          ${revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <p className="text-xs" style={{ color: brand.textSecondary }}>
                        📍 {bar.address || 'Sin dirección'}
                      </p>
                      <p className="text-xs" style={{ color: brand.textSecondary }}>
                        📞 {bar.phone || 'Sin teléfono'}
                      </p>
                      <p
                        className="text-xs font-mono px-2 py-1 rounded border inline-block"
                        style={{
                          color: brand.cyan,
                          backgroundColor: 'rgba(0, 229, 255, 0.1)',
                          borderColor: 'rgba(0, 229, 255, 0.3)',
                        }}
                      >
                        slug: /{bar.slug}
                      </p>
                    </div>

                    <div
                      className="pt-3 flex flex-col gap-2 text-xs border-t"
                      style={{ borderColor: brand.border }}
                    >
                      <div className="flex justify-between items-center">
                        <span style={{ color: brand.textSecondary }}>Staff:</span>
                        <button
                          onClick={() => setSelectedBarForStaff(bar)}
                          className="font-bold px-2.5 py-1 rounded border transition"
                          style={{
                            color: brand.cyan,
                            backgroundColor: 'rgba(0, 229, 255, 0.1)',
                            borderColor: 'rgba(0, 229, 255, 0.3)',
                          }}
                        >
                          {barStaff.length} empleados (Ver)
                        </button>
                      </div>

                      <button
                        onClick={() => handleSendWhatsApp(bar)}
                        className="w-full mt-1 font-semibold py-2 rounded-lg border transition text-center"
                        style={{
                          backgroundColor: 'rgba(0, 224, 164, 0.1)',
                          color: brand.green,
                          borderColor: 'rgba(0, 224, 164, 0.35)',
                        }}
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
                        className="w-full font-semibold py-2 rounded-lg border transition text-center"
                        style={{
                          backgroundColor: 'rgba(0, 229, 255, 0.1)',
                          color: brand.cyan,
                          borderColor: 'rgba(0, 229, 255, 0.3)',
                        }}
                      >
                        🗓️ Editar Trial
                      </button>

                      <button
                        onClick={() => {
                          setManagingBar(bar);
                          setConfirmDeactivate(false);
                        }}
                        className="w-full font-semibold py-2 rounded-lg border transition text-center"
                        style={{
                          backgroundColor: brand.surface,
                          color: brand.textSecondary,
                          borderColor: brand.border,
                        }}
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
            <div
              className="w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: `0 25px 60px -20px rgba(0, 229, 255, 0.4)`,
              }}
            >
              <div
                className="flex justify-between items-center pb-3 border-b"
                style={{ borderColor: brand.border }}
              >
                <h3 className="text-lg font-bold text-white">
                  Editar Trial: {editingTrialBar.name}
                </h3>
                <button
                  onClick={() => setEditingTrialBar(null)}
                  className="text-lg font-bold hover:text-white"
                  style={{ color: brand.textSecondary }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateTrial} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Nueva fecha de fin de prueba
                  </label>
                  <input
                    type="date"
                    required
                    value={newTrialDate}
                    onChange={(e) => setNewTrialDate(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>

                <div
                  className="rounded-xl p-3 text-xs space-y-1 border"
                  style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                >
                  <p className="font-semibold" style={{ color: brand.textSecondary }}>
                    Atajos rápidos:
                  </p>
                  <div className="flex gap-2 flex-wrap pt-1">
                    {[7, 15, 30, 60, 90].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + days);
                          setNewTrialDate(d.toISOString().split('T')[0]);
                        }}
                        className="px-2.5 py-1 rounded border text-[11px] font-semibold transition"
                        style={{
                          backgroundColor: 'rgba(0, 229, 255, 0.15)',
                          color: brand.cyan,
                          borderColor: 'rgba(0, 229, 255, 0.3)',
                        }}
                      >
                        +{days} días
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingTrialBar(null)}
                    className="w-1/2 font-medium py-2.5 rounded-xl text-sm border"
                    style={{
                      backgroundColor: brand.surfaceLight,
                      borderColor: brand.border,
                      color: brand.textSecondary,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-1/2 font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
                    style={{
                      background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                      color: '#0A0F1A',
                    }}
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
            <div
              className="w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-6 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: `0 25px 60px -20px rgba(0, 229, 255, 0.4)`,
              }}
            >
              <div
                className="flex justify-between items-center pb-3 border-b"
                style={{ borderColor: brand.border }}
              >
                <div>
                  <span className="text-xs font-semibold uppercase" style={{ color: brand.cyan }}>
                    Gestión de Sucursal
                  </span>
                  <h3 className="text-xl font-bold text-white">{managingBar.name}</h3>
                </div>
                <button
                  onClick={() => {
                    setManagingBar(null);
                    setConfirmDeactivate(false);
                  }}
                  className="text-lg font-bold hover:text-white"
                  style={{ color: brand.textSecondary }}
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
                    className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex justify-between items-center border"
                    style={{
                      backgroundColor: brand.surfaceLight,
                      borderColor: brand.border,
                      color: '#FFFFFF',
                    }}
                  >
                    <span>👥 Ver y auditar personal</span>
                    <span>→</span>
                  </button>

                  <div className="pt-4 border-t" style={{ borderColor: brand.border }}>
                    {managingBar.is_active === false ? (
                      <button
                        disabled={submitting}
                        onClick={() => handleUpdateBarStatus(managingBar.id, true)}
                        className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition border"
                        style={{
                          backgroundColor: 'rgba(0, 224, 164, 0.1)',
                          borderColor: 'rgba(0, 224, 164, 0.4)',
                          color: brand.green,
                        }}
                      >
                        🟢 Reactivar Sucursal
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeactivate(true)}
                        className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition border"
                        style={{
                          backgroundColor: 'rgba(255, 184, 77, 0.1)',
                          borderColor: 'rgba(255, 184, 77, 0.4)',
                          color: brand.amber,
                        }}
                      >
                        ⛔ Desactivar Sucursal
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="space-y-4 p-4 rounded-xl border"
                  style={{
                    backgroundColor: 'rgba(255, 184, 77, 0.08)',
                    borderColor: 'rgba(255, 184, 77, 0.4)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">⚠️</span>
                    <div>
                      <h4 className="font-bold text-sm" style={{ color: brand.amber }}>
                        ¿Desactivar "{managingBar.name}"?
                      </h4>
                      <p className="text-xs mt-1" style={{ color: '#FFD79A' }}>
                        Al desactivar esta sucursal:
                      </p>
                    </div>
                  </div>

                  <ul
                    className="text-xs space-y-1 pl-6 list-disc"
                    style={{ color: '#FFD79A' }}
                  >
                    <li>Los usuarios serán expulsados al recargar</li>
                    <li>No podrán iniciar sesión</li>
                    <li>Sus datos se conservan intactos</li>
                    <li>Puedes reactivarla cuando quieras</li>
                  </ul>

                  <div className="flex gap-3 pt-2">
                    <button
                      disabled={submitting}
                      onClick={() => setConfirmDeactivate(false)}
                      className="w-1/2 font-medium py-2.5 rounded-lg text-xs border"
                      style={{
                        backgroundColor: brand.surfaceLight,
                        borderColor: brand.border,
                        color: brand.textSecondary,
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={submitting}
                      onClick={() => handleUpdateBarStatus(managingBar.id, false)}
                      className="w-1/2 font-bold py-2.5 rounded-lg text-xs disabled:opacity-50"
                      style={{
                        background: `linear-gradient(135deg, ${brand.amber} 0%, #E5A030 100%)`,
                        color: '#0A0F1A',
                      }}
                    >
                      {submitting ? 'Desactivando...' : 'Sí, Desactivar'}
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
            <div
              className="w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-5 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: `0 25px 60px -20px rgba(0, 229, 255, 0.4)`,
              }}
            >
              <div
                className="flex justify-between items-center pb-3 border-b"
                style={{ borderColor: brand.border }}
              >
                <h3 className="text-xl font-bold text-white">
                  Staff de {selectedBarForStaff.name}
                </h3>
                <button
                  onClick={() => setSelectedBarForStaff(null)}
                  className="text-lg font-bold hover:text-white"
                  style={{ color: brand.textSecondary }}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto">
                {profiles.filter((p) => p.bar_id === selectedBarForStaff.id).length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: brand.textSecondary }}>
                    Sin personal registrado.
                  </p>
                ) : (
                  profiles
                    .filter((p) => p.bar_id === selectedBarForStaff.id)
                    .map((emp) => (
                      <div
                        key={emp.id}
                        className="p-3 rounded-xl flex justify-between items-center text-xs border"
                        style={{
                          backgroundColor: brand.surfaceLight,
                          borderColor: brand.border,
                        }}
                      >
                        <div>
                          <p className="font-bold text-white">{emp.full_name || 'Sin nombre'}</p>
                          <span
                            className="inline-block mt-1 px-2 py-0.5 rounded uppercase text-[10px] font-bold border"
                            style={{
                              backgroundColor: 'rgba(0, 229, 255, 0.1)',
                              color: brand.cyan,
                              borderColor: 'rgba(0, 229, 255, 0.3)',
                            }}
                          >
                            {emp.role}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
              <button
                onClick={() => setSelectedBarForStaff(null)}
                className="w-full font-medium py-2.5 rounded-xl text-sm transition border"
                style={{
                  backgroundColor: brand.surfaceLight,
                  borderColor: brand.border,
                  color: brand.textSecondary,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* MODAL: Crear bar + admin */}
        {isCreatingBar && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div
              className="w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: `0 25px 60px -20px rgba(0, 229, 255, 0.4)`,
              }}
            >
              <div
                className="flex justify-between items-center pb-3 border-b"
                style={{ borderColor: brand.border }}
              >
                <h3 className="text-xl font-bold text-white">Nuevo Bar & Administrador</h3>
                <button
                  onClick={() => setIsCreatingBar(false)}
                  className="text-lg font-bold hover:text-white"
                  style={{ color: brand.textSecondary }}
                >
                  ✕
                </button>
              </div>

              <div
                className="rounded-xl p-3 text-xs border"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.08)',
                  borderColor: 'rgba(0, 229, 255, 0.35)',
                  color: brand.cyan,
                }}
              >
                🎁 Se otorgarán <strong>15 días de prueba gratuita</strong> al registrar este bar.
              </div>

              <form onSubmit={handleCreateBarWithAdmin} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Nombre del Administrador *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carlos Pérez"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Nombre del Bar *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: La Taberna"
                    value={newBarName}
                    onChange={(e) => setNewBarName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Dirección (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Juárez #405"
                    value={newBarAddress}
                    onChange={(e) => setNewBarAddress(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Teléfono del Bar (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 951 123 4567"
                    value={newBarPhone}
                    onChange={(e) => setNewBarPhone(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    WhatsApp del Admin (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 5219511234567"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Correo del Admin *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@lataberna.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingBar(false)}
                    className="w-1/2 font-medium py-2.5 rounded-xl text-sm transition border"
                    style={{
                      backgroundColor: brand.surfaceLight,
                      borderColor: brand.border,
                      color: brand.textSecondary,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-1/2 font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                      color: '#0A0F1A',
                    }}
                  >
                    {submitting ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                        Creando...
                      </>
                    ) : (
                      'Crear'
                    )}
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