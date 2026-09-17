'use client';

import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type OrderItem = {
  id?: string;
  price: number;
  note: string | null;
  product_id: string;
  products?: { name: string } | { name: string }[];
};

type ActiveOrder = {
  id: string;
  table_name: string;
  status: string;
  bar_id?: string;
  created_at?: string;
  order_items: OrderItem[];
};

type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed';

type BarInfo = {
  id: string;
  name: string;
  slug?: string;
  is_active?: boolean;
};

export default function CashierDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());

  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  const [barInfo, setBarInfo] = useState<BarInfo | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [tip, setTip] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayTips, setTodayTips] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [todayByMethod, setTodayByMethod] = useState<Record<string, number>>({});

  const [appAlert, setAppAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();
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
    greenBright: '#00E0A4',
    coral: '#FF6B6B',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
  };

  const loadData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/';
      return;
    }

    setCurrentUserId(session.user.id);

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('bar_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData?.bar_id) {
      setAppAlert({
        type: 'error',
        message: 'No se encontró un bar asociado a tu usuario de caja.',
      });
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

    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_name,
        status,
        bar_id,
        created_at,
        order_items (
          id,
          price,
          note,
          product_id,
          products ( name )
        )
      `)
      .eq('bar_id', barId)
      .in('status', ['pending', 'ready'])
      .order('table_name', { ascending: true });

    if (error) {
      console.error('❌ Error cargando órdenes:', error.message);
    }

    if (ordersData) {
      setActiveOrders(ordersData as ActiveOrder[]);

      if (selectedOrder) {
        const updated = ordersData.find((o: any) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated as ActiveOrder);
        else setSelectedOrder(null);
      }
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('id, payment_method, tip, order_items ( price )')
      .eq('bar_id', barId)
      .in('status', ['paid', 'completed'])
      .gte('paid_at', startOfToday.toISOString());

    let revenue = 0;
    let tips = 0;
    let count = 0;
    const byMethod: Record<string, number> = {};

    (todayOrders || []).forEach((o: any) => {
      const total = (o.order_items || []).reduce(
        (s: number, it: any) => s + Number(it.price || 0),
        0
      );
      const tipAmt = Number(o.tip || 0);
      revenue += total;
      tips += tipAmt;
      count += 1;
      const method = o.payment_method || 'unknown';
      byMethod[method] = (byMethod[method] || 0) + total;
    });

    setTodayRevenue(revenue);
    setTodayTips(tips);
    setTodayCount(count);
    setTodayByMethod(byMethod);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleCheckout = async () => {
    if (!selectedOrder || !currentBarId) return;

    const subtotal =
      selectedOrder.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
    const tipNum = parseFloat(tip) || 0;
    const cashNum = parseFloat(cashReceived) || 0;

    if (paymentMethod === 'cash' && cashNum < subtotal) {
      setAppAlert({ type: 'error', message: 'El efectivo recibido es menor al total.' });
      return;
    }

    if (tipNum < 0) {
      setAppAlert({ type: 'error', message: 'La propina no puede ser negativa.' });
      return;
    }

    setProcessing(true);

    try {
      const now = new Date().toISOString();

      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method: paymentMethod,
          tip: tipNum,
          paid_by: currentUserId,
          paid_at: now,
        })
        .eq('id', selectedOrder.id)
        .eq('bar_id', currentBarId);

      if (orderError) throw orderError;

      const match = selectedOrder.table_name.match(/\d+/);
      if (match) {
        const num = parseInt(match[0]);
        const { error: tableError } = await supabase
          .from('tables')
          .update({ status: 'cleaning' })
          .eq('bar_id', currentBarId)
          .eq('table_number', num);

        if (tableError) {
          console.warn('⚠️ No se pudo liberar la mesa:', tableError.message);
        }
      }

      setAppAlert({
        type: 'success',
        message: `¡Mesa ${selectedOrder.table_name} cobrada! Total: $${subtotal.toFixed(2)}${
          tipNum > 0 ? ` + propina $${tipNum.toFixed(2)}` : ''
        }`,
      });

      setSelectedOrder(null);
      setCashReceived('');
      setTip('');
      setPaymentMethod('cash');
      await loadData();
    } catch (err: any) {
      setAppAlert({ type: 'error', message: 'Error al cobrar: ' + err.message });
    } finally {
      setProcessing(false);
    }
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
          <span style={{ color: brand.textSecondary }}>Cargando caja...</span>
        </div>
      </div>
    );

  const totalPendingRevenue = activeOrders.reduce((acc, order) => {
    const sum = order.order_items?.reduce((s, i) => s + Number(i.price), 0) || 0;
    return acc + sum;
  }, 0);

  const selectedOrderSubtotal =
    selectedOrder?.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
  const selectedOrderTip = parseFloat(tip) || 0;
  const selectedOrderTotal = selectedOrderSubtotal + selectedOrderTip;
  const cashNum = parseFloat(cashReceived) || 0;
  const changeDue = cashNum >= selectedOrderTotal ? cashNum - selectedOrderTotal : 0;

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
        <div className="fixed top-6 right-6 z-50 animate-bounce">
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

      <div className="max-w-6xl mx-auto relative z-10">
        {/* HEADER */}
        <header
          className="flex justify-between items-start mb-8 pb-4 gap-4 flex-wrap border-b"
          style={{ borderColor: brand.border }}
        >
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border p-2"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: brand.cyan,
                boxShadow: `0 10px 25px -10px rgba(0, 229, 255, 0.6)`,
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
                className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase text-black"
                style={{
                  background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                }}
              >
                Caja - Sucursal
              </span>
              <h1 className="text-3xl font-bold mt-1 truncate">
                {barInfo?.name || 'Caja y Cobros'}
              </h1>
              {barInfo?.slug && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded border inline-block mt-2"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.cyan,
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

        {/* CORTE DEL DÍA */}
        <div
          className="p-6 rounded-2xl mb-6 space-y-4 border"
          style={{
            background: `linear-gradient(135deg, rgba(0, 229, 255, 0.08) 0%, ${brand.surface} 100%)`,
            borderColor: 'rgba(0, 229, 255, 0.3)',
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: brand.cyan }}>
                💰 Corte del Día
              </h2>
              <p className="text-xs mt-0.5" style={{ color: brand.textSecondary }}>
                Resumen de tus cobros desde las 00:00 de hoy
              </p>
            </div>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-semibold border"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                color: brand.cyan,
                borderColor: 'rgba(0, 229, 255, 0.3)',
              }}
            >
              {new Date().toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'rgba(0, 224, 164, 0.08)',
                borderColor: 'rgba(0, 224, 164, 0.3)',
              }}
            >
              <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                Total cobrado
              </span>
              <span className="text-2xl font-black" style={{ color: brand.greenBright }}>
                ${todayRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'rgba(255, 184, 77, 0.08)',
                borderColor: 'rgba(255, 184, 77, 0.3)',
              }}
            >
              <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                Propinas
              </span>
              <span className="text-2xl font-black" style={{ color: brand.amber }}>
                ${todayTips.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                borderColor: 'rgba(0, 229, 255, 0.3)',
              }}
            >
              <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                Mesas cobradas
              </span>
              <span className="text-2xl font-black text-white">{todayCount}</span>
            </div>
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                borderColor: 'rgba(0, 229, 255, 0.3)',
              }}
            >
              <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                Efectivo en caja
              </span>
              <span className="text-2xl font-black" style={{ color: brand.cyan }}>
                ${(todayByMethod['cash'] || 0).toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          {(todayByMethod['card'] || todayByMethod['transfer'] || todayByMethod['mixed']) && (
            <div
              className="flex flex-wrap gap-2 pt-2 border-t"
              style={{ borderColor: brand.border }}
            >
              {todayByMethod['cash'] > 0 && (
                <span
                  className="text-xs px-3 py-1 rounded-lg border"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.cyan,
                  }}
                >
                  💵 Efectivo: ${todayByMethod['cash'].toFixed(2)}
                </span>
              )}
              {todayByMethod['card'] > 0 && (
                <span
                  className="text-xs px-3 py-1 rounded-lg border"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.cyan,
                  }}
                >
                  💳 Tarjeta: ${todayByMethod['card'].toFixed(2)}
                </span>
              )}
              {todayByMethod['transfer'] > 0 && (
                <span
                  className="text-xs px-3 py-1 rounded-lg border"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.cyan,
                  }}
                >
                  📱 Transferencia: ${todayByMethod['transfer'].toFixed(2)}
                </span>
              )}
              {todayByMethod['mixed'] > 0 && (
                <span
                  className="text-xs px-3 py-1 rounded-lg border"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.cyan,
                  }}
                >
                  🔀 Mixto: ${todayByMethod['mixed'].toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* RESUMEN RÁPIDO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div
            className="p-6 rounded-2xl border shadow-lg"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(0, 229, 255, 0.3)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: brand.textSecondary }}>
              Mesas Ocupadas Actuales
            </h2>
            <p className="text-3xl font-bold" style={{ color: brand.cyan }}>
              {activeOrders.length}
            </p>
          </div>
          <div
            className="p-6 rounded-2xl border shadow-lg"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(0, 224, 164, 0.3)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: brand.textSecondary }}>
              Dinero en Cuentas Activas
            </h2>
            <p className="text-3xl font-bold" style={{ color: brand.greenBright }}>
              ${totalPendingRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        {/* CUENTAS POR COBRAR */}
        <div
          className="p-6 rounded-2xl border shadow-xl"
          style={{ backgroundColor: brand.surface, borderColor: brand.border }}
        >
          <h2 className="text-xl font-semibold mb-4">Cuentas por Cobrar en Mesas</h2>

          {activeOrders.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: brand.textSecondary }}>
              No hay cuentas pendientes de pago en este momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map((order) => {
                const orderTotal =
                  order.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl p-4 flex flex-col justify-between space-y-4 border relative overflow-hidden"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: brand.amber }}
                    ></div>

                    <div className="mt-1">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg" style={{ color: brand.amber }}>
                          {order.table_name}
                        </h3>
                        <span
                          className="text-xs px-2 py-0.5 rounded font-semibold border"
                          style={{
                            backgroundColor: 'rgba(255, 184, 77, 0.1)',
                            color: brand.amber,
                            borderColor: 'rgba(255, 184, 77, 0.3)',
                          }}
                        >
                          {order.order_items?.length || 0} items
                        </span>
                      </div>

                      <div
                        className="space-y-1 max-h-32 overflow-y-auto pr-1 text-xs border-t pt-2"
                        style={{ color: brand.textSecondary, borderColor: brand.border }}
                      >
                        {order.order_items?.map((item, idx) => {
                          const rawP = item.products;
                          const pName = Array.isArray(rawP)
                            ? rawP[0]?.name
                            : rawP?.name || productsMap.get(item.product_id) || 'Producto';
                          return (
                            <div key={item.id || idx} className="flex justify-between">
                              <span className="truncate max-w-[170px]">• {pName}</span>
                              <span style={{ color: brand.cyan }}>${item.price}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      className="border-t pt-3 flex items-center justify-between"
                      style={{ borderColor: brand.border }}
                    >
                      <div>
                        <span className="text-xs block" style={{ color: brand.textSecondary }}>
                          Total a pagar
                        </span>
                        <span className="text-lg font-black" style={{ color: brand.greenBright }}>
                          ${orderTotal.toFixed(2)}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setCashReceived('');
                          setTip('');
                          setPaymentMethod('cash');
                          setAppAlert(null);
                        }}
                        className="font-bold px-4 py-2 rounded-lg text-xs transition"
                        style={{
                          background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                          color: '#0A0F1A',
                          boxShadow: '0 10px 20px -10px rgba(0, 229, 255, 0.6)',
                        }}
                      >
                        Cobrar Mesa
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODAL DE COBRO */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div
              className="w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: '0 25px 60px -20px rgba(0, 229, 255, 0.4)',
              }}
            >
              <div
                className="flex justify-between items-center border-b pb-3"
                style={{ borderColor: brand.border }}
              >
                <div>
                  <span className="text-xs font-semibold uppercase" style={{ color: brand.cyan }}>
                    Punto de Cobro
                  </span>
                  <h3 className="text-xl font-bold text-white">{selectedOrder.table_name}</h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Desglose */}
              <div
                className="space-y-2 max-h-40 overflow-y-auto pr-1 p-3 rounded-xl border"
                style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
              >
                <span className="text-xs font-bold uppercase" style={{ color: brand.textSecondary }}>
                  Resumen de la cuenta
                </span>
                {selectedOrder.order_items?.map((item, idx) => {
                  const rawP = item.products;
                  const pName = Array.isArray(rawP)
                    ? rawP[0]?.name
                    : rawP?.name || productsMap.get(item.product_id) || 'Producto';
                  return (
                    <div key={idx} className="flex justify-between text-sm">
                      <div>
                        <span className="text-white">{pName}</span>
                        {item.note && (
                          <span className="text-xs block" style={{ color: brand.amber }}>
                            Nota: {item.note}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold" style={{ color: brand.cyan }}>
                        ${item.price}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Subtotal */}
              <div
                className="flex justify-between items-center px-4 py-3 rounded-xl border"
                style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
              >
                <span className="text-sm font-semibold" style={{ color: brand.textSecondary }}>
                  Subtotal:
                </span>
                <span className="text-lg font-bold text-white">
                  ${selectedOrderSubtotal.toFixed(2)}
                </span>
              </div>

              {/* Propina */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
              >
                <label className="block text-xs font-semibold uppercase" style={{ color: brand.textSecondary }}>
                  Propina (Opcional)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[0, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() =>
                        setTip(
                          pct === 0
                            ? ''
                            : ((selectedOrderSubtotal * pct) / 100).toFixed(2)
                        )
                      }
                      className="px-3 py-1 rounded-lg text-xs font-semibold transition border"
                      style={{
                        backgroundColor:
                          tip === (pct === 0 ? '' : ((selectedOrderSubtotal * pct) / 100).toFixed(2))
                            ? brand.amber
                            : brand.bg,
                        color:
                          tip === (pct === 0 ? '' : ((selectedOrderSubtotal * pct) / 100).toFixed(2))
                            ? '#0A0F1A'
                            : brand.textSecondary,
                        borderColor:
                          tip === (pct === 0 ? '' : ((selectedOrderSubtotal * pct) / 100).toFixed(2))
                            ? 'transparent'
                            : brand.border,
                      }}
                    >
                      {pct === 0 ? 'Sin propina' : `${pct}%`}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="O escribe el monto"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-white text-lg font-bold focus:outline-none border"
                  style={{ backgroundColor: brand.bg, borderColor: brand.border }}
                />
              </div>

              {/* Método de pago */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
              >
                <label className="block text-xs font-semibold uppercase" style={{ color: brand.textSecondary }}>
                  Método de pago
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'cash', label: '💵 Efectivo' },
                      { key: 'card', label: '💳 Tarjeta' },
                      { key: 'transfer', label: '📱 Transfer.' },
                    ] as { key: PaymentMethod; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPaymentMethod(m.key)}
                      className="py-2.5 rounded-xl text-xs font-semibold transition border"
                      style={{
                        background:
                          paymentMethod === m.key
                            ? `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`
                            : brand.bg,
                        color: paymentMethod === m.key ? '#0A0F1A' : brand.textSecondary,
                        borderColor: paymentMethod === m.key ? 'transparent' : brand.border,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculadora de efectivo */}
              {paymentMethod === 'cash' && (
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold" style={{ color: brand.textSecondary }}>
                      Total a pagar:
                    </span>
                    <span className="text-2xl font-black" style={{ color: brand.greenBright }}>
                      ${selectedOrderTotal.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase mb-1" style={{ color: brand.textSecondary }}>
                      Efectivo recibido ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-white text-lg font-bold focus:outline-none border"
                      style={{ backgroundColor: brand.bg, borderColor: brand.border }}
                      autoFocus
                    />
                  </div>

                  {cashNum > 0 && (
                    <div
                      className="flex justify-between items-center pt-2 border-t"
                      style={{ borderColor: brand.border }}
                    >
                      <span className="text-sm font-semibold" style={{ color: brand.textSecondary }}>
                        Cambio a devolver:
                      </span>
                      <span
                        className="text-xl font-bold"
                        style={
                          cashNum >= selectedOrderTotal
                            ? { color: brand.cyan }
                            : { color: brand.coral }
                        }
                      >
                        {cashNum >= selectedOrderTotal
                          ? `$${changeDue.toFixed(2)}`
                          : 'Falta dinero'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Total final (si no es efectivo) */}
              {paymentMethod !== 'cash' && (
                <div
                  className="p-4 rounded-xl border flex justify-between items-center"
                  style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                >
                  <span className="text-sm font-semibold" style={{ color: brand.textSecondary }}>
                    Total a cobrar:
                  </span>
                  <span className="text-2xl font-black" style={{ color: brand.greenBright }}>
                    ${selectedOrderTotal.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-1/2 font-medium py-3 rounded-xl text-sm transition border"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                    color: brand.textSecondary,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={
                    processing ||
                    (paymentMethod === 'cash' && cashNum < selectedOrderTotal)
                  }
                  className="w-1/2 font-bold py-3 rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                    boxShadow: '0 10px 25px -10px rgba(0, 229, 255, 0.6)',
                  }}
                >
                  {processing ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                      Procesando...
                    </>
                  ) : (
                    'Cobrar y Liberar Mesa'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}