'use client';

import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type OrderItem = {
  id?: string;
  price: number;
  note: string | null;
  product_id: string;
  products?: {
    name: string;
  } | {
    name: string;
  }[];
};

type ActiveOrder = {
  id: string;
  table_name: string;
  status: string;
  bar_id?: string;
  created_at?: string;
  order_items: OrderItem[];
};

export default function CashierDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());
  
  // Estado para guardar el bar_id del cajero actual
  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  
  // Estado para la mesa seleccionada para cobrar
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrder | null>(null);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  // Estado para alertas bonitas
  const [appAlert, setAppAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/');
      return;
    }

    // 0. Obtener el perfil del cajero actual para extraer su bar_id
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('bar_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData?.bar_id) {
      setAppAlert({ type: 'error', message: 'No se encontró un bar asociado a tu usuario de caja.' });
      setLoading(false);
      return;
    }

    const barId = profileData.bar_id;
    setCurrentBarId(barId);

    // 1. Cargar productos filtrados por bar_id para respaldo de nombres
    const { data: productsData } = await supabase
      .from('products')
      .select('id, name')
      .eq('bar_id', barId);

    if (productsData) {
      setProductsMap(new Map(productsData.map(p => [p.id, p.name])));
    }

    // 2. Cargar órdenes activas (pending) filtrando estrictamente por el bar_id del cajero
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
          products (
            name
          )
        )
      `)
      .eq('bar_id', barId)
      .in('status', ['pending'])
      .order('table_name', { ascending: true });

    // Si hubiera algún inconveniente con el bar_id directo en la orden, intentamos un respaldo seguro
    if (error || !ordersData) {
      const { data: fallbackOrders } = await supabase
        .from('orders')
        .select(`
          id,
          table_name,
          status,
          created_at,
          order_items (
            id,
            price,
            note,
            product_id,
            products (
              name
            )
          )
        `)
        .in('status', ['pending'])
        .order('table_name', { ascending: true });
      
      if (fallbackOrders) {
        setActiveOrders(fallbackOrders as ActiveOrder[]);
      }
    } else {
      setActiveOrders(ordersData as ActiveOrder[]);
      
      // Actualizar modal si está abierto
      if (selectedOrder) {
        const updatedCurrent = ordersData.find((o: any) => o.id === selectedOrder.id);
        if (updatedCurrent) {
          setSelectedOrder(updatedCurrent as ActiveOrder);
        } else {
          setSelectedOrder(null);
        }
      }
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
    router.push('/');
  };

  // Función para cobrar y liberar la mesa cambiando el estado a 'paid'
  const handleCheckout = async (orderId: string) => {
    if (!selectedOrder) return;
    setProcessing(true);

    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId);

    if (error) {
      setAppAlert({ type: 'error', message: "Error al cobrar la mesa: " + error.message });
    } else {
      setAppAlert({ type: 'success', message: "¡Mesa cobrada y liberada con éxito!" });
      setSelectedOrder(null);
      setCashReceived('');
      await loadData();
    }

    setProcessing(false);
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Cargando caja...</div>;

  const totalPendingRevenue = activeOrders.reduce((acc, order) => {
    const orderSum = order.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
    return acc + orderSum;
  }, 0);

  const selectedOrderTotal = selectedOrder?.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
  const cashNum = parseFloat(cashReceived) || 0;
  const changeDue = cashNum >= selectedOrderTotal ? cashNum - selectedOrderTotal : 0;

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6 relative">
      
      {/* ALERTA BONITA FLOTANTE */}
      {appAlert && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
            appAlert.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200' 
              : 'bg-red-950/90 border-red-500 text-red-200'
          } backdrop-blur-md`}>
            <span className="text-xl font-bold">
              {appAlert.type === 'success' ? '✅' : '❌'}
            </span>
            <div>
              <p className="text-sm font-semibold">{appAlert.message}</p>
            </div>
            <button 
              onClick={() => setAppAlert(null)}
              className="ml-4 text-xs bg-black/20 hover:bg-black/40 px-2.5 py-1 rounded-lg transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <header className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
          <div>
            <span className="bg-emerald-600 text-xs px-2.5 py-1 rounded-full font-semibold uppercase">Caja - Sucursal</span>
            <h1 className="text-3xl font-bold mt-1">Caja y Cobros</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Cerrar Sesión
          </button>
        </header>

        {/* RESUMEN RÁPIDO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">Mesas Ocupadas Actuales</h2>
            <p className="text-3xl font-bold text-sky-400">{activeOrders.length}</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">Dinero en Cuentas Activas</h2>
            <p className="text-3xl font-bold text-emerald-400">${totalPendingRevenue.toFixed(2)}</p>
          </div>
        </div>

        {/* SECCIÓN PRINCIPAL: CUENTAS POR COBRAR */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Cuentas por Cobrar en Mesas</h2>

          {activeOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No hay cuentas pendientes de pago en este momento. Todas las mesas están libres.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map((order) => {
                const orderTotal = order.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
                
                return (
                  <div key={order.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-amber-400">{order.table_name}</h3>
                        <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-semibold">
                          {order.order_items?.length || 0} items
                        </span>
                      </div>
                      
                      {/* Lista resumida de platillos */}
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1 text-xs text-slate-300 border-t border-slate-800 pt-2">
                        {order.order_items?.map((item, idx) => {
                          const rawProduct = item.products;
                          const productName = Array.isArray(rawProduct) 
                            ? rawProduct[0]?.name 
                            : rawProduct?.name || productsMap.get(item.product_id) || 'Producto';

                          return (
                            <div key={item.id || idx} className="flex justify-between">
                              <span className="truncate max-w-[170px]">• {productName}</span>
                              <span className="text-emerald-400">${item.price}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-slate-400 block">Total a pagar</span>
                        <span className="text-lg font-black text-emerald-400">${orderTotal.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setCashReceived('');
                          setAppAlert(null);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow-lg shadow-emerald-600/20"
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

        {/* MODAL DE COBRO EN EFECTIVO Y LIBERACIÓN */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5">
              
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <span className="text-xs text-emerald-400 font-semibold uppercase">Punto de Cobro</span>
                  <h3 className="text-xl font-bold text-white">{selectedOrder.table_name}</h3>
                </div>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Desglose de cuenta */}
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 bg-slate-800/50 p-3 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase">Resumen de la cuenta</span>
                {selectedOrder.order_items?.map((item, idx) => {
                  const rawProduct = item.products;
                  const productName = Array.isArray(rawProduct) 
                    ? rawProduct[0]?.name 
                    : rawProduct?.name || productsMap.get(item.product_id) || 'Producto';

                  return (
                    <div key={idx} className="flex justify-between text-sm">
                      <div>
                        <span className="text-white">{productName}</span>
                        {item.note && <span className="text-xs text-amber-400 block">Nota: {item.note}</span>}
                      </div>
                      <span className="text-emerald-400 font-semibold">${item.price}</span>
                    </div>
                  );
                })}
              </div>

              {/* Total y Calculadora de Efectivo */}
              <div className="space-y-3 bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-300">Total a Pagar:</span>
                  <span className="text-2xl font-black text-emerald-400">${selectedOrderTotal.toFixed(2)}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Efectivo Recibido ($)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-lg font-bold focus:outline-none focus:border-emerald-500 transition"
                    autoFocus
                  />
                </div>

                {cashNum > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                    <span className="text-sm font-semibold text-slate-300">Cambio a Devolver:</span>
                    <span className={`text-xl font-bold ${cashNum >= selectedOrderTotal ? 'text-sky-400' : 'text-red-400'}`}>
                      {cashNum >= selectedOrderTotal ? `$${changeDue.toFixed(2)}` : 'Falta dinero'}
                    </span>
                  </div>
                )}
              </div>

              {/* Botón de Confirmación */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleCheckout(selectedOrder.id)}
                  disabled={processing || cashNum < selectedOrderTotal}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Procesando...' : 'Cobrar y Liberar Mesa'}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </main>
  );
}