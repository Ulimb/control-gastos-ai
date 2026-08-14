'use client';

import { useState, useEffect } from 'react';
import { db, getPeriodBalance, getExpensesByCategory, formatARS, getCategoriesWithSubs, syncMovementToGoogleSheets, syncToSheets } from '@/lib/db';
import type { Expense } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function ResumenPage() {
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0); // 0 = actual, -1 = mes anterior, etc.
  const [balance, setBalance] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<any[]>([]);
  const [historyMonths, setHistoryMonths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'month' | 'history'>('month');

  // Filtros de búsqueda en el detalle del mes
  const [selectedCatFilter, setSelectedCatFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Edición / Eliminación de gasto
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editStore, setEditStore] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);

  // Calcular la fecha según el offset de meses seleccionado
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + selectedMonthOffset);
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  const startDate = new Date(year, month, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const monthName = targetDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  useEffect(() => {
    loadData();
  }, [selectedMonthOffset, activeTab]);

  const loadData = async () => {
    setLoading(true);
    const cats = await getCategoriesWithSubs();
    setCategories(cats);

    if (activeTab === 'month') {
      const [bal, catBreakdown] = await Promise.all([
        getPeriodBalance(startDate, endDate),
        getExpensesByCategory(startDate, endDate),
      ]);
      setBalance(bal);
      setBreakdown(catBreakdown);

      // Cargar lista completa de gastos detallados de este mes
      const rawExps = await db.expenses
        .where('date').between(startDate, endDate, true, true)
        .and(e => e.status === 'active')
        .reverse()
        .toArray();

      const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
      const subMap = Object.fromEntries(
        cats.flatMap(c => c.subcategories).map((s: any) => [s.id, s.name])
      );

      const enriched = rawExps.map(e => ({
        ...e,
        category_name: catMap[e.category_id]?.name || 'Variado',
        category_icon: catMap[e.category_id]?.icon || '📦',
        category_color: catMap[e.category_id]?.color || '#6366f1',
        subcategory_name: subMap[e.subcategory_id] || 'General',
      }));

      setMonthExpenses(enriched);
    } else {
      // Cargar los últimos 6 meses para la comparativa histórica
      const monthsData: any[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const y = d.getFullYear();
        const m = d.getMonth();
        const s = new Date(y, m, 1).toISOString().split('T')[0];
        const e = new Date(y, m + 1, 0).toISOString().split('T')[0];
        const bal = await getPeriodBalance(s, e);
        monthsData.push({
          name: d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
          offset: -i,
          ...bal,
        });
      }
      setHistoryMonths(monthsData);
    }
    setLoading(false);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditStore(exp.store || '');
    setEditDetail(exp.detail || '');
    setEditAmount(exp.amount.toString());
    setEditDate(exp.date);
    setEditCatId(exp.category_id);
    setEditSubId(exp.subcategory_id);
    setShowEditModal(true);
  };

  const handleReplicateExpense = (exp: Expense) => {
    setEditingExpense(null); // Es un gasto nuevo, no edición
    setEditStore(exp.store || '');
    setEditDetail(exp.detail || '');
    setEditAmount(exp.amount.toString());
    setEditDate(new Date().toISOString().split('T')[0]); // Fecha de hoy
    setEditCatId(exp.category_id);
    setEditSubId(exp.subcategory_id);
    setShowEditModal(true);
  };

  const confirmDeleteExpense = async () => {
    if (!deletingId) return;
    await db.expenses.delete(deletingId);
    // Sincronizar eliminación a Google Sheets
    syncToSheets('delete', deletingId);
    setDeletingId(null);
    loadData();
  };

  const handleSaveEdit = async () => {
    if (!editAmount || parseFloat(editAmount) <= 0) return;

    const numAmount = parseFloat(editAmount);
    const catId = editCatId || 1;
    const subId = editSubId || 1;
    const catObj = categories.find(c => c.id === catId);
    const subObj = catObj?.subcategories?.find((s: any) => s.id === subId);
    const trimmedStore = editStore.trim();
    const trimmedDetail = editDetail.trim();

    if (editingExpense?.id) {
      // EDITAR EXISTENTE — sincronizar como update
      await db.expenses.update(editingExpense.id, {
        store: trimmedStore,
        detail: trimmedDetail,
        amount: numAmount,
        date: editDate,
        category_id: catId,
        subcategory_id: subId,
        updated_at: new Date().toISOString(),
      });
      syncToSheets('update', editingExpense.id, {
        fecha: editDate,
        tipo: 'Gasto',
        categoria: catObj?.name || 'Varios',
        subcategoria: subObj?.name || 'General',
        comercio: trimmedStore,
        detalle: trimmedDetail,
        monto: numAmount,
        notas: editingExpense.notes || '',
      });
    } else {
      // DUPLICAR / CREAR GASTO NUEVO PARA HOY
      const newExp = {
        date: editDate || new Date().toISOString().split('T')[0],
        amount: numAmount,
        store: trimmedStore,
        detail: trimmedDetail,
        notes: '',
        category_id: catId,
        subcategory_id: subId,
        status: 'active' as const,
        module_origin: 'general' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const newId = await db.expenses.add(newExp);
      // Sincronizar como add con el ID generado
      syncToSheets('add', Number(newId), {
        fecha: newExp.date,
        tipo: 'Gasto',
        categoria: catObj?.name || 'Varios',
        subcategoria: subObj?.name || 'General',
        comercio: trimmedStore,
        detalle: trimmedDetail,
        monto: numAmount,
      });
    }

    setShowEditModal(false);
    loadData();
  };

  // Filtrar gastos por búsqueda o por categoría seleccionada
  const filteredMonthExpenses = monthExpenses.filter(e => {
    if (selectedCatFilter && e.category_id !== selectedCatFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDetail = (e.detail || '').toLowerCase().includes(q);
      const matchCat = (e.category_name || '').toLowerCase().includes(q);
      const matchSub = (e.subcategory_name || '').toLowerCase().includes(q);
      return matchDetail || matchCat || matchSub;
    }
    return true;
  });

  const activeEditCat = categories.find(c => c.id === editCatId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Resumen & Análisis</h1>
          <p className="page-subtitle" style={{ textTransform: 'capitalize' }}>{monthName}</p>
        </div>
      </div>

      {/* Tabs: Vista del mes vs Histórico comparativo */}
      <div className="chips-row" style={{ marginBottom: 16 }}>
        <button
          className={`chip${activeTab === 'month' ? ' active' : ''}`}
          onClick={() => setActiveTab('month')}
        >
          📅 Análisis Mensual
        </button>
        <button
          className={`chip${activeTab === 'history' ? ' active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📈 Histórico 6 Meses
        </button>
      </div>

      {activeTab === 'month' && (
        <>
          {/* Selector de Mes */}
          <div className="card card-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedMonthOffset(prev => prev - 1); setSelectedCatFilter(null); }}>
              ‹ Mes Anterior
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>{monthName}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSelectedMonthOffset(prev => Math.min(0, prev + 1)); setSelectedCatFilter(null); }}
              disabled={selectedMonthOffset >= 0}
            >
              Mes Siguiente ›
            </button>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <p className="empty-state-text">Cargando métricas de {monthName}...</p>
            </div>
          ) : (
            <>
              {/* Card de Balance */}
              <div className="balance-card animate-in">
                <p className="balance-label">Disponible del período</p>
                <p className={`balance-value${balance?.disponible < 0 ? ' negative' : ''}`}>
                  {formatARS(balance?.disponible || 0)}
                </p>
                <div className="balance-row">
                  <div className="balance-item">
                    <span className="balance-sub-label">(+) Ingresos</span>
                    <span className="balance-income">{formatARS(balance?.totalIncome || 0)}</span>
                  </div>
                  <div className="balance-divider" />
                  <div className="balance-item">
                    <span className="balance-sub-label">(-) Gastos</span>
                    <span className="balance-expense">{formatARS(balance?.totalExpenses || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Gastos por categoría */}
              <p className="section-title">Desglose por Categoría (tocá para filtrar)</p>
              {breakdown.length === 0 ? (
                <div className="card">
                  <div className="empty-state" style={{ padding: '24px 0' }}>
                    <div className="empty-state-icon">📭</div>
                    <p className="empty-state-text">Sin gastos registrados en {monthName}</p>
                  </div>
                </div>
              ) : (
                <div className="card">
                  {selectedCatFilter && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }}
                      onClick={() => setSelectedCatFilter(null)}
                    >
                      🔄 Ver todas las categorías ({monthExpenses.length} gastos)
                    </button>
                  )}
                  {breakdown.map((cat, idx) => {
                    const pct = balance?.totalExpenses > 0
                      ? Math.min((cat.total / balance.totalExpenses) * 100, 100)
                      : 0;
                    const catObj = categories.find(c => c.name === cat.name);
                    const isSelected = catObj?.id === selectedCatFilter;

                    return (
                      <div
                        key={idx}
                        style={{
                          marginBottom: idx < breakdown.length - 1 ? 16 : 0,
                          cursor: 'pointer',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: isSelected ? 'var(--accent-dim)' : 'transparent',
                          border: isSelected ? '1px solid var(--border-accent)' : '1px solid transparent',
                        }}
                        onClick={() => {
                          if (catObj?.id) {
                            setSelectedCatFilter(isSelected ? null : catObj.id);
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {cat.name} {isSelected && '✓'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-light)' }}>
                            {formatARS(cat.total)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="progress-bar-bg">
                          <div className="progress-bar-fill" style={{ width: `${pct}%`, background: cat.color || 'var(--accent)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Detalle ítem por ítem del mes */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px' }}>
                <p className="section-title" style={{ margin: 0 }}>
                  Detalle de Gastos ({filteredMonthExpenses.length})
                </p>
                {selectedCatFilter && (
                  <span style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 600 }}>
                    Filtrado por categoría
                  </span>
                )}
              </div>

              {/* Buscador dentro del mes */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔎 Buscar por detalle, local o categoría..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {filteredMonthExpenses.length === 0 ? (
                <div className="card">
                  <div className="empty-state" style={{ padding: '24px 0' }}>
                    <div className="empty-state-icon">🔍</div>
                    <p className="empty-state-text">No se encontraron gastos con ese filtro en {monthName}</p>
                  </div>
                </div>
              ) : (
                <div>
                  {filteredMonthExpenses.map((exp) => (
                    <div key={exp.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '14px 16px', marginBottom: 8, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      {/* Fila superior: Ícono + Comercio + Detalle + Subtítulo */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div
                          className="list-item-icon"
                          style={{ background: (exp.category_color || '#6366f1') + '22', flexShrink: 0, marginTop: 2 }}
                        >
                          {exp.category_icon || '📦'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.35', wordBreak: 'break-word' }}>
                            {exp.store ? <span style={{ fontWeight: 800 }}>{exp.store}</span> : null}
                            {exp.store && exp.detail ? ' · ' : null}
                            {exp.detail ? <span style={{ fontWeight: 400 }}>{exp.detail}</span> : null}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {exp.date} · {exp.category_name} ({exp.subcategory_name})
                          </div>
                        </div>
                      </div>

                      {/* Fila inferior: Monto a la izquierda y Botones ABM a la derecha */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="amount-negative" style={{ fontSize: 16, fontWeight: 800 }}>
                          {formatARS(exp.amount)}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 8, background: 'var(--bg-elevated)' }}
                            onClick={() => handleOpenEdit(exp)}
                            title="Editar gasto"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 8, background: 'var(--bg-elevated)' }}
                            onClick={() => handleReplicateExpense(exp)}
                            title="Copiar gasto a hoy"
                          >
                            📋 Copiar
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 8, background: 'var(--bg-elevated)', color: '#ef4444' }}
                            onClick={() => setDeletingId(exp.id!)}
                            title="Eliminar gasto"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <>
          <p className="section-title">Evolución de los Últimos 6 Meses (tocá un mes para ver su detalle)</p>
          {loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <p className="empty-state-text">Calculando tendencia histórica...</p>
            </div>
          ) : (
            <div className="card">
              {historyMonths.map((m, idx) => (
                <div
                  key={idx}
                  className="list-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedMonthOffset(m.offset);
                    setActiveTab('month');
                  }}
                >
                  <div className="list-item-body">
                    <div className="list-item-title" style={{ textTransform: 'capitalize' }}>
                      {m.name} ➔ <span style={{ fontSize: 12, color: 'var(--accent-light)' }}>Ver detalle</span>
                    </div>
                    <div className="list-item-subtitle">
                      Ingresos: <span style={{ color: 'var(--positive)' }}>{formatARS(m.totalIncome)}</span> | Gastos: <span style={{ color: 'var(--negative)' }}>{formatARS(m.totalExpenses)}</span>
                    </div>
                  </div>
                  <div className="list-item-right">
                    <div className={`list-item-amount ${m.disponible >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                      {formatARS(m.disponible)}
                    </div>
                    <div className="list-item-date">Balance final</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal para Editar o Duplicar Gasto */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={editingExpense ? '✏️ Editar Gasto' : '📋 Duplicar Gasto para Hoy'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Comercio / Local</label>
            <input
              className="form-input"
              value={editStore}
              onChange={e => setEditStore(e.target.value)}
              placeholder="Ej: YPF, Coto, Shell..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Detalle / Artículo</label>
            <input
              className="form-input"
              value={editDetail}
              onChange={e => setEditDetail(e.target.value)}
              placeholder="Ej: Nafta super, Verduras..."
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Monto ($)</label>
          <input className="form-input" type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} inputMode="decimal" />
        </div>

        <div className="form-group">
          <label className="form-label">Fecha del gasto</label>
          <input className="form-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Categoría (Seleccionada al comienzo)</label>
          <div className="chips-row">
            {[...categories]
              .sort((a, b) => (a.id === editCatId ? -1 : b.id === editCatId ? 1 : 0))
              .map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${editCatId === c.id ? ' active' : ''}`}
                  onClick={() => {
                    setEditCatId(c.id);
                    setEditSubId(c.subcategories[0]?.id || null);
                  }}
                >
                  {c.icon} {c.name}
                </button>
              ))}
          </div>
        </div>

        {activeEditCat?.subcategories?.length > 0 && (
          <div className="form-group">
            <label className="form-label">Subcategoría (Seleccionada al comienzo)</label>
            <div className="chips-row">
              {[...activeEditCat.subcategories]
                .sort((a: any, b: any) => (a.id === editSubId ? -1 : b.id === editSubId ? 1 : 0))
                .map((sub: any) => (
                  <button
                    key={sub.id}
                    type="button"
                    className={`chip${editSubId === sub.id ? ' active' : ''}`}
                    onClick={() => setEditSubId(sub.id)}
                  >
                    {sub.name}
                  </button>
                ))}
            </div>
          </div>
        )}

        <button className="btn btn-success" onClick={handleSaveEdit} disabled={!editAmount || parseFloat(editAmount) <= 0}>
          💾 {editingExpense ? 'Guardar Cambios' : 'Guardar Nuevo Gasto'}
        </button>
      </Modal>

      {/* Modal de Confirmación de Eliminación de Gasto */}
      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="🗑️ Eliminar Gasto">
        <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 20 }}>
          ¿Estás seguro de que querés eliminar este gasto? Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-danger" onClick={confirmDeleteExpense}>
            🗑️ Sí, eliminar
          </button>
          <button className="btn btn-ghost" onClick={() => setDeletingId(null)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </>
  );
}
