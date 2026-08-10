'use client';

import { useState, useEffect } from 'react';
import { db, formatARS } from '@/lib/db';
import type { Reintegro } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function ReintegrosPage() {
  const [reintegros, setReintegros] = useState<Reintegro[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'linked' | 'income'>('income');
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const items = await db.reintegros.orderBy('date').reverse().toArray();
    setReintegros(items);

    const recentExps = await db.expenses
      .where('status').equals('active')
      .and(e => e.amount > 0)
      .reverse()
      .limit(30)
      .toArray();
    setExpenses(recentExps);
  };

  const handleAdd = async () => {
    if (!amount || !description) return;
    const numAmount = parseFloat(amount);

    if (type === 'linked' && selectedExpenseId) {
      const orig = await db.expenses.get(selectedExpenseId);
      if (orig) {
        // Reducir el gasto creando una línea con monto negativo
        await db.expenses.add({
          date,
          amount: -Math.abs(numAmount),
          detail: `[Reintegro] ${description}`,
          notes: `Reintegro vinculado a: ${orig.detail}`,
          category_id: orig.category_id,
          subcategory_id: orig.subcategory_id,
          status: 'active',
          module_origin: 'reintegro',
          module_reference_id: orig.id,
        });
      }
    } else {
      // Registrar como ingreso libre
      await db.income.add({
        date,
        amount: numAmount,
        type: 'extra',
        description: `[Reintegro] ${description}`,
        created_at: new Date().toISOString(),
      });
    }

    await db.reintegros.add({
      date,
      amount: numAmount,
      description,
      type,
      linked_expense_id: selectedExpenseId || undefined,
      created_at: new Date().toISOString(),
    });

    setAmount(''); setDescription(''); setSelectedExpenseId(null);
    setShowAdd(false);
    loadData();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔄 Reintegros</h1>
          <p className="page-subtitle">{reintegros.length} devoluciones registradas</p>
        </div>
        <button id="add-reintegro-btn" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Nuevo</button>
      </div>

      {reintegros.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔄</div>
          <p className="empty-state-text">No hay reintegros registrados</p>
        </div>
      ) : (
        <div className="card">
          {reintegros.map(r => (
            <div key={r.id} className="list-item">
              <div className="list-item-icon" style={{ background: 'var(--positive-dim)' }}>🔄</div>
              <div className="list-item-body">
                <div className="list-item-title">{r.description}</div>
                <div className="list-item-subtitle">
                  {r.date} · {r.type === 'linked' ? 'Vinculado a gasto' : 'Ingreso directo'}
                </div>
              </div>
              <div className="list-item-right">
                <div className="list-item-amount amount-positive">+{formatARS(r.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nuevo Reintegro">
        <div className="form-group">
          <label className="form-label">Tipo de Reintegro</label>
          <div className="chips-row">
            <button className={`chip${type === 'income' ? ' active' : ''}`} onClick={() => setType('income')}>💵 Ingreso libre</button>
            <button className={`chip${type === 'linked' ? ' active' : ''}`} onClick={() => setType('linked')}>🔗 Vinculado a gasto</button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Descripción</label>
          <input id="reintegro-desc" className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Reembolso MercadoPago / Prepaga" />
        </div>

        <div className="form-group">
          <label className="form-label">Monto a reintegrar ($)</label>
          <input id="reintegro-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" />
        </div>

        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input id="reintegro-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {type === 'linked' && (
          <div className="form-group">
            <label className="form-label">Seleccionar gasto a reducir</label>
            <select
              id="linked-expense-select"
              className="form-select"
              value={selectedExpenseId || ''}
              onChange={e => setSelectedExpenseId(Number(e.target.value) || null)}
            >
              <option value="">-- Seleccionar gasto --</option>
              {expenses.map(e => (
                <option key={e.id} value={e.id}>
                  {e.date} - {e.detail} ({formatARS(e.amount)})
                </option>
              ))}
            </select>
          </div>
        )}

        <button id="save-reintegro-btn" className="btn btn-success" onClick={handleAdd} disabled={!amount || !description}>💾 Guardar Reintegro</button>
      </Modal>
    </>
  );
}
