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

  const router = useRouter();
  const supabase = createClient();

  // Helper: convierte table_number en nombre formateado
  const getTableName = (num: number) => `Mesa ${String(num).padStart(2, '0')}`;

  const loadData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push('/');
      return;
    }

    // 0. Perfil del mesero
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

    // 0.5. Nombre del bar
    const { data: barData } = await supabase
      .from('bars')
      .select('name')
      .eq('id', barId)
      .single();

    if (barData?.name) setBarName(barData.name);

    // 1. Productos
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('bar_id', barId)
      .eq('is_active', true);

    if (productsData) setProducts(productsData);

    // 2. Mesas (solo activas y no eliminadas)
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

    // 3. Órdenes activas
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
      .in('status', ['pending', 'ready']);

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
        .in('status', ['pending', 'ready'])
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

    // Si no existe, crear nueva orden
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
        alert(`No se pudo crear la orden: ${orderError.message}`);
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
      alert(`Error al guardar productos: ${itemsError.message}`);
    } else {
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
      <div className="p-8 text-white bg-slate-900 min-h-screen">Cargando sistema...</div>
    );

  // Función para saber el estado de una mesa (busy si hay orden activa)
  const isTableBusy = (tableName: string) => !!activeTables[tableName];

  // Función para obtener el estado visual de una mesa
  const getTableVisualStatus = (table: Table) => {
    const tableName = getTableName(table.table_number);
    if (isTableBusy(tableName)) {
      return { label: 'Ocupada', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' };
    }
    if (table.status === 'cleaning') {
      return { label: 'Limpieza', color: 'text-sky-400', dot: 'bg-sky-400' };
    }
    if (table.status === 'occupied') {
      return { label: 'Ocupada', color: 'text-amber-400', dot: 'bg-amber-400' };
    }
    return { label: 'Disponible', color: 'text-emerald-400', dot: 'bg-emerald-400' };
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-md mx-auto">
        {/* HEADER */}
        <header className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <span className="bg-amber-600 text-xs px-2.5 py-1 rounded-full font-semibold uppercase">
              Mesero
            </span>
            <h1 className="text-xl font-bold mt-1 truncate">
              {selectedTable ? selectedTable : barName || 'Mis Mesas'}
            </h1>
          </div>
          <div className="flex gap-2 shrink-0">
            {selectedTable ? (
              <button
                onClick={() => {
                  setSelectedTable(null);
                  setCurrentOrder([]);
                  setSearchQuery('');
                }}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium transition"
              >
                ← Volver
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
              >
                Salir
              </button>
            )}
          </div>
        </header>

        {/* VISTA 1: LISTADO DE MESAS */}
        {!selectedTable ? (
          tables.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No hay mesas configuradas en tu bar. Pídele al admin que las agregue.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {tables.map((table) => {
                const tableName = getTableName(table.table_number);
                const activeOrder = activeTables[tableName];
                const isBusy = !!activeOrder;
                const itemCount = activeOrder?.order_items?.length || 0;
                const visual = getTableVisualStatus(table);

                return (
                  <div
                    key={table.id}
                    onClick={() => {
                      setSelectedTable(tableName);
                      setTableSubView(isBusy ? 'cart' : 'menu');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between h-28 ${
                      isBusy
                        ? 'bg-amber-950/30 border-amber-500/40 hover:border-amber-500'
                        : table.status === 'cleaning'
                        ? 'bg-sky-950/30 border-sky-500/40 hover:border-sky-500'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-lg">{tableName}</h3>
                      <span className={`w-2.5 h-2.5 rounded-full ${visual.dot}`}></span>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${visual.color}`}>
                        {isBusy ? `Ocupada (${itemCount} items)` : visual.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* VISTA 2: GESTIÓN DE LA MESA SELECCIONADA */
          <div className="space-y-4">
            {/* VISTA DE CUENTA / PEDIDOS */}
            {tableSubView === 'cart' && (
              <div className="space-y-4">
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                      Cuenta Actual
                    </h2>
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-semibold">
                      En consumo
                    </span>
                  </div>

                  {!activeTables[selectedTable] ||
                  activeTables[selectedTable].order_items.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      Esta mesa aún no tiene productos pedidos.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {activeTables[selectedTable].order_items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="bg-slate-900/70 p-2.5 rounded-lg flex justify-between items-start text-sm"
                        >
                          <div>
                            <p className="font-medium text-white">{item.product_name}</p>
                            {item.note && (
                              <p className="text-xs text-amber-400 mt-0.5">
                                Nota: "{item.note}"
                              </p>
                            )}
                          </div>
                          <span className="font-semibold text-emerald-400">
                            ${item.price}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTables[selectedTable] &&
                    activeTables[selectedTable].order_items.length > 0 && (
                      <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                        <span className="text-sm text-slate-400 font-semibold">
                          Total Acumulado:
                        </span>
                        <span className="text-xl font-black text-emerald-400">
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
                  className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-sky-600/20"
                >
                  + Agregar más productos a esta mesa
                </button>
              </div>
            )}

            {/* VISTA DE MENÚ / AGREGAR PRODUCTOS */}
            {tableSubView === 'menu' && (
              <div className="space-y-4">
                {activeTables[selectedTable] &&
                  activeTables[selectedTable].order_items.length > 0 && (
                    <button
                      onClick={() => setTableSubView('cart')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-xl text-xs transition border border-slate-700"
                    >
                      ← Volver a Ver Cuenta Actual
                    </button>
                  )}

                {currentOrder.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-500/40 p-4 rounded-xl space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Nuevos items por enviar ({currentOrder.length})
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {currentOrder.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center bg-slate-900 p-2 rounded-lg text-xs"
                        >
                          <div>
                            <span className="font-medium">{item.product.name}</span>
                            {item.note && (
                              <span className="text-amber-400 ml-1">({item.note})</span>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              setCurrentOrder(currentOrder.filter((_, i) => i !== idx))
                            }
                            className="text-red-400 px-2"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleSendOrder}
                      disabled={submitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                    >
                      {submitting ? 'Enviando...' : 'Confirmar y Enviar a Pedidos'}
                    </button>
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar cerveza, hamburguesa, papas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pl-10 text-white text-sm focus:outline-none focus:border-sky-500 transition"
                  />
                  <svg
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5"
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
                      className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center"
                    >
                      <div>
                        <h4 className="font-medium text-white text-sm">{product.name}</h4>
                        <p className="text-xs text-slate-400">
                          {product.category} •{' '}
                          <span className="text-emerald-400 font-semibold">
                            ${product.price}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveProductForNote(product)}
                        className="bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-8">
                      No hay productos que coincidan con tu búsqueda.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL PARA NOTA */}
        {activeProductForNote && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-4">
              <div>
                <span className="text-xs text-sky-400 font-semibold uppercase">
                  Personalizar producto
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  {activeProductForNote.name}
                </h3>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Nota o especificación (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sin cebolla, término medio..."
                  value={tempNote}
                  onChange={(e) => setTempNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-sky-500 transition"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setActiveProductForNote(null);
                    setTempNote('');
                  }}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddWithNote}
                  className="w-1/2 bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2.5 rounded-xl text-sm transition"
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