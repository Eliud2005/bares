'use client';

import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type OrderItem = {
  id?: string;
  price: number;
  note: string | null;
  product_id: string;
  products?:
    | { name: string; category?: string }
    | { name: string; category?: string }[];
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
  role: string;
  created_at: string;
  full_name?: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  description?: string;
  category: string;
  bar_id?: string;
};

type BarInfo = {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  trial_until?: string | null;
  subscription_status?: string;
};

type Table = {
  id: string;
  bar_id: string;
  table_number: number;
  status: string | null;
  is_active: boolean;
  deleted_at: string | null;
};

type RangeOption =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'thisMonth'
  | 'last2Months'
  | 'last3Months'
  | 'last4Months'
  | 'last6Months'
  | 'last8Months'
  | 'last12Months'
  | 'thisYear'
  | 'custom';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState<
    'menu' | 'paid' | 'pending' | 'employees' | 'analytics' | 'tables'
  >('analytics');

  const [currentBarId, setCurrentBarId] = useState<string | null>(null);
  const [barInfo, setBarInfo] = useState<BarInfo | null>(null);
  const [dateFilter, setDateFilter] = useState('');

  // Empleados
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'cashier' | 'waiter'>('waiter');
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [updatedPassword, setUpdatedPassword] = useState('');

  // Menú
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Bebidas');
  const [productLoading, setProductLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Mesas
  const [tablesList, setTablesList] = useState<Table[]>([]);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [tableLoading, setTableLoading] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);

  // Análisis de ganancias por rango
  const [rangeOption, setRangeOption] = useState<RangeOption>('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<{
    total: number;
    count: number;
    average: number;
    previousTotal: number;
    chart: { label: string; total: number }[];
  }>({
    total: 0,
    count: 0,
    average: 0,
    previousTotal: 0,
    chart: [],
  });

  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const loadAdminData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push('/');
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('bar_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData?.bar_id) {
      setAlertInfo({
        type: 'error',
        message: 'No se encontró un bar asociado a tu usuario administrador.',
      });
      setLoading(false);
      return;
    }

    const barId = profileData.bar_id;
    setCurrentBarId(barId);

    // 0.5. Cargar info del bar
    const { data: barData } = await supabase
      .from('bars')
      .select('id, name, slug, address, phone, trial_until, subscription_status')
      .eq('id', barId)
      .single();

    if (barData) setBarInfo(barData as BarInfo);

    // 1. Productos
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('bar_id', barId)
      .order('name', { ascending: true });

    if (productsData) {
      setProductsList(productsData as Product[]);
      setProductsMap(new Map(productsData.map((p) => [p.id, p.name])));
    }

    // 2. Órdenes
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
          products ( name, category )
        )
      `)
      .eq('bar_id', barId)
      .order('created_at', { ascending: false });

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
            products ( name, category )
          )
        `)
        .order('created_at', { ascending: false });

      if (fallbackOrders) setOrders(fallbackOrders as Order[]);
    } else {
      setOrders(ordersData as Order[]);
    }

    // 3. Empleados
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .eq('bar_id', barId);

    if (profilesData) setEmployees(profilesData as Employee[]);

    // 3.5. Mesas (solo las no eliminadas)
    const { data: tablesData } = await supabase
      .from('tables')
      .select('*')
      .eq('bar_id', barId)
      .is('deleted_at', null)
      .order('table_number', { ascending: true });

    if (tablesData) setTablesList(tablesData as Table[]);

    // 4. Análisis del rango actual
    await loadRangeData(barId, rangeOption);

    setLoading(false);
  };

  const getRangeDates = (
    option: RangeOption,
    customS?: string,
    customE?: string
  ): { start: Date; end: Date } => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (option) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59);
        break;
      case 'thisWeek': {
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
        break;
      }
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last2Months':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case 'last3Months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case 'last4Months':
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'last6Months':
        start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        break;
      case 'last8Months':
        start = new Date(now.getFullYear(), now.getMonth() - 7, 1);
        break;
      case 'last12Months':
        start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        if (customS && customE) {
          start = new Date(customS + 'T00:00:00');
          end.setTime(new Date(customE + 'T23:59:59').getTime());
        }
        break;
    }

    return { start, end };
  };

  const loadRangeData = async (barId: string, option: RangeOption) => {
    setRangeLoading(true);
    try {
      const { start, end } = getRangeDates(option, customStart, customEnd);

      const durationMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(start.getTime() - durationMs);

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          status,
          order_items ( price )
        `)
        .eq('bar_id', barId)
        .in('status', ['paid', 'completed'])
        .gte('created_at', prevStart.toISOString())
        .lte('created_at', end.toISOString());

      if (error) throw error;

      let total = 0;
      let count = 0;
      let previousTotal = 0;

      const daysDiff = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
      const buckets: Record<string, number> = {};

      if (daysDiff <= 1) {
        for (let h = 0; h < 24; h++) buckets[String(h).padStart(2, '0')] = 0;
      } else if (daysDiff <= 31) {
        const cursor = new Date(start);
        while (cursor <= end) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
          buckets[key] = 0;
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1);
        while (cursor <= finalMonth) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
          buckets[key] = 0;
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      (data || []).forEach((order: any) => {
        const orderDate = new Date(order.created_at);
        const orderTotal = (order.order_items || []).reduce(
          (s: number, it: any) => s + Number(it.price || 0),
          0
        );

        if (orderDate >= start && orderDate <= end) {
          total += orderTotal;
          count += 1;

          let key = '';
          if (daysDiff <= 1) {
            key = String(orderDate.getHours()).padStart(2, '0');
          } else if (daysDiff <= 31) {
            key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-${String(orderDate.getDate()).padStart(2, '0')}`;
          } else {
            key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
          }
          if (buckets[key] !== undefined) buckets[key] += orderTotal;
        }

        if (orderDate >= prevStart && orderDate <= prevEnd) {
          previousTotal += orderTotal;
        }
      });

      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const chart = Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => {
          let label = key;
          if (daysDiff <= 1) {
            label = `${key}h`;
          } else if (daysDiff <= 31) {
            const [, m, d] = key.split('-');
            label = `${parseInt(d)} ${monthNames[parseInt(m) - 1]}`;
          } else {
            const [y, m] = key.split('-');
            label = `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`;
          }
          return { label, total: val };
        });

      setRangeData({
        total,
        count,
        average: count > 0 ? total / count : 0,
        previousTotal,
        chart,
      });
    } catch (err) {
      console.error('Error cargando rango:', err);
    } finally {
      setRangeLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    const interval = setInterval(loadAdminData, 15000);
    return () => clearInterval(interval);
  }, [router, supabase]);

  useEffect(() => {
    if (currentBarId) {
      loadRangeData(currentBarId, rangeOption);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeOption, customStart, customEnd]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  // ---------- EMPLEADOS ----------
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmployeeLoading(true);
    setAlertInfo(null);

    try {
      const response = await fetch('/api/admin/create-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          bar_id: currentBarId,
        }),
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
        body: JSON.stringify({
          userId: editingEmployee.id,
          newPassword: updatedPassword,
        }),
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

  const handleDeleteEmployee = async (userId: string, label: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar al empleado ${label}?`)) return;

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

  // ---------- PRODUCTOS ----------
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
          category: newProductCategory,
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

  // ---------- MESAS ----------
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBarId || !newTableNumber.trim()) return;
    setTableLoading(true);
    setAlertInfo(null);

    try {
      const num = parseInt(newTableNumber);
      if (isNaN(num) || num <= 0) throw new Error('Número inválido');

      const { error } = await supabase.from('tables').insert([
        {
          bar_id: currentBarId,
          table_number: num,
          status: 'free',
          is_active: true,
        },
      ]);

      if (error) {
        if (error.code === '23505') throw new Error('Ya existe una mesa con ese número');
        throw error;
      }

      setAlertInfo({ type: 'success', message: `Mesa ${num} creada` });
      setNewTableNumber('');
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    } finally {
      setTableLoading(false);
    }
  };

  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable) return;
    setTableLoading(true);

    try {
      const { error } = await supabase
        .from('tables')
        .update({ table_number: editingTable.table_number })
        .eq('id', editingTable.id)
        .eq('bar_id', currentBarId);

      if (error) throw error;

      setAlertInfo({ type: 'success', message: 'Mesa actualizada' });
      setEditingTable(null);
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    } finally {
      setTableLoading(false);
    }
  };

  const handleDeleteTable = async (tableId: string, tableNumber: number) => {
    const name = `Mesa ${String(tableNumber).padStart(2, '0')}`;
    if (!confirm(`¿Eliminar "${name}"? Las órdenes existentes NO se borrarán.`)) return;

    setTableLoading(true);
    setAlertInfo(null);

    try {
      const { error } = await supabase
        .from('tables')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', tableId)
        .eq('bar_id', currentBarId);

      if (error) throw error;

      setAlertInfo({ type: 'success', message: 'Mesa eliminada' });
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    } finally {
      setTableLoading(false);
    }
  };

  const handleToggleTableActive = async (tableId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('tables')
        .update({ is_active: !currentActive })
        .eq('id', tableId)
        .eq('bar_id', currentBarId);

      if (error) throw error;
      loadAdminData();
    } catch (err: any) {
      setAlertInfo({ type: 'error', message: err.message });
    }
  };

  if (loading)
    return (
      <div className="p-8 text-white bg-slate-900 min-h-screen">
        Cargando panel de administrador...
      </div>
    );

  const paidOrders = orders.filter((o) => o.status === 'paid' || o.status === 'completed');
  const pendingOrders = orders.filter((o) => o.status === 'pending');

  const totalRevenue = paidOrders.reduce((acc, order) => {
    const orderSum = order.order_items?.reduce((sum, item) => sum + Number(item.price), 0) || 0;
    return acc + orderSum;
  }, 0);

  const filteredPaidOrders = paidOrders.filter((order) => {
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

  const rangeButtons: { key: RangeOption; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'yesterday', label: 'Ayer' },
    { key: 'thisWeek', label: 'Semana' },
    { key: 'thisMonth', label: 'Mes' },
    { key: 'last2Months', label: '2M' },
    { key: 'last3Months', label: '3M' },
    { key: 'last4Months', label: '4M' },
    { key: 'last6Months', label: '6M' },
    { key: 'last8Months', label: '8M' },
    { key: 'last12Months', label: '12M' },
    { key: 'thisYear', label: 'Año' },
  ];

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6 relative">
      {alertInfo && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
              alertInfo.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-red-950/90 border-red-500 text-red-200'
            } backdrop-blur-md`}
          >
            <span className="text-xl font-bold">
              {alertInfo.type === 'success' ? '✅' : '❌'}
            </span>
            <p className="text-sm font-semibold">{alertInfo.message}</p>
            <button
              onClick={() => setAlertInfo(null)}
              className="ml-4 text-xs bg-black/20 hover:bg-black/40 px-2 py-1 rounded-lg"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <header className="flex justify-between items-start mb-8 border-b border-slate-800 pb-4 gap-4 flex-wrap">
          <div className="min-w-0">
            <span className="bg-purple-600 text-xs px-2.5 py-1 rounded-full font-semibold uppercase">
              Admin - Sucursal
            </span>
            <h1 className="text-3xl font-bold mt-1 truncate">
              {barInfo?.name || 'Panel de Control'}
            </h1>
            {barInfo && (
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                {barInfo.slug && (
                  <span className="font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    /{barInfo.slug}
                  </span>
                )}
                {barInfo.address && <span>📍 {barInfo.address}</span>}
                {barInfo.phone && <span>📞 {barInfo.phone}</span>}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition shrink-0"
          >
            Cerrar Sesión
          </button>
        </header>

        {/* BANNER DE TRIAL */}
        {barInfo?.trial_until &&
          (() => {
            const days = Math.ceil(
              (new Date(barInfo.trial_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            if (days < 0) {
              return (
                <div className="bg-red-950/60 border border-red-800/60 text-red-300 rounded-xl p-4 mb-6 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">🔴 Tu período de prueba ha expirado</p>
                    <p className="text-xs text-red-400 mt-0.5">
                      Contacta a soporte para renovar tu suscripción.
                    </p>
                  </div>
                </div>
              );
            }
            if (days <= 5) {
              return (
                <div className="bg-amber-950/60 border border-amber-800/60 text-amber-300 rounded-xl p-4 mb-6 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">
                      ⚠️ Tu período de prueba termina en {days} {days === 1 ? 'día' : 'días'}
                    </p>
                    <p className="text-xs text-amber-400 mt-0.5">
                      Contacta a soporte para renovar y no perder acceso.
                    </p>
                  </div>
                </div>
              );
            }
            return null;
          })()}

        {/* MÉTRICAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
            <h3 className="text-slate-400 text-sm font-medium">Ventas Totales Cobradas</h3>
            <p className="text-3xl font-bold mt-2 text-emerald-400">
              ${totalRevenue.toFixed(2)}
            </p>
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

        {/* PESTAÑAS */}
        <div className="flex flex-wrap gap-3 mb-6 border-b border-slate-800 pb-4">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              activeTab === 'analytics'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            📊 Análisis de Ganancias
          </button>
          <button
            onClick={() => setActiveTab('paid')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              activeTab === 'paid'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            📋 Historial de Pagadas ({paidOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            ⏳ Mesas Activas ({pendingOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              activeTab === 'menu'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            📖 Gestionar Menú ({productsList.length})
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              activeTab === 'tables'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            🪑 Gestionar Mesas ({tablesList.length})
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              activeTab === 'employees'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            👥 Gestionar Empleados ({employees.length})
          </button>
        </div>

        {/* PESTAÑA: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-emerald-400">
                📊 Análisis de Ganancias
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Selecciona el período que quieras analizar
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {rangeButtons.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRangeOption(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    rangeOption === opt.key
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setRangeOption('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  rangeOption === 'custom'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                📅 Personalizado
              </button>
            </div>

            {rangeOption === 'custom' && (
              <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
                <span className="text-xs text-slate-400 block mb-1">Ingresos del período</span>
                <span className="text-3xl font-black text-emerald-400">
                  ${rangeData.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                {rangeData.previousTotal > 0 && (
                  <div className="mt-2 text-xs">
                    {rangeData.total >= rangeData.previousTotal ? (
                      <span className="text-emerald-400 font-bold">
                        ↑{' '}
                        {(
                          ((rangeData.total - rangeData.previousTotal) /
                            rangeData.previousTotal) *
                          100
                        ).toFixed(1)}
                        % vs período anterior
                      </span>
                    ) : (
                      <span className="text-red-400 font-bold">
                        ↓{' '}
                        {(
                          ((rangeData.previousTotal - rangeData.total) /
                            rangeData.previousTotal) *
                          100
                        ).toFixed(1)}
                        % vs período anterior
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
                <span className="text-xs text-slate-400 block mb-1">Cuentas cobradas</span>
                <span className="text-3xl font-black text-sky-400">{rangeData.count}</span>
              </div>

              <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
                <span className="text-xs text-slate-400 block mb-1">Ticket promedio</span>
                <span className="text-3xl font-black text-purple-400">
                  ${rangeData.average.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {rangeLoading ? (
              <div className="bg-slate-900 border border-slate-700 p-12 rounded-xl text-center text-slate-400 text-sm">
                Cargando datos...
              </div>
            ) : rangeData.chart.length === 0 ? (
              <div className="bg-slate-900 border border-slate-700 p-12 rounded-xl text-center text-slate-400 text-sm">
                No hay datos en este período.
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-700 p-5 rounded-xl">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Tendencia del período
                </h3>
                <div className="flex items-end justify-between gap-1.5 h-56 overflow-x-auto pb-2">
                  {rangeData.chart.map((m, i) => {
                    const max = Math.max(...rangeData.chart.map((x) => x.total), 1);
                    const heightPct = (m.total / max) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-[40px] flex flex-col items-center justify-end gap-2 h-full"
                      >
                        <span className="text-[10px] font-bold text-emerald-400">
                          {m.total > 999 ? `${(m.total / 1000).toFixed(1)}k` : m.total.toFixed(0)}
                        </span>
                        <div
                          className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg transition-all hover:from-emerald-500 hover:to-emerald-300"
                          style={{ height: `${Math.max(heightPct, 2)}%`, minHeight: '4px' }}
                          title={`${m.label}: $${m.total.toFixed(2)}`}
                        />
                        <span className="text-[9px] text-slate-500 font-medium whitespace-nowrap">
                          {m.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA: MESAS */}
        {activeTab === 'tables' && (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Agregar Nueva Mesa</h2>
              <p className="text-xs text-slate-400 mb-4">
                Ingresa solo el número. El sistema la mostrará como "Mesa 01", "Mesa 02", etc.
              </p>

              <form onSubmit={handleCreateTable} className="flex flex-wrap gap-3 items-end">
                <div className="w-40">
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Número de mesa
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Ej. 7"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={tableLoading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 px-4 rounded-lg text-sm transition h-[38px]"
                >
                  {tableLoading ? 'Creando...' : '+ Agregar Mesa'}
                </button>
              </form>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Mesas de tu Sucursal</h2>
                <span className="text-xs bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-full font-semibold">
                  {tablesList.filter((t) => t.is_active).length} activas / {tablesList.length} total
                </span>
              </div>

              {tablesList.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                  <p className="text-slate-400 text-sm">
                    No hay mesas registradas. Agrega la primera arriba.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {tablesList.map((table) => {
                    const isActive = table.is_active;
                    return (
                      <div
                        key={table.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between gap-2 transition ${
                          isActive
                            ? 'bg-slate-900 border-slate-700'
                            : 'bg-slate-950/60 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <h3
                            className={`font-bold text-sm ${
                              isActive ? 'text-white' : 'text-slate-500 line-through'
                            }`}
                          >
                            Mesa {String(table.table_number).padStart(2, '0')}
                          </h3>
                          <button
                            onClick={() => handleToggleTableActive(table.id, isActive)}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isActive
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-slate-700 text-slate-400'
                            }`}
                            title={isActive ? 'Desactivar' : 'Activar'}
                          >
                            {isActive ? 'ON' : 'OFF'}
                          </button>
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingTable(table)}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2 py-1 rounded-lg text-[10px] font-medium transition"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteTable(table.id, table.table_number)}
                            disabled={tableLoading}
                            className="flex-1 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 px-2 py-1 rounded-lg text-[10px] font-medium transition"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL EDITAR MESA */}
        {editingTable && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-cyan-400">Editar Mesa</h3>

              <form onSubmit={handleUpdateTable} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Número de mesa
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingTable.table_number}
                    onChange={(e) =>
                      setEditingTable({
                        ...editingTable,
                        table_number: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTable(null)}
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-xs font-medium transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={tableLoading}
                    className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg text-xs font-medium transition"
                  >
                    {tableLoading ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* PESTAÑA: MENÚ */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-2 text-indigo-400">
                Agregar Nuevo Platillo o Bebida al Menú
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Se guardará automáticamente en el catálogo de tu bar.
              </p>

              <form
                onSubmit={handleCreateProduct}
                className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Margarita"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="90.00"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Categoría
                  </label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value)}
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
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Descripción
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={newProductDesc}
                    onChange={(e) => setNewProductDesc(e.target.value)}
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

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Menú de tu Sucursal</h2>
                <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-full font-semibold">
                  {productsList.length} artículos disponibles
                </span>
              </div>

              {productsList.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                  <p className="text-slate-400 text-sm">
                    Tu menú está vacío. Agrega tu primer platillo o bebida arriba.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productsList.map((prod) => (
                    <div
                      key={prod.id}
                      className="bg-slate-900 border border-slate-700/80 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-md hover:border-slate-600 transition"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/20">
                              {prod.category || 'General'}
                            </span>
                            <h3 className="font-bold text-white text-base mt-1">
                              {prod.name}
                            </h3>
                          </div>
                          <span className="text-emerald-400 font-black text-base bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                            ${Number(prod.price).toFixed(2)}
                          </span>
                        </div>
                        {prod.description && (
                          <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                            {prod.description}
                          </p>
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
              <h3 className="text-lg font-bold text-indigo-400">
                Editar Platillo o Bebida
              </h3>

              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, name: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.price}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Categoría
                  </label>
                  <select
                    value={editingProduct.category || 'Bebidas'}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, category: e.target.value })
                    }
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
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Descripción (Opcional)
                  </label>
                  <input
                    type="text"
                    value={editingProduct.description || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, description: e.target.value })
                    }
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

        {/* PESTAÑA: EMPLEADOS */}
        {activeTab === 'employees' && (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-4 text-purple-400">
                Agregar Nuevo Mesero o Cajero
              </h2>
              <form
                onSubmit={handleCreateEmployee}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="empleado@correo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Contraseña Temporal
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Rol
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'cashier' | 'waiter')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="waiter">Mesero</option>
                    <option value="cashier">Cajero</option>
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

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-4">Personal de tu Sucursal</h2>
              {employees.length === 0 ? (
                <p className="text-slate-400 text-sm py-6 text-center">
                  No hay empleados registrados en este bar.
                </p>
              ) : (
                <div className="space-y-3">
                  {employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-base">
                            {emp.full_name || emp.id.slice(0, 8)}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                              emp.role === 'admin'
                                ? 'bg-purple-500/10 text-purple-400'
                                : emp.role === 'cashier'
                                ? 'bg-sky-500/10 text-sky-400'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {emp.role}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          Registrado el: {new Date(emp.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingEmployee(emp);
                            setUpdatedPassword('');
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                        >
                          Cambiar Contraseña
                        </button>

                        <button
                          onClick={() =>
                            handleDeleteEmployee(emp.id, emp.full_name || emp.id.slice(0, 8))
                          }
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
              <p className="text-xs text-slate-400">
                Actualizando credenciales para:{' '}
                <span className="text-white font-semibold">
                  {editingEmployee.full_name || editingEmployee.id.slice(0, 8)}
                </span>
              </p>

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={updatedPassword}
                    onChange={(e) => setUpdatedPassword(e.target.value)}
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
                <h2 className="text-xl font-semibold text-emerald-400">
                  Historial y Corte por Fecha
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selecciona un día para auditar los ingresos
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-right">
                <span className="text-xs text-slate-400 block">
                  {dateFilter ? `Ventas del ${dateFilter}` : 'Ventas Totales'}
                </span>
                <span className="text-lg font-bold text-emerald-400">
                  ${filteredRevenue.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Filtrar por Fecha
                  </label>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  onClick={setTodayFilter}
                  className="mt-5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition h-[38px]"
                >
                  Ver Hoy
                </button>
              </div>
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="mt-5 sm:mt-0 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-medium border border-slate-700 transition h-[38px]"
                >
                  Mostrar Todo
                </button>
              )}
            </div>

            {filteredPaidOrders.length === 0 ? (
              <p className="text-slate-400 text-sm py-12 text-center">
                No se encontraron ventas registradas.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredPaidOrders.map((order) => {
                  const orderTotal =
                    order.order_items?.reduce((s, i) => s + Number(i.price), 0) || 0;
                  const dateStr = order.created_at
                    ? new Date(order.created_at).toLocaleString()
                    : '';
                  return (
                    <div
                      key={order.id}
                      className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-emerald-400 text-lg">
                            {order.table_name}
                          </span>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-semibold">
                            Pagada
                          </span>
                          <span className="text-xs text-slate-400">{dateStr}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs text-slate-300">
                          {order.order_items?.map((item, idx) => {
                            const rawP = item.products;
                            const pName = Array.isArray(rawP)
                              ? rawP[0]?.name
                              : rawP?.name || productsMap.get(item.product_id) || 'Platillo';
                            return (
                              <span
                                key={idx}
                                className="bg-slate-800 px-2 py-1 rounded border border-slate-700"
                              >
                                • {pName} (${item.price})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Total</span>
                        <span className="text-xl font-black text-emerald-400">
                          ${orderTotal.toFixed(2)}
                        </span>
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
            <h2 className="text-xl font-semibold mb-4 text-amber-400">
              Monitoreo de Mesas Activas
            </h2>
            {pendingOrders.length === 0 ? (
              <p className="text-slate-400 text-sm py-8 text-center">
                No hay mesas ocupadas actualmente en tu bar.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingOrders.map((order) => {
                  const orderTotal =
                    order.order_items?.reduce((s, i) => s + Number(i.price), 0) || 0;
                  return (
                    <div
                      key={order.id}
                      className="bg-slate-900 border border-slate-700 p-4 rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-amber-400">{order.table_name}</h3>
                        <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-semibold">
                          Abierta
                        </span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto text-xs text-slate-300 border-t border-slate-800 pt-2">
                        {order.order_items?.map((item, idx) => {
                          const rawP = item.products;
                          const pName = Array.isArray(rawP)
                            ? rawP[0]?.name
                            : rawP?.name || productsMap.get(item.product_id) || 'Platillo';
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
                        <span className="font-black text-emerald-400">
                          ${orderTotal.toFixed(2)}
                        </span>
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