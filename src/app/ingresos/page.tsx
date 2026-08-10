'use client';

import { useState, useEffect } from 'react';
import { db, formatARS } from '@/lib/db';
import type { Income, SalaryConfig } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function IngresosPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [salaryConfig, setSalaryConfig] = useState<SalaryConfig | null>(null);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showSalaryConfig, setShowSalaryConfig] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'salary' | 'extra'>('extra');
  const [description, setDescription] = useState('');

  const [salaryAmount, setSalaryAmount] = useState('');
  const [paymentDay, setPaymentDay] = useState('31');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const items = await db.income.orderBy('date').reverse().limit(20).toArray();
    setIncomes(items);
    const sal = await db.salary_config.orderBy('id').last();
    setSalaryConfig(sal || null);
    if (sal) setSalaryAmount(sal.monthly_amount.toString());
  };

  const handleAddIncome = async () => {
    if (!amount) return;
    await db.income.add({
      date, amount: parseFloat(amount),
      type, description,
      created_at: new Date().toISOString(),
    });
    setAmount(''); setDescription(''); setDate(new Date().toISOString().split('T')[0]);
    setShowAddIncome(false);
    loadData();
  };

  const handleSaveSalary = async () => {
    if (!salaryAmount) return;
    await db.salary_config.clear();
    await db.salary_config.add({
      monthly_amount: parseFloat(salaryAmount),
      payment_day: parseInt(paymentDay),
      is_last_business_day: parseInt(paymentDay) >= 28 ? 1 : 0,
      updated_at: new Date().toISOString(),
    });
    setShowSalaryConfig(false);
    loadData();
  };

  const totalThisMonth = incomes
    .filter(i => i.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">💼 Ingresos</h1>
          <p className="page-subtitle">Este mes: {formatARS(totalThisMonth)}</p>
        </div>
        <button id="add-income-btn" className="btn btn-primary btn-sm" onClick={() => setShowAddIncome(true)}>+ Ingreso</button>
      </div>

      {/* Sueldo configurado */}
      <div className="card card-accent" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>Sueldo mensual</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--positive)', marginTop: 2 }}>
              {salaryConfig ? formatARS(salaryConfig.monthly_amount) : '— No configurado'}
            </p>
          </div>
          <button id="config-salary-btn" className="btn btn-ghost btn-sm" onClick={() => setShowSalaryConfig(true)}>
            ⚙️ Configurar
          </button>
        </div>
      </div>

      {incomes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <p className="empty-state-text">No hay ingresos registrados</p>
        </div>
      ) : (
        <>
          <p className="section-title">Historial de ingresos</p>
          <div className="card">
            {incomes.map(inc => (
              <div key={inc.id} className="list-item">
                <div className="list-item-icon" style={{ background: 'var(--positive-dim)' }}>
                  {inc.type === 'salary' ? '💼' : '💵'}
                </div>
                <div className="list-item-body">
                  <div className="list-item-title">{inc.description || (inc.type === 'salary' ? 'Sueldo' : 'Ingreso extra')}</div>
                  <div className="list-item-subtitle">{inc.date}</div>
                </div>
                <div className="list-item-right">
                  <div className="list-item-amount amount-positive">{formatARS(inc.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal: nuevo ingreso */}
      <Modal isOpen={showAddIncome} onClose={() => setShowAddIncome(false)} title="Registrar Ingreso">
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <div className="chips-row">
            <button className={`chip${type === 'extra' ? ' active' : ''}`} onClick={() => setType('extra')}>💵 Extra</button>
            <button className={`chip${type === 'salary' ? ' active' : ''}`} onClick={() => setType('salary')}>💼 Sueldo</button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Monto ($)</label>
          <input id="income-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input id="income-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Descripción (opcional)</label>
          <input id="income-desc" className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Freelance, Bono, Venta..." />
        </div>
        <button id="save-income-btn" className="btn btn-success" onClick={handleAddIncome} disabled={!amount}>💾 Guardar</button>
      </Modal>

      {/* Modal: configurar sueldo */}
      <Modal isOpen={showSalaryConfig} onClose={() => setShowSalaryConfig(false)} title="⚙️ Configurar Sueldo">
        <div className="form-group">
          <label className="form-label">Monto mensual neto ($)</label>
          <input id="salary-amount" className="form-input" type="number" value={salaryAmount} onChange={e => setSalaryAmount(e.target.value)} placeholder="0" inputMode="decimal" />
        </div>
        <div className="form-group">
          <label className="form-label">Día de cobro (31 = último día hábil)</label>
          <input id="salary-day" className="form-input" type="number" min="1" max="31" value={paymentDay} onChange={e => setPaymentDay(e.target.value)} />
        </div>
        <button id="save-salary-btn" className="btn btn-primary" onClick={handleSaveSalary} disabled={!salaryAmount}>💾 Guardar configuración</button>
      </Modal>
    </>
  );
}
