'use client';

import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';

type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  bar_id?: string;
};

type OrderItem = {
  id?: string;
  product_name: string;
  price: number;
  note: string | null;
};

type ActiveOrder = {
  id: string;
  table_name: string;
  status: string;
  bar_id?: string;
  order_items: OrderItem[];
};

type Table = {
  id: string;
  bar_id: string;
  table_number: number;
  status: string | null;
  is_active: boolean;
};

export default function WaiterDashboard() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeTables, setActiveTables] = useState<Record<string, ActiveOrder>>({});

  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  const [barName, setBarName] = useState<string>('');

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSubView, setTableSubView] = useState<'menu' | 'cart'>('menu');

  const [currentOrder, setCurrentOrder] = useState<{ product: Product; note: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeProductForNote, setActiveProductForNote] = useState<Product | null>(null);
  const [tempNote, setTempNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    coral: '#FF6B6B',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
  };

  const getTableName = (num: number) => `Mesa ${String(num).padStart(2, '0')}`;

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
      console.error('❌ Error al obtener el bar del mesero:', profileError?.message);
      setLoading(false);
      return;
    }

    const barId = profileData.bar_id;
    setCurrentBarId(barId);

    const { data: barData } = await supabase
      .from('bars')
      .select('name, is_active')
      .eq('id', barId)
      .single();

    // ✅ Validar que el bar esté activo
    if (barData && barData.is_active === false) {
      await supabase.auth.signOut();
      window.location.href = '/?reason=bar_inactive';
      return;
    }

    if (barData?.name) setBarName(barData.name);

    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('bar_id', barId)
      .eq('is_active', true);

    if (productsData) setProducts(productsData);

    const { data: tablesData, error: tablesError } = await supabase
      .from('tables')
      .select('id, bar_id, table_number, status, is_active')
      .eq('bar_id', barId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('table_number', { ascending: true });

    if (tablesError) {
      console.error('❌ Error cargando mesas:', tablesError.message);
    }

    if (tablesData) setTables(tablesData as Table[]);

    // Traer órdenes activas: pending, preparing Y ready
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_name,
        status,
        bar_id,
        order_items (
          id,
          price,
          note,
          product_id,
          products ( name )
        )
      `)
      .eq('bar_id', barId)
      .in('status', ['pending', 'preparing', 'ready']);

    if (error) {
      console.error('❌ Error cargando órdenes:', error.message);
    }

    if (ordersData) {
      const tablesMap: Record<string, ActiveOrder> = {};
      const productsMap = new Map(productsData?.map((p) => [p.id, p.name]) || []);

      ordersData.forEach((ord: any) => {
        const tableNameKey = ord.table_name;
        if (!tableNameKey) return;

        const formattedItems =
          ord.order_items?.map((item: any) => {
            const resolvedName =
              item.products?.name || productsMap.get(item.product_id) || 'Producto sin nombre';
            return {
              id: item.id,
              product_name: resolvedName,
              price: item.price,
              note: item.note,
            };
          }) || [];

        tablesMap[tableNameKey] = {
          id: ord.id,
          table_name: tableNameKey,
          status: ord.status,
          bar_id: ord.bar_id,
          order_items: formattedItems,
        };
      });

      setActiveTables(tablesMap);
    }

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

  const handleAddWithNote = () => {
    if (!activeProductForNote) return;
    setCurrentOrder([
      ...currentOrder,
      { product: activeProductForNote, note: tempNote.trim() },
    ]);
    setActiveProductForNote(null);
    setTempNote('');
  };

  const handleSendOrder = async () => {
    if (currentOrder.length === 0 || !selectedTable || !currentBarId) return;
    setSubmitting(true);

    let activeOrder = activeTables[selectedTable];

    if (!activeOrder) {
      const { data: existingDbOrder } = await supabase
        .from('orders')
        .select('id, table_name, status, bar_id')
        .eq('bar_id', currentBarId)
        .eq('table_name', selectedTable)
        .in('status', ['pending', 'preparing', 'ready'])
        .maybeSingle();

      if (existingDbOrder) {
        activeOrder = {
          id: existingDbOrder.id,
          table_name: existingDbOrder.table_name,
          status: existingDbOrder.status,
          bar_id: existingDbOrder.bar_id,
          order_items: [],
        };
      }
    }

    let targetOrderId = activeOrder?.id;

    if (!targetOrderId) {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          table_name: selectedTable,
          status: 'pending',
          bar_id: currentBarId,
        })
        .select('id')
        .single();

      if (orderError) {
        console.error('❌ Error al crear orden:', orderError.message);
        setAppAlert({
          type: 'error',
          message: `No se pudo crear la orden: ${orderError.message}`,
        });
        setSubmitting(false);
        return;
      }
      targetOrderId = newOrder.id;
    }

    const itemsToInsert = currentOrder.map((item) => ({
      order_id: targetOrderId,
      product_id: item.product.id,
      price: item.product.price,
      note: item.note || null,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);

    if (itemsError) {
      console.error('❌ Error al insertar items:', itemsError.message);
      setAppAlert({
        type: 'error',
        message: `Error al guardar productos: ${itemsError.message}`,
      });
    } else {
      setAppAlert({
        type: 'success',
        message: `¡${currentOrder.length} ${currentOrder.length === 1 ? 'producto enviado' : 'productos enviados'} a cocina! 🍳`,
      });
      setCurrentOrder([]);
      await loadData();
      setTableSubView('cart');
    }

    setSubmitting(false);
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

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
          <span style={{ color: brand.textSecondary }}>Cargando sistema...</span>
        </div>
      </div>
    );

  const isTableBusy = (tableName: string) => !!activeTables[tableName];

  const getTableVisualStatus = (table: Table) => {
    const tableName = getTableName(table.table_number);
    const order = activeTables[tableName];

    if (order) {
      // Si tiene orden, ver el status específico
      if (order.status === 'ready') {
        return { label: '✓ Lista para servir', color: brand.green, pulse: true };
      }
      if (order.status === 'preparing') {
        return { label: '🔥 En preparación', color: brand.amber, pulse: true };
      }
      return { label: 'Ocupada', color: brand.amber, pulse: true };
    }

    if (table.status === 'cleaning') {
      return { label: 'Limpieza', color: brand.cyan, pulse: false };
    }
    if (table.status === 'occupied') {
      return { label: 'Ocupada', color: brand.amber, pulse: false };
    }
    return { label: 'Disponible', color: brand.green, pulse: false };
  };

  return (
    <main
      className="min-h-screen text-white p-4 relative overflow-hidden"
      style={{ backgroundColor: brand.bg }}
    >
      {/* GRID SUTIL DE FONDO */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(${brand.cyan} 1px, transparent 1px), linear-gradient(90deg, ${brand.cyan} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      ></div>

      {/* GLOW DECORATIVO */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(circle, ${brand.cyan} 0%, transparent 70%)` }}
        ></div>
        <div
          className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full blur-3xl opacity-15"
          style={{ background: `radial-gradient(circle, ${brand.amber} 0%, transparent 70%)` }}
        ></div>
      </div>

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

      <div className="max-w-md mx-auto relative z-10">
        {/* HEADER */}
        <header
          className="flex justify-between items-center mb-6 pb-3 border-b"
          style={{ borderColor: brand.border }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 p-1.5 border"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: brand.cyan,
                boxShadow: `0 8px 20px -8px rgba(0, 229, 255, 0.6)`,
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
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase text-black"
                style={{
                  background: `linear-gradient(135deg, ${brand.amber} 0%, #FF9500 100%)`,
                }}
              >
                Mesero
              </span>
              <h1 className="text-lg font-bold mt-0.5 truncate">
                {selectedTable ? selectedTable : barName || 'Mis Mesas'}
              </h1>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {selectedTable ? (
              <button
                onClick={() => {
                  setSelectedTable(null);
                  setCurrentOrder([]);
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition border"
                style={{
                  backgroundColor: brand.surface,
                  borderColor: brand.border,
                  color: brand.textSecondary,
                }}
              >
                ← Volver
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition border"
                style={{
                  backgroundColor: 'rgba(255, 107, 107, 0.1)',
                  borderColor: 'rgba(255, 107, 107, 0.3)',
                  color: brand.coral,
                }}
              >
                Salir
              </button>
            )}
          </div>
        </header>

        {/* LISTADO DE MESAS */}
        {!selectedTable ? (
          tables.length === 0 ? (
            <div
              className="text-center py-16 text-sm rounded-2xl border"
              style={{
                color: brand.textSecondary,
                backgroundColor: brand.surface,
                borderColor: brand.border,
              }}
            >
              No hay mesas configuradas. Pídele al admin que las agregue.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {tables.map((table) => {
                const tableName = getTableName(table.table_number);
                const activeOrder = activeTables[tableName];
                const isBusy = !!activeOrder;
                const isReady = activeOrder?.status === 'ready';
                const isPreparing = activeOrder?.status === 'preparing';
                const itemCount = activeOrder?.order_items?.length || 0;
                const visual = getTableVisualStatus(table);

                return (
                  <div
                    key={table.id}
                    onClick={() => {
                      setSelectedTable(tableName);
                      setTableSubView(isBusy ? 'cart' : 'menu');
                    }}
                    className="p-4 rounded-2xl cursor-pointer transition flex flex-col justify-between h-28 border relative overflow-hidden"
                    style={{
                      backgroundColor: isReady
                        ? 'rgba(0, 224, 164, 0.08)'
                        : isPreparing
                        ? 'rgba(255, 184, 77, 0.08)'
                        : brand.surface,
                      borderColor: isReady
                        ? brand.green
                        : isPreparing
                        ? brand.amber
                        : isBusy
                        ? brand.amber
                        : table.status === 'cleaning'
                        ? brand.cyan
                        : brand.border,
                      boxShadow: isReady
                        ? `0 10px 25px -10px rgba(0, 224, 164, 0.5)`
                        : isBusy
                        ? `0 10px 25px -10px rgba(255, 184, 77, 0.4)`
                        : `0 10px 25px -10px rgba(0, 0, 0, 0.5)`,
                    }}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: visual.color }}
                    ></div>

                    <div className="flex justify-between items-start mt-1">
                      <h3 className="font-bold text-lg">{tableName}</h3>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${visual.pulse ? 'animate-pulse' : ''}`}
                        style={{
                          backgroundColor: visual.color,
                          boxShadow: `0 0 8px ${visual.color}`,
                        }}
                      ></span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: visual.color }}>
                        {isBusy ? visual.label : visual.label}
                        {isBusy && ` (${itemCount} items)`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* VISTA DE MESA SELECCIONADA */
          <div className="space-y-4">
            {/* CUENTA */}
            {tableSubView === 'cart' && (
              <div className="space-y-4">
                {/* Banner de status si la orden está lista */}
                {activeTables[selectedTable]?.status === 'ready' && (
                  <div
                    className="p-4 rounded-2xl border flex items-center gap-3 animate-pulse"
                    style={{
                      backgroundColor: 'rgba(0, 224, 164, 0.15)',
                      borderColor: brand.green,
                      boxShadow: `0 10px 30px -10px rgba(0, 224, 164, 0.6)`,
                    }}
                  >
                    <span className="text-3xl">🔔</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: brand.green }}>
                        ¡Orden lista para servir!
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#8ff5d9' }}>
                        La cocina ya terminó de prepararla
                      </p>
                    </div>
                  </div>
                )}

                {activeTables[selectedTable]?.status === 'preparing' && (
                  <div
                    className="p-4 rounded-2xl border flex items-center gap-3"
                    style={{
                      backgroundColor: 'rgba(255, 184, 77, 0.15)',
                      borderColor: brand.amber,
                    }}
                  >
                    <span className="text-3xl">🔥</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: brand.amber }}>
                        Cocinero preparando...
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#FFD79A' }}>
                        La cocina está trabajando en esta orden
                      </p>
                    </div>
                  </div>
                )}

                <div
                  className="p-4 rounded-2xl space-y-3 border"
                  style={{
                    backgroundColor: brand.surface,
                    borderColor: brand.border,
                    boxShadow: '0 15px 35px -15px rgba(0, 0, 0, 0.6)',
                  }}
                >
                  <div
                    className="flex justify-between items-center pb-2 border-b"
                    style={{ borderColor: brand.border }}
                  >
                    <h2
                      className="text-sm font-bold uppercase tracking-wider"
                      style={{ color: brand.textSecondary }}
                    >
                      Cuenta Actual
                    </h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-bold border"
                      style={{
                        backgroundColor: 'rgba(0, 224, 164, 0.1)',
                        color: brand.green,
                        borderColor: 'rgba(0, 224, 164, 0.3)',
                      }}
                    >
                      ● En consumo
                    </span>
                  </div>

                  {!activeTables[selectedTable] ||
                  activeTables[selectedTable].order_items.length === 0 ? (
                    <div className="text-center py-8 text-sm" style={{ color: brand.textSecondary }}>
                      Esta mesa aún no tiene productos pedidos.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {activeTables[selectedTable].order_items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="p-3 rounded-xl flex justify-between items-start text-sm border"
                          style={{
                            backgroundColor: brand.surfaceLight,
                            borderColor: brand.border,
                          }}
                        >
                          <div>
                            <p className="font-medium text-white">{item.product_name}</p>
                            {item.note && (
                              <p className="text-xs mt-0.5" style={{ color: brand.amber }}>
                                📝 {item.note}
                              </p>
                            )}
                          </div>
                          <span className="font-bold" style={{ color: brand.green }}>
                            ${item.price}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTables[selectedTable] &&
                    activeTables[selectedTable].order_items.length > 0 && (
                      <div
                        className="pt-3 flex justify-between items-center border-t"
                        style={{ borderColor: brand.border }}
                      >
                        <span
                          className="text-sm font-semibold"
                          style={{ color: brand.textSecondary }}
                        >
                          Total:
                        </span>
                        <span className="text-2xl font-black" style={{ color: brand.green }}>
                          $
                          {activeTables[selectedTable].order_items
                            .reduce((acc, item) => acc + Number(item.price), 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    )}
                </div>

                <button
                  onClick={() => setTableSubView('menu')}
                  className="w-full font-bold py-3 rounded-xl text-sm transition"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                    boxShadow: `0 10px 25px -10px rgba(0, 229, 255, 0.6)`,
                  }}
                >
                  + Agregar más productos
                </button>
              </div>
            )}

            {/* MENÚ */}
            {tableSubView === 'menu' && (
              <div className="space-y-4">
                {activeTables[selectedTable] &&
                  activeTables[selectedTable].order_items.length > 0 && (
                    <button
                      onClick={() => setTableSubView('cart')}
                      className="w-full font-medium py-2 rounded-xl text-xs transition border"
                      style={{
                        backgroundColor: brand.surface,
                        borderColor: brand.border,
                        color: brand.textSecondary,
                      }}
                    >
                      ← Volver a Ver Cuenta Actual
                    </button>
                  )}

                {currentOrder.length > 0 && (
                  <div
                    className="p-4 rounded-2xl space-y-3 border"
                    style={{
                      backgroundColor: 'rgba(255, 184, 77, 0.08)',
                      borderColor: brand.amber,
                      boxShadow: `0 10px 25px -10px rgba(255, 184, 77, 0.3)`,
                    }}
                  >
                    <h3
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: brand.amber }}
                    >
                      🔔 Nuevos items por enviar ({currentOrder.length})
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {currentOrder.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center p-2.5 rounded-lg text-xs border"
                          style={{
                            backgroundColor: brand.surface,
                            borderColor: brand.border,
                          }}
                        >
                          <div>
                            <span className="font-medium">{item.product.name}</span>
                            {item.note && (
                              <span className="ml-1" style={{ color: brand.amber }}>
                                ({item.note})
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              setCurrentOrder(currentOrder.filter((_, i) => i !== idx))
                            }
                            className="px-2"
                            style={{ color: brand.coral }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleSendOrder}
                      disabled={submitting}
                      className="w-full font-bold py-3 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{
                        background: `linear-gradient(135deg, ${brand.green} 0%, #00B888 100%)`,
                        color: '#0A0F1A',
                        boxShadow: `0 10px 25px -10px rgba(0, 224, 164, 0.5)`,
                      }}
                    >
                      {submitting ? (
                        <>
                          <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                          Enviando a cocina...
                        </>
                      ) : (
                        '🍳 Enviar a Cocina'
                      )}
                    </button>
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 pl-10 text-white text-sm focus:outline-none border"
                    style={{
                      backgroundColor: brand.surface,
                      borderColor: brand.border,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = brand.cyan
                      e.target.style.boxShadow = `0 0 0 3px rgba(0, 229, 255, 0.15)`
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = brand.border
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  <svg
                    className="w-4 h-4 absolute left-3.5 top-3.5"
                    style={{ color: brand.textMuted }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    ></path>
                  </svg>
                </div>

                <div className="space-y-2">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="p-3 rounded-xl flex justify-between items-center border transition"
                      style={{
                        backgroundColor: brand.surface,
                        borderColor: brand.border,
                        boxShadow: '0 8px 20px -12px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      <div className="min-w-0">
                        <h4 className="font-medium text-white text-sm truncate">
                          {product.name}
                        </h4>
                        <p className="text-xs mt-0.5" style={{ color: brand.textSecondary }}>
                          {product.category} •{' '}
                          <span className="font-bold" style={{ color: brand.green }}>
                            ${product.price}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveProductForNote(product)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                          color: '#0A0F1A',
                          boxShadow: `0 6px 15px -6px rgba(0, 229, 255, 0.6)`,
                        }}
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p
                      className="text-center text-sm py-8 rounded-xl border"
                      style={{
                        color: brand.textMuted,
                        backgroundColor: brand.surface,
                        borderColor: brand.border,
                      }}
                    >
                      No hay productos que coincidan.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL NOTA */}
        {activeProductForNote && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div
              className="w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-4 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: `0 25px 60px -20px rgba(0, 229, 255, 0.4)`,
              }}
            >
              <div>
                <span
                  className="text-xs font-bold uppercase"
                  style={{ color: brand.cyan }}
                >
                  Personalizar producto
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  {activeProductForNote.name}
                </h3>
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase mb-1"
                  style={{ color: brand.textSecondary }}
                >
                  Nota o especificación (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sin cebolla, término medio..."
                  value={tempNote}
                  onChange={(e) => setTempNote(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none border"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = brand.cyan
                    e.target.style.boxShadow = `0 0 0 3px rgba(0, 229, 255, 0.15)`
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = brand.border
                    e.target.style.boxShadow = 'none'
                  }}
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setActiveProductForNote(null);
                    setTempNote('');
                  }}
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
                  onClick={handleAddWithNote}
                  className="w-1/2 font-bold py-2.5 rounded-xl text-sm transition"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                  }}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}