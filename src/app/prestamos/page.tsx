'use client';

import { useState, useEffect } from 'react';
import { db, formatARS, getCategoriesWithSubs } from '@/lib/db';
import type { Loan } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function PrestamosPage() {
  const [loans, setLoans] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showPayment, setShowPayment] = useState<number | null>(null);

  const [personName, setPersonName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);
    const rawLoans = await db.loans.orderBy('date').reverse().toArray();
    const enriched = await Promise.all(rawLoans.map(async l => {
      const payments = await db.loan_payments.where('loan_id').equals(l.id!).toArray();
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, l.amount - totalPaid);
      return { ...l, totalPaid, remaining, payments };
    }));
    setLoans(enriched);
  };

  const handleAdd = async () => {
    if (!personName || !amount) return;
    const cat = categories[0];
    const expId = await db.expenses.add({
      date, amount: parseFloat(amount),
      detail: `[Préstamo] Prestado a ${personName}`,
      category_id: cat?.id || 1,
      subcategory_id: cat?.subcategories[0]?.id || 1,
      status: 'active', module_origin: 'loan',
    });
    await db.loans.add({
      person_name: personName, date,
      amount: parseFloat(amount), notes,
      status: 'active', expense_id: expId as number,
      created_at: new Date().toISOString(),
    });
    setPersonName(''); setAmount(''); setNotes('');
    setShowAdd(false);
    loadData();
  };

  const handlePayment = async (loanId: number, loan: any) => {
    if (!payAmount) return;
    await db.loan_payments.add({
      loan_id: loanId, date: payDate,
      amount: parseFloat(payAmount), notes: '',
    });
    await db.income.add({
      date: payDate, amount: parseFloat(payAmount),
      type: 'extra', description: `[Devolución] ${loan.person_name}`,
    });
    const totalPaid = loan.totalPaid + parseFloat(payAmount);
    const newStatus = totalPaid >= loan.amount ? 'settled' : 'partially_paid';
    await db.loans.update(loanId, { status: newStatus });
    setPayAmount(''); setShowPayment(null);
    loadData();
  };

  const handleWriteOff = async (loan: any) => {
    await db.loans.update(loan.id, { status: 'written_off' });
    if (loan.expense_id) {
      await db.expenses.update(loan.expense_id, {
        amount: loan.remaining,
        notes: `[Dado por perdido. Neto perdido: $${loan.remaining}]`,
      });
    }
    loadData();
  };

  const totalOwed = loans
    .filter(l => l.status !== 'written_off')
    .reduce((s, l) => s + l.remaining, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">💸 Préstamos</h1>
          <p className="page-subtitle">Total adeudado: {formatARS(totalOwed)}</p>
        </div>
        <button id="add-loan-btn" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Nuevo</button>
      </div>

      {loans.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💸</div>
          <p className="empty-state-text">No hay préstamos registrados</p>
        </div>
      ) : (
        loans.map(loan => (
          <div key={loan.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{loan.person_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{loan.date}</div>
              </div>
              <span className={`badge badge-${loan.status === 'settled' ? 'settled' : loan.status === 'written_off' ? 'written-off' : 'active'}`}>
                {loan.status === 'active' ? 'Activo' : loan.status === 'partially_paid' ? 'Parcial' : loan.status === 'settled' ? 'Saldado' : 'Perdido'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div className="card card-sm" style={{ textAlign: 'center', padding: '10px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Original</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--negative)' }}>{formatARS(loan.amount)}</div>
              </div>
              <div className="card card-sm" style={{ textAlign: 'center', padding: '10px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pendiente</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: loan.remaining > 0 ? 'var(--warning)' : 'var(--positive)' }}>{formatARS(loan.remaining)}</div>
              </div>
            </div>

            {loan.status === 'active' || loan.status === 'partially_paid' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => { setShowPayment(loan.id); setPayAmount(''); }}>💰 Cobrar</button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleWriteOff(loan)}>❌ Dar por perdido</button>
              </div>
            ) : null}
          </div>
        ))
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nuevo Préstamo">
        <div className="form-group">
          <label className="form-label">Nombre de la persona</label>
          <input id="loan-person" className="form-input" value={personName} onChange={e => setPersonName(e.target.value)} placeholder="Ej: Juan García" />
        </div>
        <div className="form-group">
          <label className="form-label">Monto prestado ($)</label>
          <input id="loan-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input id="loan-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Notas</label>
          <input id="loan-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Motivo del préstamo..." />
        </div>
        <button id="save-loan-btn" className="btn btn-primary" onClick={handleAdd} disabled={!personName || !amount}>💾 Registrar Préstamo</button>
      </Modal>

      <Modal isOpen={showPayment !== null} onClose={() => setShowPayment(null)} title="Registrar Pago">
        <div className="form-group">
          <label className="form-label">Monto recibido ($)</label>
          <input id="pay-amount" className="form-input" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input id="pay-date" className="form-input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
        </div>
        <button id="save-payment-btn" className="btn btn-success"
          onClick={() => { const loan = loans.find(l => l.id === showPayment); if (loan) handlePayment(showPayment!, loan); }}
          disabled={!payAmount}>
          💰 Registrar cobro
        </button>
      </Modal>
    </>
  );
}
