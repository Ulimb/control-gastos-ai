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
  const [showAdd, setShowAdd] = useState(false);

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

  const handleAdd = async () => {
    if (!name || !amount || !selectedCatId || !selectedSubId) return;
    await db.fixed_expenses.add({
      name, estimated_amount: parseFloat(amount),
      category_id: selectedCatId, subcategory_id: selectedSubId,
      frequency: 'monthly', due_day: parseInt(dueDay), status: 'active',
      created_at: new Date().toISOString(),
    });
    setName(''); setAmount(''); setDueDay('10');
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
          <p className="page-subtitle">Pendiente: {formatARS(pendingTotal)}</p>
        </div>
        <button id="add-fixed-btn" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Agregar</button>
      </div>

      <button id="generate-payments-btn" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={generatePayments}>
        🔄 Generar pagos de este mes
      </button>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📌</div>
          <p className="empty-state-text">No tenés gastos fijos cargados</p>
        </div>
      ) : (
        <div className="card">
          {items.map(item => {
            const status = item.payment?.status || 'sin pago';
            return (
              <div key={item.id} className="list-item">
                <div className="list-item-body">
                  <div className="list-item-title">{item.name}</div>
                  <div className="list-item-subtitle">
                    {item.category_name} · Día {item.due_day}
                  </div>
                  {item.payment && (
                    <span className={`badge badge-${status}`} style={{ marginTop: 4 }}>
                      {status === 'pending' ? 'Pendiente' : status === 'paid' ? 'Pagado' : 'Salteado'}
                    </span>
                  )}
                </div>
                <div className="list-item-right">
                  <div className="list-item-amount amount-negative">{formatARS(item.estimated_amount)}</div>
                  {item.payment?.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-success btn-sm" onClick={() => markPaid(item.payment!.id!, item)}>✓</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => markSkipped(item.payment!.id!)}>✗</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nuevo Gasto Fijo">
        <div className="form-group">
          <label className="form-label">Nombre</label>
          <input id="fixed-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Netflix, Alquiler, Gym" />
        </div>
        <div className="form-group">
          <label className="form-label">Monto mensual ($)</label>
          <input id="fixed-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label className="form-label">Día de vencimiento</label>
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
        <button id="save-fixed-btn" className="btn btn-primary" onClick={handleAdd} disabled={!name || !amount}>
          💾 Guardar
        </button>
      </Modal>
    </>
  );
}
