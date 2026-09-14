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
    category?: string;
  } | {
    name: string;
    category?: string;
  }[];
};

type Order = {
  id: string;
  table_name: string;
  status: string;
  created_at?: string;
  order_items: OrderItem[];
};

type Employee = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  description?: string;
  category: string;
  bar_id?: string;
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState<'menu' | 'paid' | 'pending' | 'employees'>('paid');

  // Estado para guardar el bar_id del administrador actual
  const [currentBarId, setCurrentBarId] = useState<string | null>(null);

  // Estado para el filtro de fecha
  const [dateFilter, setDateFilter] = useState('');

  // Estados para la gestión de empleados
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'cajero' | 'mesero'>('mesero');
  const [employeeLoading, setEmployeeLoading] = useState(false);
  
  // Modal o estado para cambiar contraseña
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [updatedPassword, setUpdatedPassword] = useState('');

  // Estados para la gestión del menú (productos)
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Bebidas'); // Categoría por defecto
  const [productLoading, setProductLoading] = useState(false);

  // Estado para editar un producto existente
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Alertas visuales
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadAdminData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/');
      return;
    }

    // 0. Obtener el perfil del usuario actual para extraer su bar_id
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('bar_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData?.bar_id) {
      setAlertInfo({ type: 'error', message: 'No se encontró un bar asociado a tu usuario administrador.' });
      setLoading(false);
      return;
    }

    const barId = profileData.bar_id;
    setCurrentBarId(barId);

    // 1. Cargar menú (productos) filtrando por bar_id
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('bar_id', barId)
      .order('name', { ascending: true });

    if (productsData) {
      setProductsList(productsData as Product[]);
      setProductsMap(new Map(productsData.map(p => [p.id, p.name])));
    }

    // 2. Cargar órdenes (Hacemos la consulta flexible por bar_id o por medio de los productos)
    const { data: ordersData, error: ordersError } = await supabase
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
            name,
            category
          )
        )
      `)
      .eq('bar_id', barId)
      .order('created_at', { ascending: false });

    // Si la tabla orders no tuviera bar_id directo en algunas bases de datos, intentamos respaldo general
    if (ordersError || !ordersData) {
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
              name,
              category
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (fallbackOrders) setOrders(fallbackOrders as Order[]);
    } else {
      setOrders(ordersData as Order[]);
    }

    // 3. Cargar perfiles/empleados del mismo bar
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .eq('bar_id', barId);

    if (profilesData) {
      setEmployees(profilesData as Employee[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAdminData();
    const interval = setInterval(loadAdminData, 10000);
    return () => clearInterval(interval);
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmployeeLoading(true);
    setAlertInfo(null);

    try {
      const response = await fetch('/api/admin/create-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole, bar_id: currentBarId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al crear empleado');

      setAlertInfo({ type: 'success', message: '¡Empleado creado con éxito!' });
      setNewEmail('');
      setNewPassword('');
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    } finally {
      setEmployeeLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEmployeeLoading(true);
    setAlertInfo(null);

    try {
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editingEmployee.id, newPassword: updatedPassword }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al actualizar contraseña');

      setAlertInfo({ type: 'success', message: '¡Contraseña actualizada correctamente!' });
      setEditingEmployee(null);
      setUpdatedPassword('');
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    } finally {
      setEmployeeLoading(false);
    }
  };

  const handleDeleteEmployee = async (userId: string, email: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar al empleado ${email}?`)) return;

    setEmployeeLoading(true);
    setAlertInfo(null);

    try {
      const response = await fetch('/api/admin/delete-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al eliminar empleado');

      setAlertInfo({ type: 'success', message: '¡Empleado eliminado con éxito!' });
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    } finally {
      setEmployeeLoading(false);
    }
  };

  // Función para crear un platillo incluyendo la categoría y el bar_id
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBarId) {
      setAlertInfo({ type: 'error', message: 'No se detectó el identificador del bar.' });
      return;
    }

    setProductLoading(true);
    setAlertInfo(null);

    try {
      const { error } = await supabase.from('products').insert([
        {
          name: newProductName,
          price: parseFloat(newProductPrice),
          description: newProductDesc || null,
          category: newProductCategory, // <--- Incluido para evitar el error not-null
          bar_id: currentBarId,
        },
      ]);

      if (error) throw error;

      setAlertInfo({ type: 'success', message: '¡Platillo agregado al menú con éxito!' });
      setNewProductName('');
      setNewProductPrice('');
      setNewProductDesc('');
      setNewProductCategory('Bebidas');
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message || 'Error al agregar platillo' });
    } finally {
      setProductLoading(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setProductLoading(true);
    setAlertInfo(null);

    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: editingProduct.name,
          price: Number(editingProduct.price),
          description: editingProduct.description || null,
          category: editingProduct.category,
        })
        .eq('id', editingProduct.id)
        .eq('bar_id', currentBarId);

      if (error) throw error;

      setAlertInfo({ type: 'success', message: '¡Platillo actualizado correctamente!' });
      setEditingProduct(null);
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message || 'Error al actualizar platillo' });
    } finally {
      setProductLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`¿Seguro que deseas eliminar "${productName}" del menú?`)) return;

    setProductLoading(true);
    setAlertInfo(null);

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('bar_id', currentBarId);

      if (error) throw error;

      setAlertInfo({ type: 'success', message: 'Platillo eliminado del menú' });
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message || 'Error al eliminar platillo' });
    } finally {
      setProductLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Cargando panel de administrador...</div>;

  const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'completed');
  const pendingOrders = orders.filter(o => o.status === 'pending');

  const totalRevenue = paidOrders.reduce((acc, order) => {
    const orderSum = order.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
    return acc + orderSum;
  }, 0);

  const filteredPaidOrders = paidOrders.filter(order => {
    if (!dateFilter) return true;
    if (!order.created_at) return false;
    return order.created_at.split('T')[0] === dateFilter;
  });

  const filteredRevenue = filteredPaidOrders.reduce((acc, order) => {
    const orderSum = order.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
    return acc + orderSum;
  }, 0);

  const setTodayFilter = () => {
    const today = new Date().toISOString().split('T')[0];
    setDateFilter(today);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6 relative">
      
      {/* ALERTA FLOTANTE */}
      {alertInfo && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
            alertInfo.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200' 
              : 'bg-red-950/90 border-red-500 text-red-200'
          } backdrop-blur-md`}>
            <span className="text-xl font-bold">{alertInfo.type === 'success' ? '✅' : '❌'}</span>
            <p className="text-sm font-semibold">{alertInfo.message}</p>
            <button onClick={() => setAlertInfo(null)} className="ml-4 text-xs bg-black/20 hover:bg-black/40 px-2 py-1 rounded-lg">Cerrar</button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <header className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
          <div>
            <span className="bg-purple-600 text-xs px-2.5 py-1 rounded-full font-semibold uppercase">Admin - Sucursal</span>
            <h1 className="text-3xl font-bold mt-1">Panel de Control</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Cerrar Sesión
          </button>
        </header>

        {/* MÉTRICAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h3 className="text-slate-400 text-sm font-medium">Ventas Totales Cobradas</h3>
            <p className="text-3xl font-bold mt-2 text-emerald-400">${totalRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h3 className="text-slate-400 text-sm font-medium">Cuentas Cobradas</h3>
            <p className="text-3xl font-bold mt-2 text-sky-400">{paidOrders.length}</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h3 className="text-slate-400 text-sm font-medium">Mesas / Órdenes Pendientes</h3>
            <p className="text-3xl font-bold mt-2 text-amber-400">{pendingOrders.length}</p>
          </div>
        </div>

        {/* PESTAÑAS DE VISTA */}
        <div className="flex flex-wrap gap-3 mb-6 border-b border-slate-800 pb-4">
          <button
            onClick={() => setActiveTab('paid')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${activeTab === 'paid' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            📋 Historial de Pagadas ({paidOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${activeTab === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            ⏳ Mesas Activas ({pendingOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${activeTab === 'menu' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            📖 Gestionar Menú ({productsList.length})
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${activeTab === 'employees' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            👥 Gestionar Empleados ({employees.length})
          </button>
        </div>

        {/* CONTENIDO: GESTIONAR MENÚ */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-2 text-indigo-400">Agregar Nuevo Platillo o Bebida al Menú</h2>
              <p className="text-xs text-slate-400 mb-4">Se guardará automáticamente en el catálogo de tu bar.</p>
              
              <form onSubmit={handleCreateProduct} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Nombre</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Margarita"
                    value={newProductName} 
                    onChange={e => setNewProductName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Precio ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="90.00"
                    value={newProductPrice} 
                    onChange={e => setNewProductPrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Categoría</label>
                  <select
                    value={newProductCategory}
                    onChange={e => setNewProductCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Bebidas">Bebidas</option>
                    <option value="Cocktails">Cocktails</option>
                    <option value="Platillos">Platillos</option>
                    <option value="Botanas">Botanas</option>
                    <option value="Postres">Postres</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Descripción</label>
                  <input 
                    type="text" 
                    placeholder="Opcional"
                    value={newProductDesc} 
                    onChange={e => setNewProductDesc(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={productLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition h-[38px]"
                >
                  {productLoading ? 'Agregando...' : 'Añadir'}
                </button>
              </form>
            </div>

            {/* VISTA PREVIA DEL MENÚ ACTUAL */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Menú de tu Sucursal</h2>
                <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-full font-semibold">
                  {productsList.length} artículos disponibles
                </span>
              </div>

              {productsList.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                  <p className="text-slate-400 text-sm">Tu menú está vacío. Agrega tu primer platillo o bebida arriba.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productsList.map(prod => (
                    <div key={prod.id} className="bg-slate-900 border border-slate-700/80 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-md hover:border-slate-600 transition">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/20">
                              {prod.category || 'General'}
                            </span>
                            <h3 className="font-bold text-white text-base mt-1">{prod.name}</h3>
                          </div>
                          <span className="text-emerald-400 font-black text-base bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                            ${Number(prod.price).toFixed(2)}
                          </span>
                        </div>
                        {prod.description && (
                          <p className="text-xs text-slate-400 mt-2 line-clamp-2">{prod.description}</p>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-3 border-t border-slate-800/80">
                        <button 
                          onClick={() => setEditingProduct(prod)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                        >
                          ✏️ Editar
                        </button>
                        <button 
                          onClick={() => handleDeleteProduct(prod.id, prod.name)}
                          disabled={productLoading}
                          className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL EDITAR PRODUCTO */}
        {editingProduct && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-indigo-400">Editar Platillo o Bebida</h3>
              <p className="text-xs text-slate-400">Modifica los campos que necesites actualizar en el menú.</p>
              
              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Nombre</label>
                  <input 
                    type="text" 
                    required
                    value={editingProduct.name}
                    onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Precio ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={editingProduct.price}
                    onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Categoría</label>
                  <select
                    value={editingProduct.category || 'Bebidas'}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Bebidas">Bebidas</option>
                    <option value="Cocktails">Cocktails</option>
                    <option value="Platillos">Platillos</option>
                    <option value="Botanas">Botanas</option>
                    <option value="Postres">Postres</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Descripción (Opcional)</label>
                  <input 
                    type="text" 
                    value={editingProduct.description || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingProduct(null)}
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-xs font-medium transition"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={productLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-xs font-medium transition"
                  >
                    {productLoading ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CONTENIDO: GESTIÓN DE EMPLEADOS */}
        {activeTab === 'employees' && (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-4 text-purple-400">Agregar Nuevo Mesero o Cajero</h2>
              <form onSubmit={handleCreateEmployee} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Correo Electrónico</label>
                  <input 
                    type="email" 
                    required
                    placeholder="empleado@correo.com"
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Contraseña Temporal</label>
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Rol</label>
                  <select 
                    value={newRole} 
                    onChange={e => setNewRole(e.target.value as 'cajero' | 'mesero')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="mesero">Mesero</option>
                    <option value="cajero">Cajero</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  disabled={employeeLoading}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition h-[38px]"
                >
                  {employeeLoading ? 'Registrando...' : 'Crear Empleado'}
                </button>
              </form>
            </div>

            {/* LISTA DE EMPLEADOS */}
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-4">Personal de tu Sucursal</h2>
              {employees.length === 0 ? (
                <p className="text-slate-400 text-sm py-6 text-center">No hay empleados registrados en este bar.</p>
              ) : (
                <div className="space-y-3">
                  {employees.map(emp => (
                    <div key={emp.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-base">{emp.email}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                            emp.role === 'admin' ? 'bg-purple-500/10 text-purple-400' :
                            emp.role === 'cajero' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {emp.role}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">Registrado el: {new Date(emp.created_at).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { setEditingEmployee(emp); setUpdatedPassword(''); }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                        >
                          Cambiar Contraseña
                        </button>

                        <button 
                          onClick={() => handleDeleteEmployee(emp.id, emp.email)}
                          disabled={employeeLoading}
                          className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL CAMBIAR CONTRASEÑA */}
        {editingEmployee && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-bold">Cambiar Contraseña</h3>
              <p className="text-xs text-slate-400">Actualizando credenciales para: <span className="text-white font-semibold">{editingEmployee.email}</span></p>
              
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Nueva Contraseña</label>
                  <input 
                    type="password" 
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={updatedPassword}
                    onChange={e => setUpdatedPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingEmployee(null)}
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-xs font-medium transition"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={employeeLoading}
                    className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-xs font-medium transition"
                  >
                    {employeeLoading ? 'Guardando...' : 'Actualizar Contraseña'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* PESTAÑA: PAID */}
        {activeTab === 'paid' && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold text-emerald-400">Historial y Corte por Fecha</h2>
                <p className="text-xs text-slate-400 mt-0.5">Selecciona un día para auditar los ingresos</p>
              </div>
              <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-right">
                <span className="text-xs text-slate-400 block">{dateFilter ? `Ventas del ${dateFilter}` : 'Ventas Totales'}</span>
                <span className="text-lg font-bold text-emerald-400">${filteredRevenue.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Filtrar por Fecha</label>
                  <input 
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button onClick={setTodayFilter} className="mt-5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition h-[38px]">
                  Ver Hoy
                </button>
              </div>
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="mt-5 sm:mt-0 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-medium border border-slate-700 transition h-[38px]">
                  Mostrar Todo
                </button>
              )}
            </div>

            {filteredPaidOrders.length === 0 ? (
              <p className="text-slate-400 text-sm py-12 text-center">No se encontraron ventas registradas.</p>
            ) : (
              <div className="space-y-3">
                {filteredPaidOrders.map(order => {
                  const orderTotal = order.order_items?.reduce((s, i) => s + Number(i.price), 0) || 0;
                  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString() : '';
                  return (
                    <div key={order.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-emerald-400 text-lg">{order.table_name}</span>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-semibold">Pagada</span>
                          <span className="text-xs text-slate-400">{dateStr}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs text-slate-300">
                          {order.order_items?.map((item, idx) => {
                            const rawP = item.products;
                            const pName = Array.isArray(rawP) ? rawP[0]?.name : rawP?.name || productsMap.get(item.product_id) || 'Platillo';
                            return (
                              <span key={idx} className="bg-slate-800 px-2 py-1 rounded border border-slate-700">
                                • {pName} (${item.price})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Total</span>
                        <span className="text-xl font-black text-emerald-400">${orderTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: PENDING */}
        {activeTab === 'pending' && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-amber-400">Monitoreo de Mesas Activas</h2>
            {pendingOrders.length === 0 ? (
              <p className="text-slate-400 text-sm py-8 text-center">No hay mesas ocupadas actualmente en tu bar.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingOrders.map(order => {
                  const orderTotal = order.order_items?.reduce((s, i) => s + Number(i.price), 0) || 0;
                  return (
                    <div key={order.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-amber-400">{order.table_name}</h3>
                        <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-semibold">Abierta</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto text-xs text-slate-300 border-t border-slate-800 pt-2">
                        {order.order_items?.map((item, idx) => {
                          const rawP = item.products;
                          const pName = Array.isArray(rawP) ? rawP[0]?.name : rawP?.name || productsMap.get(item.product_id) || 'Platillo';
                          return (
                            <div key={idx} className="flex justify-between">
                              <span>• {pName}</span>
                              <span className="text-emerald-400">${item.price}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm">
                        <span className="text-slate-400">Consumo:</span>
                        <span className="font-black text-emerald-400">${orderTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}