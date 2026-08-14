'use client';

import { useState, useEffect } from 'react';
import { db, getCategoriesWithSubs, formatARS } from '@/lib/db';
import type { FixedExpense, FixedExpensePayment } from '@/lib/db';
import { Modal } from '@/components/Modal';

type FixedExpenseWithPayment = FixedExpense & {
  payment?: FixedExpensePayment;
  category_name?: string;
};

export default function GastosFijosPage() {
  const [items, setItems] = useState<FixedExpenseWithPayment[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const [editingItem, setEditingItem] = useState<FixedExpense | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);

  const yearMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);
    if (!selectedCatId && cats.length > 0) {
      setSelectedCatId(cats[0].id || null);
      setSelectedSubId(cats[0].subcategories[0]?.id || null);
    }

    const fixed = await db.fixed_expenses.where('status').equals('active').toArray();
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

    const enriched = await Promise.all(fixed.map(async f => {
      const payment = await db.fixed_expense_payments
        .where('fixed_expense_id').equals(f.id!)
        .and(p => p.due_date.startsWith(yearMonth))
        .first();
      return { ...f, payment, category_name: catMap[f.category_id]?.name };
    }));

    setItems(enriched);
    findSmartSuggestions(fixed);
  };

  const findSmartSuggestions = async (existingFixed: FixedExpense[]) => {
    const allExpenses = await db.expenses.toArray();
    const existingNames = new Set(existingFixed.map(f => f.name.toLowerCase()));

    const countMap: Record<string, { name: string; amount: number; catId: number; subId: number; count: number }> = {};

    for (const exp of allExpenses) {
      const cleanName = exp.detail.replace(/\[.*?\]/g, '').trim();
      if (!cleanName || cleanName.length < 3) continue;

      const key = cleanName.toLowerCase();
      if (existingNames.has(key)) continue;

      if (!countMap[key]) {
        countMap[key] = {
          name: cleanName,
          amount: exp.amount,
          catId: exp.category_id,
          subId: exp.subcategory_id,
          count: 1,
        };
      } else {
        countMap[key].count += 1;
      }
    }

    const suggestedList = Object.values(countMap)
      .filter(s => s.count >= 2)
      .slice(0, 4);

    setSuggestions(suggestedList);
  };

  const handleAddSuggested = async (s: any) => {
    await db.fixed_expenses.add({
      name: s.name,
      estimated_amount: s.amount,
      category_id: s.catId,
      subcategory_id: s.subId,
      frequency: 'monthly',
      due_day: 10,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    await generatePayments();
    loadData();
  };

  const generatePayments = async () => {
    const fixed = await db.fixed_expenses.where('status').equals('active').toArray();
    for (const f of fixed) {
      const existing = await db.fixed_expense_payments
        .where('fixed_expense_id').equals(f.id!)
        .and(p => p.due_date.startsWith(yearMonth))
        .first();
      if (!existing) {
        const [y, m] = yearMonth.split('-').map(Number);
        const d = Math.min(f.due_day, new Date(y, m, 0).getDate());
        await db.fixed_expense_payments.add({
          fixed_expense_id: f.id!,
          due_date: `${yearMonth}-${String(d).padStart(2, '0')}`,
          status: 'pending',
        });
      }
    }
    loadData();
  };

  const markPaid = async (paymentId: number, fixedExpense: FixedExpense) => {
    const expId = await db.expenses.add({
      date: new Date().toISOString().split('T')[0],
      amount: fixedExpense.estimated_amount,
      detail: `[Gasto Fijo] ${fixedExpense.name}`,
      category_id: fixedExpense.category_id,
      subcategory_id: fixedExpense.subcategory_id,
      status: 'active',
      module_origin: 'fixed',
    });
    await db.fixed_expense_payments.update(paymentId, {
      status: 'paid',
      paid_date: new Date().toISOString().split('T')[0],
      amount_paid: fixedExpense.estimated_amount,
      expense_id: expId as number,
    });
    loadData();
  };

  const markSkipped = async (paymentId: number) => {
    await db.fixed_expense_payments.update(paymentId, { status: 'skipped' });
    loadData();
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName(''); setAmount(''); setDueDay('10');
    setShowAdd(true);
  };

  const handleOpenEdit = (item: FixedExpense) => {
    setEditingItem(item);
    setName(item.name);
    setAmount(item.estimated_amount.toString());
    setDueDay(item.due_day.toString());
    setSelectedCatId(item.category_id);
    setSelectedSubId(item.subcategory_id);
    setShowAdd(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Seguro que querés eliminar este gasto fijo?')) return;
    await db.fixed_expenses.delete(id);
    await db.fixed_expense_payments.where('fixed_expense_id').equals(id).delete();
    loadData();
  };

  const handleSave = async () => {
    if (!name || !amount || !selectedCatId || !selectedSubId) return;

    const fixedData = {
      name,
      estimated_amount: parseFloat(amount),
      category_id: selectedCatId,
      subcategory_id: selectedSubId,
      frequency: 'monthly' as const,
      due_day: parseInt(dueDay) || 10,
      status: 'active' as const,
      created_at: editingItem?.created_at || new Date().toISOString(),
    };

    if (editingItem?.id) {
      await db.fixed_expenses.update(editingItem.id, fixedData);
    } else {
      await db.fixed_expenses.add(fixedData);
    }

    setShowAdd(false);
    await generatePayments();
  };

  const pendingTotal = items
    .filter(i => i.payment?.status === 'pending')
    .reduce((s, i) => s + i.estimated_amount, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📌 Gastos Fijos</h1>
          <p className="page-subtitle">Pendiente este mes: {formatARS(pendingTotal)}</p>
        </div>
        <button id="add-fixed-btn" className="btn btn-primary btn-sm" onClick={handleOpenAdd}>+ Agregar</button>
      </div>

      <button id="generate-payments-btn" className="btn btn-ghost" style={{ marginBottom: 16 }} onClick={generatePayments}>
        🔄 Generar/Actualizar cuotas de este mes
      </button>

      {/* Sugerencias basadas en el historial */}
      {suggestions.length > 0 && (
        <div className="card card-accent" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light)', marginBottom: 8 }}>
            💡 Sugerencias basadas en tu historial
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{formatARS(s.amount)}</span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => handleAddSuggested(s)}>+ Convertir en Fijo</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📌</div>
          <p className="empty-state-text">No tenés gastos fijos cargados</p>
        </div>
      ) : (
        <div className="card">
          {items.map(item => {
            const status = item.payment?.status || 'pending';
            return (
              <div key={item.id} className="list-item">
                <div className="list-item-body">
                  <div className="list-item-title">{item.name}</div>
                  <div className="list-item-subtitle">
                    {item.category_name} · Vence día {item.due_day}
                  </div>
                  {item.payment && (
                    <span className={`badge badge-${status}`} style={{ marginTop: 4 }}>
                      {status === 'pending' ? 'Pendiente' : status === 'paid' ? 'Pagado' : 'Salteado'}
                    </span>
                  )}
                </div>
                <div className="list-item-right">
                  <div className="list-item-amount amount-negative">{formatARS(item.estimated_amount)}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {item.payment?.status === 'pending' && (
                      <>
                        <button className="btn btn-success btn-sm" title="Marcar como pagado" onClick={() => markPaid(item.payment!.id!, item)}>✓ Pagar</button>
                        <button className="btn btn-ghost btn-sm" title="Saltear este mes" onClick={() => markSkipped(item.payment!.id!)}>✗</button>
                      </>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => handleOpenEdit(item)} title="Editar gasto fijo">✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--negative)' }} onClick={() => item.id && handleDelete(item.id)} title="Eliminar gasto fijo">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={editingItem ? "✏️ Editar Gasto Fijo" : "📌 Nuevo Gasto Fijo"}>
        <div className="form-group">
          <label className="form-label">Nombre del servicio/gasto</label>
          <input id="fixed-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Netflix, Alquiler, Gimnasio" />
        </div>
        <div className="form-group">
          <label className="form-label">Monto mensual estimado ($)</label>
          <input id="fixed-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label className="form-label">Día del mes en que vence (1-31)</label>
          <input id="fixed-day" className="form-input" type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Categoría</label>
          <div className="chips-row">
            {categories.map(c => (
              <button key={c.id} className={`chip${selectedCatId === c.id ? ' active' : ''}`}
                onClick={() => { setSelectedCatId(c.id); setSelectedSubId(c.subcategories[0]?.id || null); }}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>
        <button id="save-fixed-btn" className="btn btn-primary" onClick={handleSave} disabled={!name || !amount}>
          💾 {editingItem ? "Guardar Cambios" : "Guardar Gasto Fijo"}
        </button>
      </Modal>
    </>
  );
}
