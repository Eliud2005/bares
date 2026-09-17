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
  is_active?: boolean;
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

type ConfirmState = {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
} | null;

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

  // Análisis
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
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

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

  // Helper de confirmación visual
  const askConfirm = (state: ConfirmState) => setConfirmState(state);

  const runConfirm = async () => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.onConfirm();
    } finally {
      setConfirmLoading(false);
      setConfirmState(null);
    }
  };

  const loadAdminData = async () => {
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
      setAlertInfo({
        type: 'error',
        message: 'No se encontró un bar asociado a tu usuario administrador.',
      });
      setLoading(false);
      return;
    }

    const barId = profileData.bar_id;
    setCurrentBarId(barId);

    const { data: barData } = await supabase
      .from('bars')
      .select('id, name, slug, address, phone, trial_until, subscription_status, is_active')
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
      .select('*')
      .eq('bar_id', barId)
      .order('name', { ascending: true });

    if (productsData) {
      setProductsList(productsData as Product[]);
      setProductsMap(new Map(productsData.map((p) => [p.id, p.name])));
    }

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

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .eq('bar_id', barId);

    if (profilesData) setEmployees(profilesData as Employee[]);

    const { data: tablesData } = await supabase
      .from('tables')
      .select('*')
      .eq('bar_id', barId)
      .is('deleted_at', null)
      .order('table_number', { ascending: true });

    if (tablesData) setTablesList(tablesData as Table[]);

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
    askConfirm({
      title: 'Eliminar empleado',
      message: `¿Estás seguro de eliminar a ${label}? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      danger: true,
      onConfirm: async () => {
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
      },
    });
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
    askConfirm({
      title: 'Eliminar platillo',
      message: `¿Eliminar "${productName}" del menú? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      danger: true,
      onConfirm: async () => {
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
      },
    });
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
    askConfirm({
      title: 'Eliminar mesa',
      message: `¿Eliminar "${name}"? Las órdenes existentes no se borrarán, pero la mesa desaparecerá del panel del mesero.`,
      confirmText: 'Sí, eliminar',
      danger: true,
      onConfirm: async () => {
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
      },
    });
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
      <div
        className="p-8 text-white min-h-screen flex items-center justify-center"
        style={{ backgroundColor: brand.bg }}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className="inline-block w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: brand.cyan, borderTopColor: 'transparent' }}
          ></span>
          <span style={{ color: brand.textSecondary }}>Cargando panel de administrador...</span>
        </div>
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

      {/* Modal de confirmación */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            className="w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 border"
            style={{
              backgroundColor: brand.surface,
              borderColor: confirmState.danger ? brand.coral : brand.cyan,
              boxShadow: confirmState.danger
                ? '0 25px 60px -20px rgba(255, 107, 107, 0.4)'
                : '0 25px 60px -20px rgba(0, 229, 255, 0.4)',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{
                  backgroundColor: confirmState.danger
                    ? 'rgba(255, 107, 107, 0.15)'
                    : 'rgba(0, 229, 255, 0.15)',
                }}
              >
                {confirmState.danger ? '⚠️' : '❓'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{confirmState.title}</h3>
                <p className="text-sm mt-1" style={{ color: brand.textSecondary }}>
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmState(null)}
                disabled={confirmLoading}
                className="w-1/2 font-medium py-2.5 rounded-xl text-sm transition border disabled:opacity-50"
                style={{
                  backgroundColor: brand.surfaceLight,
                  borderColor: brand.border,
                  color: brand.textSecondary,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={runConfirm}
                disabled={confirmLoading}
                className="w-1/2 font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: confirmState.danger
                    ? `linear-gradient(135deg, ${brand.coral} 0%, #E55555 100%)`
                    : `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                  color: '#0A0F1A',
                }}
              >
                {confirmLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                    Procesando...
                  </>
                ) : (
                  confirmState.confirmText || 'Confirmar'
                )}
              </button>
            </div>
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
                Admin - Sucursal
              </span>
              <h1 className="text-3xl font-bold mt-1 truncate">
                {barInfo?.name || 'Panel de Control'}
              </h1>
              {barInfo && (
                <div
                  className="flex flex-wrap items-center gap-3 mt-2 text-xs"
                  style={{ color: brand.textSecondary }}
                >
                  {barInfo.slug && (
                    <span
                      className="font-mono px-2 py-0.5 rounded border"
                      style={{
                        backgroundColor: brand.surfaceLight,
                        borderColor: brand.border,
                        color: brand.cyan,
                      }}
                    >
                      /{barInfo.slug}
                    </span>
                  )}
                  {barInfo.address && <span>📍 {barInfo.address}</span>}
                  {barInfo.phone && <span>📞 {barInfo.phone}</span>}
                </div>
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

        {/* BANNER TRIAL */}
        {barInfo?.trial_until &&
          (() => {
            const days = Math.ceil(
              (new Date(barInfo.trial_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            if (days < 0) {
              return (
                <div
                  className="rounded-xl p-4 mb-6 border flex items-center justify-between"
                  style={{
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    borderColor: 'rgba(255, 107, 107, 0.3)',
                  }}
                >
                  <div>
                    <p className="font-bold text-sm" style={{ color: brand.coral }}>
                      🔴 Tu período de prueba ha expirado
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#FFB3B3' }}>
                      Contacta a soporte para renovar tu suscripción.
                    </p>
                  </div>
                </div>
              );
            }
            if (days <= 5) {
              return (
                <div
                  className="rounded-xl p-4 mb-6 border flex items-center justify-between"
                  style={{
                    backgroundColor: 'rgba(255, 184, 77, 0.1)',
                    borderColor: 'rgba(255, 184, 77, 0.3)',
                  }}
                >
                  <div>
                    <p className="font-bold text-sm" style={{ color: brand.amber }}>
                      ⚠️ Tu período de prueba termina en {days} {days === 1 ? 'día' : 'días'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#FFD79A' }}>
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
          <div
            className="p-6 rounded-2xl border shadow-lg"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(0, 224, 164, 0.3)' }}
          >
            <h3 className="text-sm font-medium" style={{ color: brand.textSecondary }}>
              Ventas Totales Cobradas
            </h3>
            <p className="text-3xl font-bold mt-2" style={{ color: brand.greenBright }}>
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
          <div
            className="p-6 rounded-2xl border shadow-lg"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(0, 229, 255, 0.3)' }}
          >
            <h3 className="text-sm font-medium" style={{ color: brand.textSecondary }}>
              Cuentas Cobradas
            </h3>
            <p className="text-3xl font-bold mt-2" style={{ color: brand.cyan }}>
              {paidOrders.length}
            </p>
          </div>
          <div
            className="p-6 rounded-2xl border shadow-lg"
            style={{ backgroundColor: brand.surface, borderColor: 'rgba(255, 184, 77, 0.3)' }}
          >
            <h3 className="text-sm font-medium" style={{ color: brand.textSecondary }}>
              Mesas / Órdenes Pendientes
            </h3>
            <p className="text-3xl font-bold mt-2" style={{ color: brand.amber }}>
              {pendingOrders.length}
            </p>
          </div>
        </div>

        {/* PESTAÑAS */}
        <div className="flex flex-wrap gap-3 mb-6 pb-4 border-b" style={{ borderColor: brand.border }}>
          {(
            [
              { key: 'analytics', label: `📊 Análisis` },
              { key: 'paid', label: `📋 Historial (${paidOrders.length})` },
              { key: 'pending', label: `⏳ Mesas Activas (${pendingOrders.length})` },
              { key: 'menu', label: `📖 Menú (${productsList.length})` },
              { key: 'tables', label: `🪑 Mesas (${tablesList.length})` },
              { key: 'employees', label: `👥 Empleados (${employees.length})` },
            ] as { key: typeof activeTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2 rounded-lg font-semibold text-sm transition"
              style={{
                background:
                  activeTab === tab.key
                    ? tab.key === 'pending'
                      ? `linear-gradient(135deg, ${brand.amber} 0%, #E5A030 100%)`
                      : `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`
                    : brand.surface,
                color: activeTab === tab.key ? '#0A0F1A' : brand.textSecondary,
                border: `1px solid ${activeTab === tab.key ? 'transparent' : brand.border}`,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* PESTAÑA: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div
            className="p-6 rounded-2xl border shadow-xl space-y-6"
            style={{ backgroundColor: brand.surface, borderColor: brand.border }}
          >
            <div>
              <h2 className="text-xl font-semibold" style={{ color: brand.cyan }}>
                📊 Análisis de Ganancias
              </h2>
              <p className="text-xs mt-0.5" style={{ color: brand.textSecondary }}>
                Selecciona el período que quieras analizar
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {rangeButtons.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRangeOption(opt.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition border"
                  style={{
                    background:
                      rangeOption === opt.key
                        ? `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`
                        : brand.surfaceLight,
                    color: rangeOption === opt.key ? '#0A0F1A' : brand.textSecondary,
                    borderColor: rangeOption === opt.key ? 'transparent' : brand.border,
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setRangeOption('custom')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition border"
                style={{
                  background:
                    rangeOption === 'custom'
                      ? `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`
                      : brand.surfaceLight,
                  color: rangeOption === 'custom' ? '#0A0F1A' : brand.textSecondary,
                  borderColor: rangeOption === 'custom' ? 'transparent' : brand.border,
                }}
              >
                📅 Personalizado
              </button>
            </div>

            {rangeOption === 'custom' && (
              <div
                className="p-4 rounded-xl flex flex-wrap gap-3 items-end border"
                style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
              >
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Desde
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm text-white border"
                    style={{ backgroundColor: brand.bg, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm text-white border"
                    style={{ backgroundColor: brand.bg, borderColor: brand.border }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className="p-5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(0, 224, 164, 0.08)',
                  borderColor: 'rgba(0, 224, 164, 0.3)',
                }}
              >
                <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                  Ingresos del período
                </span>
                <span className="text-3xl font-black" style={{ color: brand.greenBright }}>
                  ${rangeData.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                {rangeData.previousTotal > 0 && (
                  <div className="mt-2 text-xs">
                    {rangeData.total >= rangeData.previousTotal ? (
                      <span style={{ color: brand.greenBright }} className="font-bold">
                        ↑{' '}
                        {(
                          ((rangeData.total - rangeData.previousTotal) /
                            rangeData.previousTotal) *
                          100
                        ).toFixed(1)}
                        % vs período anterior
                      </span>
                    ) : (
                      <span style={{ color: brand.coral }} className="font-bold">
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

              <div
                className="p-5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(0, 229, 255, 0.08)',
                  borderColor: 'rgba(0, 229, 255, 0.3)',
                }}
              >
                <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                  Cuentas cobradas
                </span>
                <span className="text-3xl font-black" style={{ color: brand.cyan }}>
                  {rangeData.count}
                </span>
              </div>

              <div
                className="p-5 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(255, 184, 77, 0.08)',
                  borderColor: 'rgba(255, 184, 77, 0.3)',
                }}
              >
                <span className="text-xs block mb-1" style={{ color: brand.textSecondary }}>
                  Ticket promedio
                </span>
                <span className="text-3xl font-black" style={{ color: brand.amber }}>
                  ${rangeData.average.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {rangeLoading ? (
              <div
                className="p-12 rounded-xl text-center text-sm border"
                style={{
                  backgroundColor: brand.surfaceLight,
                  borderColor: brand.border,
                  color: brand.textSecondary,
                }}
              >
                Cargando datos...
              </div>
            ) : rangeData.chart.length === 0 ? (
              <div
                className="p-12 rounded-xl text-center text-sm border"
                style={{
                  backgroundColor: brand.surfaceLight,
                  borderColor: brand.border,
                  color: brand.textSecondary,
                }}
              >
                No hay datos en este período.
              </div>
            ) : (
              <div
                className="p-5 rounded-xl border"
                style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
              >
                <h3
                  className="text-sm font-bold uppercase tracking-wider mb-4"
                  style={{ color: brand.textSecondary }}
                >
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
                        <span className="text-[10px] font-bold" style={{ color: brand.greenBright }}>
                          {m.total > 999 ? `${(m.total / 1000).toFixed(1)}k` : m.total.toFixed(0)}
                        </span>
                        <div
                          className="w-full rounded-t-lg transition-all"
                          style={{
                            height: `${Math.max(heightPct, 2)}%`,
                            minHeight: '4px',
                            background: `linear-gradient(to top, ${brand.cyanDark}, ${brand.cyan})`,
                          }}
                          title={`${m.label}: $${m.total.toFixed(2)}`}
                        />
                        <span
                          className="text-[9px] font-medium whitespace-nowrap"
                          style={{ color: brand.textMuted }}
                        >
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
            <div
              className="p-6 rounded-2xl border shadow-xl"
              style={{ backgroundColor: brand.surface, borderColor: brand.border }}
            >
              <h2 className="text-xl font-semibold mb-2" style={{ color: brand.cyan }}>
                Agregar Nueva Mesa
              </h2>
              <p className="text-xs mb-4" style={{ color: brand.textSecondary }}>
                Ingresa solo el número. El sistema la mostrará como "Mesa 01", "Mesa 02", etc.
              </p>

              <form onSubmit={handleCreateTable} className="flex flex-wrap gap-3 items-end">
                <div className="w-40">
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Número de mesa
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Ej. 7"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={tableLoading}
                  className="font-semibold py-2 px-4 rounded-lg text-sm transition h-[38px] disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                  }}
                >
                  {tableLoading ? 'Creando...' : '+ Agregar Mesa'}
                </button>
              </form>
            </div>

            <div
              className="p-6 rounded-2xl border shadow-xl"
              style={{ backgroundColor: brand.surface, borderColor: brand.border }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Mesas de tu Sucursal</h2>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-semibold border"
                  style={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    color: brand.cyan,
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                  }}
                >
                  {tablesList.filter((t) => t.is_active).length} activas / {tablesList.length} total
                </span>
              </div>

              {tablesList.length === 0 ? (
                <div
                  className="text-center py-12 rounded-xl border border-dashed"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                  }}
                >
                  <p className="text-sm" style={{ color: brand.textSecondary }}>
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
                        className={`p-4 rounded-2xl border flex flex-col justify-between gap-2 transition relative overflow-hidden ${
                          isActive ? '' : 'opacity-60'
                        }`}
                        style={{
                          backgroundColor: brand.surfaceLight,
                          borderColor: isActive ? brand.border : 'rgba(42, 54, 84, 0.4)',
                        }}
                      >
                        <div
                          className="absolute top-0 left-0 right-0 h-1"
                          style={{ backgroundColor: isActive ? brand.cyan : brand.textMuted }}
                        ></div>

                        <div className="flex justify-between items-start mt-1">
                          <h3
                            className={`font-bold text-sm ${isActive ? 'text-white' : 'line-through'}`}
                            style={{ color: isActive ? '#FFFFFF' : brand.textMuted }}
                          >
                            Mesa {String(table.table_number).padStart(2, '0')}
                          </h3>
                          <button
                            onClick={() => handleToggleTableActive(table.id, isActive)}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: isActive
                                ? 'rgba(0, 229, 255, 0.2)'
                                : 'rgba(100, 116, 139, 0.3)',
                              color: isActive ? brand.cyan : brand.textMuted,
                            }}
                            title={isActive ? 'Desactivar' : 'Activar'}
                          >
                            {isActive ? 'ON' : 'OFF'}
                          </button>
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingTable(table)}
                            className="flex-1 border px-2 py-1 rounded-lg text-[10px] font-medium transition"
                            style={{
                              backgroundColor: 'rgba(0, 229, 255, 0.1)',
                              borderColor: 'rgba(0, 229, 255, 0.3)',
                              color: brand.cyan,
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteTable(table.id, table.table_number)}
                            disabled={tableLoading}
                            className="flex-1 border px-2 py-1 rounded-lg text-[10px] font-medium transition"
                            style={{
                              backgroundColor: 'rgba(255, 107, 107, 0.1)',
                              borderColor: 'rgba(255, 107, 107, 0.3)',
                              color: brand.coral,
                            }}
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
              className="p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: '0 25px 60px -20px rgba(0, 229, 255, 0.4)',
              }}
            >
              <h3 className="text-lg font-bold" style={{ color: brand.cyan }}>
                Editar Mesa
              </h3>

              <form onSubmit={handleUpdateTable} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
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
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTable(null)}
                    className="border px-4 py-2 rounded-lg text-xs font-medium transition"
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
                    disabled={tableLoading}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition"
                    style={{
                      background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                      color: '#0A0F1A',
                    }}
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
            <div
              className="p-6 rounded-2xl border shadow-xl"
              style={{ backgroundColor: brand.surface, borderColor: brand.border }}
            >
              <h2 className="text-xl font-semibold mb-2" style={{ color: brand.cyan }}>
                Agregar Nuevo Platillo o Bebida al Menú
              </h2>
              <p className="text-xs mb-4" style={{ color: brand.textSecondary }}>
                Se guardará automáticamente en el catálogo de tu bar.
              </p>

              <form
                onSubmit={handleCreateProduct}
                className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
              >
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Margarita"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="90.00"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Categoría
                  </label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  >
                    <option value="Bebidas">Bebidas</option>
                    <option value="Cocktails">Cocktails</option>
                    <option value="Platillos">Platillos</option>
                    <option value="Botanas">Botanas</option>
                    <option value="Postres">Postres</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Descripción
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={newProductDesc}
                    onChange={(e) => setNewProductDesc(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={productLoading}
                  className="font-semibold py-2 px-4 rounded-lg text-sm transition h-[38px] disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                  }}
                >
                  {productLoading ? 'Agregando...' : 'Añadir'}
                </button>
              </form>
            </div>

            <div
              className="p-6 rounded-2xl border shadow-xl"
              style={{ backgroundColor: brand.surface, borderColor: brand.border }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Menú de tu Sucursal</h2>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-semibold border"
                  style={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    color: brand.cyan,
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                  }}
                >
                  {productsList.length} artículos disponibles
                </span>
              </div>

              {productsList.length === 0 ? (
                <div
                  className="text-center py-12 rounded-xl border border-dashed"
                  style={{
                    backgroundColor: brand.surfaceLight,
                    borderColor: brand.border,
                  }}
                >
                  <p className="text-sm" style={{ color: brand.textSecondary }}>
                    Tu menú está vacío. Agrega tu primer platillo o bebida arriba.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productsList.map((prod) => (
                    <div
                      key={prod.id}
                      className="p-4 rounded-2xl flex flex-col justify-between gap-3 border transition"
                      style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span
                              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border"
                              style={{
                                color: brand.cyan,
                                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                                borderColor: 'rgba(0, 229, 255, 0.3)',
                              }}
                            >
                              {prod.category || 'General'}
                            </span>
                            <h3 className="font-bold text-white text-base mt-1">{prod.name}</h3>
                          </div>
                          <span
                            className="font-black text-base px-2 py-0.5 rounded-lg border"
                            style={{
                              color: brand.greenBright,
                              backgroundColor: 'rgba(0, 224, 164, 0.1)',
                              borderColor: 'rgba(0, 224, 164, 0.3)',
                            }}
                          >
                            ${Number(prod.price).toFixed(2)}
                          </span>
                        </div>
                        {prod.description && (
                          <p className="text-xs mt-2 line-clamp-2" style={{ color: brand.textSecondary }}>
                            {prod.description}
                          </p>
                        )}
                      </div>
                      <div
                        className="flex justify-end gap-2 pt-3 border-t"
                        style={{ borderColor: brand.border }}
                      >
                        <button
                          onClick={() => setEditingProduct(prod)}
                          className="border px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                          style={{
                            backgroundColor: 'rgba(0, 229, 255, 0.1)',
                            borderColor: 'rgba(0, 229, 255, 0.3)',
                            color: brand.cyan,
                          }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id, prod.name)}
                          disabled={productLoading}
                          className="border px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                          style={{
                            backgroundColor: 'rgba(255, 107, 107, 0.1)',
                            borderColor: 'rgba(255, 107, 107, 0.3)',
                            color: brand.coral,
                          }}
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
              className="p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: '0 25px 60px -20px rgba(0, 229, 255, 0.4)',
              }}
            >
              <h3 className="text-lg font-bold" style={{ color: brand.cyan }}>
                Editar Platillo o Bebida
              </h3>

              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
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
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Categoría
                  </label>
                  <select
                    value={editingProduct.category || 'Bebidas'}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, category: e.target.value })
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  >
                    <option value="Bebidas">Bebidas</option>
                    <option value="Cocktails">Cocktails</option>
                    <option value="Platillos">Platillos</option>
                    <option value="Botanas">Botanas</option>
                    <option value="Postres">Postres</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Descripción (Opcional)
                  </label>
                  <input
                    type="text"
                    value={editingProduct.description || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, description: e.target.value })
                    }
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="border px-4 py-2 rounded-lg text-xs font-medium transition"
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
                    disabled={productLoading}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition"
                    style={{
                      background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                      color: '#0A0F1A',
                    }}
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
            <div
              className="p-6 rounded-2xl border shadow-xl"
              style={{ backgroundColor: brand.surface, borderColor: brand.border }}
            >
              <h2 className="text-xl font-semibold mb-4" style={{ color: brand.cyan }}>
                Agregar Nuevo Mesero o Cajero
              </h2>
              <form
                onSubmit={handleCreateEmployee}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
              >
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="empleado@correo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Contraseña Temporal
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Rol
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'cashier' | 'waiter')}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  >
                    <option value="waiter">Mesero</option>
                    <option value="cashier">Cajero</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={employeeLoading}
                  className="font-semibold py-2 px-4 rounded-lg text-sm transition h-[38px] disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                  }}
                >
                  {employeeLoading ? 'Registrando...' : 'Crear Empleado'}
                </button>
              </form>
            </div>

            <div
              className="p-6 rounded-2xl border shadow-xl"
              style={{ backgroundColor: brand.surface, borderColor: brand.border }}
            >
              <h2 className="text-xl font-semibold mb-4">Personal de tu Sucursal</h2>
              {employees.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: brand.textSecondary }}>
                  No hay empleados registrados en este bar.
                </p>
              ) : (
                <div className="space-y-3">
                  {employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border"
                      style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-base">
                            {emp.full_name || emp.id.slice(0, 8)}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded font-semibold uppercase border"
                            style={{
                              backgroundColor: 'rgba(0, 229, 255, 0.1)',
                              color: brand.cyan,
                              borderColor: 'rgba(0, 229, 255, 0.3)',
                            }}
                          >
                            {emp.role}
                          </span>
                        </div>
                        <span className="text-xs" style={{ color: brand.textMuted }}>
                          Registrado el: {new Date(emp.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingEmployee(emp);
                            setUpdatedPassword('');
                          }}
                          className="border px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          style={{
                            backgroundColor: 'rgba(0, 229, 255, 0.1)',
                            borderColor: 'rgba(0, 229, 255, 0.3)',
                            color: brand.cyan,
                          }}
                        >
                          Cambiar Contraseña
                        </button>

                        <button
                          onClick={() =>
                            handleDeleteEmployee(emp.id, emp.full_name || emp.id.slice(0, 8))
                          }
                          disabled={employeeLoading}
                          className="border px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          style={{
                            backgroundColor: 'rgba(255, 107, 107, 0.1)',
                            borderColor: 'rgba(255, 107, 107, 0.3)',
                            color: brand.coral,
                          }}
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
              className="p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 border"
              style={{
                backgroundColor: brand.surface,
                borderColor: brand.cyan,
                boxShadow: '0 25px 60px -20px rgba(0, 229, 255, 0.4)',
              }}
            >
              <h3 className="text-lg font-bold text-white">Cambiar Contraseña</h3>
              <p className="text-xs" style={{ color: brand.textSecondary }}>
                Actualizando credenciales para:{' '}
                <span className="text-white font-semibold">
                  {editingEmployee.full_name || editingEmployee.id.slice(0, 8)}
                </span>
              </p>

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={updatedPassword}
                    onChange={(e) => setUpdatedPassword(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(null)}
                    className="border px-4 py-2 rounded-lg text-xs font-medium transition"
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
                    disabled={employeeLoading}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition"
                    style={{
                      background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                      color: '#0A0F1A',
                    }}
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
          <div
            className="p-6 rounded-2xl border shadow-xl space-y-6"
            style={{ backgroundColor: brand.surface, borderColor: brand.border }}
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: brand.cyan }}>
                  Historial y Corte por Fecha
                </h2>
                <p className="text-xs mt-0.5" style={{ color: brand.textSecondary }}>
                  Selecciona un día para auditar los ingresos
                </p>
              </div>
              <div
                className="px-4 py-2 rounded-xl text-right border"
                style={{
                  backgroundColor: 'rgba(0, 224, 164, 0.08)',
                  borderColor: 'rgba(0, 224, 164, 0.3)',
                }}
              >
                <span className="text-xs block" style={{ color: brand.textSecondary }}>
                  {dateFilter ? `Ventas del ${dateFilter}` : 'Ventas Totales'}
                </span>
                <span className="text-lg font-bold" style={{ color: brand.greenBright }}>
                  ${filteredRevenue.toFixed(2)}
                </span>
              </div>
            </div>

            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row gap-3 items-center justify-between"
              style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
            >
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase mb-1"
                    style={{ color: brand.textSecondary }}
                  >
                    Filtrar por Fecha
                  </label>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm text-white border focus:outline-none"
                    style={{ backgroundColor: brand.bg, borderColor: brand.border }}
                  />
                </div>
                <button
                  onClick={setTodayFilter}
                  className="mt-5 px-3 py-2 rounded-lg text-xs font-semibold transition h-[38px]"
                  style={{
                    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.cyanDark} 100%)`,
                    color: '#0A0F1A',
                  }}
                >
                  Ver Hoy
                </button>
              </div>
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="mt-5 sm:mt-0 border px-4 py-2 rounded-lg text-xs font-medium transition h-[38px]"
                  style={{
                    backgroundColor: brand.bg,
                    borderColor: brand.border,
                    color: brand.textSecondary,
                  }}
                >
                  Mostrar Todo
                </button>
              )}
            </div>

            {filteredPaidOrders.length === 0 ? (
              <p className="text-sm py-12 text-center" style={{ color: brand.textSecondary }}>
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
                      className="p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border"
                      style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg" style={{ color: brand.cyan }}>
                            {order.table_name}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded font-semibold border"
                            style={{
                              backgroundColor: 'rgba(0, 224, 164, 0.1)',
                              color: brand.greenBright,
                              borderColor: 'rgba(0, 224, 164, 0.3)',
                            }}
                          >
                            Pagada
                          </span>
                          <span className="text-xs" style={{ color: brand.textMuted }}>
                            {dateStr}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {order.order_items?.map((item, idx) => {
                            const rawP = item.products;
                            const pName = Array.isArray(rawP)
                              ? rawP[0]?.name
                              : rawP?.name || productsMap.get(item.product_id) || 'Platillo';
                            return (
                              <span
                                key={idx}
                                className="px-2 py-1 rounded border"
                                style={{
                                  backgroundColor: brand.bg,
                                  borderColor: brand.border,
                                  color: '#FFFFFF',
                                }}
                              >
                                • {pName} (${item.price})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs block" style={{ color: brand.textSecondary }}>
                          Total
                        </span>
                        <span className="text-xl font-black" style={{ color: brand.greenBright }}>
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
          <div
            className="p-6 rounded-2xl border shadow-xl"
            style={{ backgroundColor: brand.surface, borderColor: brand.border }}
          >
            <h2 className="text-xl font-semibold mb-4" style={{ color: brand.amber }}>
              Monitoreo de Mesas Activas
            </h2>
            {pendingOrders.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: brand.textSecondary }}>
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
                      className="p-4 rounded-2xl space-y-3 border"
                      style={{ backgroundColor: brand.surfaceLight, borderColor: brand.border }}
                    >
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold" style={{ color: brand.amber }}>
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
                          Abierta
                        </span>
                      </div>
                      <div
                        className="space-y-1 max-h-28 overflow-y-auto text-xs border-t pt-2"
                        style={{ color: brand.textSecondary, borderColor: brand.border }}
                      >
                        {order.order_items?.map((item, idx) => {
                          const rawP = item.products;
                          const pName = Array.isArray(rawP)
                            ? rawP[0]?.name
                            : rawP?.name || productsMap.get(item.product_id) || 'Platillo';
                          return (
                            <div key={idx} className="flex justify-between">
                              <span>• {pName}</span>
                              <span style={{ color: brand.cyan }}>${item.price}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        className="border-t pt-2 flex justify-between items-center text-sm"
                        style={{ borderColor: brand.border }}
                      >
                        <span style={{ color: brand.textSecondary }}>Consumo:</span>
                        <span className="font-black" style={{ color: brand.greenBright }}>
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