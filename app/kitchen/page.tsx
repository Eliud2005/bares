'use client';

import { createClient } from '@/lib/supabase';
import { useEffect, useState } from 'react';

type OrderItem = {
  id?: string;
  price: number;
  note: string | null;
  product_id: string;
  products?: { name: string } | { name: string }[];
};

type KitchenOrder = {
  id: string;
  table_name: string;
  status: string;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  order_items: OrderItem[];
};

type BarInfo = {
  id: string;
  name: string;
  slug?: string;
  is_active?: boolean;
};

type FilterTab = 'all' | 'pending' | 'preparing' | 'ready';

export default function KitchenDashboard() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());
  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  const [barInfo, setBarInfo] = useState<BarInfo | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [now, setNow] = useState(Date.now());

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

  // ---------- CARGAR DATOS ----------
  const loadData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/';
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('bar_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData?.bar_id) {
      console.error('❌ No se encontró bar para el cocinero:', profileError?.message);
      setLoading(false);
      return;
    }

    const barId = profileData.bar_id;
    setCurrentBarId(barId);

    const { data: barData } = await supabase
      .from('bars')
      .select('id, name, slug, is_active')
      .eq('id', barId)
      .single();

    // ✅ Validar que el bar esté activo
    if (barData && barData.is_active === false) {
      await supabase.auth.signOut();
      window.location.href = '/?reason=bar_inactive';
      return;
    }

    if (barData) setBarInfo(barData as BarInfo);

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name')
      .eq('bar_id', barId);

    if (productsData) {
      setProductsMap(new Map(productsData.map((p) => [p.id, p.name])));
    }

    // Solo traer órdenes activas: pending, preparing, ready
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_name,
        status,
        created_at,
        preparing_at,
        ready_at,
        order_items (
          id,
          price,
          note,
          product_id,
          products ( name )
        )
      `)
      .eq('bar_id', barId)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error cargando órdenes:', error.message);
    }

    if (ordersData) setOrders(ordersData as KitchenOrder[]);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reloj local para actualizar el contador de tiempo cada segundo
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  // ---------- CAMBIAR ESTADO DE ORDEN ----------
  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      const nowIso = new Date().toISOString();

      if (newStatus === 'preparing') updates.preparing_at = nowIso;
      if (newStatus === 'ready') updates.ready_at = nowIso;

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .eq('bar_id', currentBarId);

      if (error) throw error;

      // Optimistic update local
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: newStatus, ...(newStatus === 'preparing' && { preparing_at: nowIso }), ...(newStatus === 'ready' && { ready_at: nowIso }) }
            : o
        )
      );

      await loadData();
    } catch (err: any) {
      setAppAlert({
        type: 'error',
        message: 'Error al actualizar: ' + err.message,
      });
    }
  };

  // ---------- HELPERS ----------
  const getElapsedTime = (startIso: string) => {
    const start = new Date(startIso).getTime();
    const diff = Math.floor((now - start) / 1000); // segundos

    const mins = Math.floor(diff / 60);
    const secs = diff % 60;

    if (mins < 60) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  const getUrgencyColor = (startIso: string) => {
    const mins = Math.floor((now - new Date(startIso).getTime()) / 60000);
    if (mins < 5) return brand.green;
    if (mins < 10) return brand.amber;
    return brand.coral;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Nueva', color: brand.cyan };
      case 'preparing':
        return { label: 'Preparando', color: brand.amber };
      case 'ready':
        return { label: 'Lista', color: brand.green };
      default:
        return { label: status, color: brand.textMuted };
    }
  };

  const getProductName = (item: OrderItem) => {
    const rawP = item.products;
    return Array.isArray(rawP)
      ? rawP[0]?.name
      : rawP?.name || productsMap.get(item.product_id) || 'Producto';
  };

  // ---------- FILTROS ----------
  const filteredOrders = orders.filter((o) => {
    if (filter === 'all') return true;
    return o.status === filter;
  });

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
  };

  // ---------- RENDER ----------
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
          <span style={{ color: brand.textSecondary }}>Cargando cocina...</span>
        </div>
      </div>
    );

  return (
    <main
      className="min-h-screen text-white p-4 relative overflow-hidden"
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
        <div className="fixed top-6 right-6 z-50 animate-bounce max-w-sm">
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
              appAlert.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-red-950/90 border-red-500 text-red-200'
            } backdrop-blur-md`}
          >
            <span className="text-xl font-bold">
              {appAlert.type === 'success' ? '✅' : '❌'}
            </span>
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

      <div className="max-w-7xl mx-auto relative z-10">
        {/* HEADER */}
        <header
          className="flex justify-between items-start mb-6 pb-4 gap-4 flex-wrap border-b"
          style={{ borderColor: brand.border }}
        >
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border p-2"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: brand.amber,
                boxShadow: `0 10px 25px -10px rgba(255, 184, 77, 0.6)`,
              }}
            >
              <img
                src="/logo.png"
                alt="Diamond Code"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="%23FFB84D" stroke-width="2.5"><path d="M10 4 L30 4 L36 14 L20 36 L4 14 Z"/><path d="M4 14 L36 14"/><path d="M10 4 L16 14 L20 36"/><path d="M30 4 L24 14 L20 36"/></svg>';
                }}
              />
            </div>

            <div className="min-w-0">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-bold uppercase text-black"
                style={{
                  background: `linear-gradient(135deg, ${brand.amber} 0%, #FF9500 100%)`,
                }}
              >
                🍳 Cocina
              </span>
              <h1 className="text-2xl font-bold mt-1 truncate">
                {barInfo?.name || 'Pedidos en Preparación'}
              </h1>
              {barInfo?.slug && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded border inline-block mt-1"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.amber,
                  }}
                >
                  /{barInfo.slug}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 border"
            style={{
              backgroundColor: 'rgba(255, 107, 107, 0.1)',
              borderColor: 'rgba(255, 107, 107, 0.3)',
              color: brand.coral,
            }}
          >
            Cerrar Sesión
          </button>
        </header>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(
            [
              { key: 'all', label: 'Todos', count: counts.all, color: brand.cyan },
              { key: 'pending', label: '🆕 Nuevas', count: counts.pending, color: brand.cyan },
              { key: 'preparing', label: '🔥 Preparando', count: counts.preparing, color: brand.amber },
              { key: 'ready', label: '✅ Listas', count: counts.ready, color: brand.green },
            ] as { key: FilterTab; label: string; count: number; color: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="px-4 py-2.5 rounded-xl font-bold text-sm transition border flex items-center gap-2"
              style={{
                backgroundColor:
                  filter === tab.key ? `${tab.color}20` : brand.surface,
                borderColor: filter === tab.key ? tab.color : brand.border,
                color: filter === tab.key ? tab.color : brand.textSecondary,
              }}
            >
              {tab.label}
              <span
                className="text-xs font-black px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: filter === tab.key ? tab.color : brand.surfaceLight,
                  color: filter === tab.key ? '#0A0F1A' : brand.textMuted,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ORDERS GRID */}
        {filteredOrders.length === 0 ? (
          <div
            className="text-center py-20 rounded-2xl border"
            style={{
              backgroundColor: brand.surface,
              borderColor: brand.border,
            }}
          >
            <div className="text-6xl mb-4">🍽️</div>
            <p className="text-lg font-bold" style={{ color: brand.textSecondary }}>
              No hay pedidos {filter === 'all' ? 'activos' : filter === 'pending' ? 'nuevos' : filter === 'preparing' ? 'en preparación' : 'listos'}
            </p>
            <p className="text-sm mt-1" style={{ color: brand.textMuted }}>
              Los pedidos nuevos aparecerán aquí automáticamente
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map((order) => {
              const badge = getStatusBadge(order.status);
              const urgencyColor = getUrgencyColor(order.created_at);
              const elapsed = getElapsedTime(order.created_at);
              const isReady = order.status === 'ready';

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border flex flex-col relative overflow-hidden"
                  style={{
                    backgroundColor: brand.surface,
                    borderColor: badge.color,
                    boxShadow: `0 10px 25px -10px ${badge.color}40`,
                  }}
                >
                  {/* Barra superior de estado */}
                  <div
                    className="h-1.5"
                    style={{ backgroundColor: badge.color }}
                  ></div>

                  {/* Header de la tarjeta */}
                  <div className="p-4 border-b" style={{ borderColor: brand.border }}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-xl truncate">{order.table_name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: `${badge.color}15`,
                              color: badge.color,
                              borderColor: `${badge.color}40`,
                            }}
                          >
                            {badge.label}
                          </span>
                          <span
                            className="text-xs font-bold"
                            style={{ color: urgencyColor }}
                          >
                            ⏱️ {elapsed}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-4 flex-1 space-y-2 max-h-60 overflow-y-auto">
                    {order.order_items?.map((item, idx) => {
                      const productName = getProductName(item);
                      const hasNote = !!item.note;

                      return (
                        <div
                          key={item.id || idx}
                          className="rounded-lg p-2.5 border"
                          style={{
                            backgroundColor: hasNote
                              ? 'rgba(255, 107, 107, 0.08)'
                              : brand.surfaceLight,
                            borderColor: hasNote
                              ? 'rgba(255, 107, 107, 0.4)'
                              : brand.border,
                          }}
                        >
                          <p className="font-bold text-sm text-white">
                            {productName}
                          </p>
                          {hasNote && (
                            <p
                              className="text-xs font-bold mt-1 flex items-start gap-1"
                              style={{ color: brand.coral }}
                            >
                              <span>📝</span>
                              <span className="uppercase">{item.note}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón de acción */}
                  <div className="p-3 border-t" style={{ borderColor: brand.border }}>
                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'preparing')}
                        className="w-full font-black py-3.5 rounded-xl text-sm transition uppercase tracking-wide"
                        style={{
                          background: `linear-gradient(135deg, ${brand.amber} 0%, #E5A030 100%)`,
                          color: '#0A0F1A',
                          boxShadow: `0 10px 25px -10px rgba(255, 184, 77, 0.6)`,
                        }}
                      >
                        🔥 Empezar a Preparar
                      </button>
                    )}

                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="w-full font-black py-3.5 rounded-xl text-sm transition uppercase tracking-wide"
                        style={{
                          background: `linear-gradient(135deg, ${brand.green} 0%, #00B888 100%)`,
                          color: '#0A0F1A',
                          boxShadow: `0 10px 25px -10px rgba(0, 224, 164, 0.6)`,
                        }}
                      >
                        ✅ Marcar como Lista
                      </button>
                    )}

                    {isReady && (
                      <div
                        className="text-center py-3 rounded-xl text-sm font-bold uppercase tracking-wide border"
                        style={{
                          backgroundColor: 'rgba(0, 224, 164, 0.1)',
                          borderColor: 'rgba(0, 224, 164, 0.4)',
                          color: brand.green,
                        }}
                      >
                        ⏳ Esperando al mesero
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer con leyenda de colores */}
        <div
          className="mt-8 p-4 rounded-2xl border flex flex-wrap gap-4 items-center justify-center text-xs"
          style={{
            backgroundColor: brand.surface,
            borderColor: brand.border,
            color: brand.textMuted,
          }}
        >
          <span className="font-bold uppercase tracking-wider" style={{ color: brand.textSecondary }}>
            Tiempo de espera:
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.green }}></span>
            <span>Menos de 5 min</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.amber }}></span>
            <span>5-10 min</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.coral }}></span>
            <span>Más de 10 min</span>
          </span>
        </div>
      </div>
    </main>
  );
}