'use client';

import { useState, useEffect } from 'react';
import { db, formatARS, syncMovementToGoogleSheets } from '@/lib/db';
import type { Income, SalaryConfig } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function IngresosPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [salaryConfig, setSalaryConfig] = useState<SalaryConfig | null>(null);
  const [showAddIncome, setShowAddIncome] = useState(false);

  // Formulario Nuevo/Editar Ingreso
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'salary' | 'extra'>('extra');
  const [description, setDescription] = useState('');

  // Configuración de Sueldo
  const [salaryAmount, setSalaryAmount] = useState('');
  const [paymentDay, setPaymentDay] = useState('31');
  const [salaryConfirmed, setSalaryConfirmed] = useState(false);
  const [inlineConfigOpen, setInlineConfigOpen] = useState(false);

  // Fecha para confirmar sueldo
  const [confirmSalaryDate, setConfirmSalaryDate] = useState(() => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().split('T')[0];
  });
  const [showConfirmSalaryModal, setShowConfirmSalaryModal] = useState(false);

  const currentYearMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const items = await db.income.orderBy('date').reverse().toArray();
    setIncomes(items);

    const sal = await db.salary_config.orderBy('id').last();
    setSalaryConfig(sal || null);
    if (sal) setSalaryAmount(sal.monthly_amount.toString());

    const registeredSalary = items.find(i => i.type === 'salary' && i.date.startsWith(currentYearMonth));
    setSalaryConfirmed(!!registeredSalary);
  };

  const handleConfirmMonthlySalary = async () => {
    if (!salaryConfig) return;
    const newInc = {
      date: confirmSalaryDate,
      amount: salaryConfig.monthly_amount,
      type: 'salary' as const,
      description: `Sueldo mensual`,
      created_at: new Date().toISOString(),
    };
    await db.income.add(newInc);

    syncMovementToGoogleSheets({
      fecha: confirmSalaryDate,
      tipo: 'Ingreso',
      categoria: 'Ingresos',
      subcategoria: 'Sueldo',
      detalle: 'Sueldo mensual',
      monto: salaryConfig.monthly_amount,
    });

    setShowConfirmSalaryModal(false);
    loadData();
  };

  const handleOpenAdd = () => {
    setEditingIncome(null);
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setType('extra');
    setDescription('');
    setShowAddIncome(true);
  };

  const handleOpenEdit = (inc: Income) => {
    setEditingIncome(inc);
    setDate(inc.date);
    setAmount(inc.amount.toString());
    setType(inc.type);
    setDescription(inc.description || '');
    setShowAddIncome(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Seguro que querés eliminar este ingreso?')) return;
    await db.income.delete(id);
    loadData();
  };

  const handleSaveIncome = async () => {
    if (!amount) return;
    const parsedAmt = parseFloat(amount);
    const descStr = description || (type === 'salary' ? 'Sueldo' : 'Ingreso extra');

    const incomeData = {
      date,
      amount: parsedAmt,
      type,
      description: descStr,
      created_at: editingIncome ? editingIncome.created_at : new Date().toISOString(),
    };

    if (editingIncome?.id) {
      await db.income.update(editingIncome.id, incomeData);
    } else {
      await db.income.add(incomeData);
      syncMovementToGoogleSheets({
        fecha: date,
        tipo: 'Ingreso',
        categoria: 'Ingresos',
        subcategoria: type === 'salary' ? 'Sueldo' : 'Extra',
        detalle: descStr,
        monto: parsedAmt,
      });
    }

    setShowAddIncome(false);
    loadData();
  };

  const handleSaveSalaryConfig = async () => {
    if (!salaryAmount) return;
    await db.salary_config.clear();
    await db.salary_config.add({
      monthly_amount: parseFloat(salaryAmount),
      payment_day: parseInt(paymentDay) || 31,
      is_last_business_day: parseInt(paymentDay) >= 28 ? 1 : 0,
      updated_at: new Date().toISOString(),
    });
    setInlineConfigOpen(false);
    loadData();
  };

  const totalThisMonth = incomes
    .filter(i => i.date.startsWith(currentYearMonth))
    .reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">💼 Ingresos</h1>
          <p className="page-subtitle">Ingresos del mes: {formatARS(totalThisMonth)}</p>
        </div>
        <button id="add-income-btn" className="btn btn-primary btn-sm" onClick={handleOpenAdd}>+ Ingreso</button>
      </div>

      {/* Tarjeta de Sueldo Mensual */}
      <div className="card card-accent" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Sueldo Mensual Configurado</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--positive)', marginTop: 2 }}>
              {salaryConfig ? formatARS(salaryConfig.monthly_amount) : '— No configurado'}
            </p>
          </div>
          <button
            id="toggle-salary-config-btn"
            className="btn btn-ghost btn-sm"
            onClick={() => setInlineConfigOpen(!inlineConfigOpen)}
          >
            ⚙️ {inlineConfigOpen ? 'Cerrar' : 'Configurar'}
          </button>
        </div>

        {/* Formulario Inline de Configuración de Sueldo */}
        {inlineConfigOpen && (
          <div style={{ background: 'var(--bg-input)', padding: 14, borderRadius: 'var(--radius-sm)', marginBottom: 12, border: '1px solid var(--border)' }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Monto neto del sueldo ($)</label>
              <input
                id="inline-salary-amount"
                className="form-input"
                type="number"
                value={salaryAmount}
                onChange={e => setSalaryAmount(e.target.value)}
                placeholder="Ej: 650000"
                inputMode="decimal"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Día habitual de cobro (31 = último día hábil)</label>
              <input
                id="inline-salary-day"
                className="form-input"
                type="number"
                min="1"
                max="31"
                value={paymentDay}
                onChange={e => setPaymentDay(e.target.value)}
              />
            </div>
            <button
              id="save-inline-salary-btn"
              className="btn btn-primary"
              onClick={handleSaveSalaryConfig}
              disabled={!salaryAmount}
            >
              💾 Guardar Configuración de Sueldo
            </button>
          </div>
        )}

        {salaryConfig && (
          salaryConfirmed ? (
            <div style={{ background: 'var(--positive-dim)', color: 'var(--positive)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
              ✓ Sueldo de este mes ya cobrado y registrado ({formatARS(salaryConfig.monthly_amount)})
            </div>
          ) : (
            <button
              id="confirm-salary-btn"
              className="btn btn-success"
              onClick={() => setShowConfirmSalaryModal(true)}
            >
              ✅ Registrar cobro de sueldo ({formatARS(salaryConfig.monthly_amount)})
            </button>
          )
        )}
      </div>

      {incomes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <p className="empty-state-text">No hay ingresos registrados aún</p>
        </div>
      ) : (
        <>
          <p className="section-title">Historial de Ingresos</p>
          <div className="card">
            {incomes.map(inc => (
              <div key={inc.id} className="list-item">
                <div className="list-item-icon" style={{ background: 'var(--positive-dim)' }}>
                  {inc.type === 'salary' ? '💼' : '💵'}
                </div>
                <div className="list-item-body">
                  <div className="list-item-title">{inc.description || (inc.type === 'salary' ? 'Sueldo' : 'Ingreso extra')}</div>
                  <div className="list-item-subtitle">{inc.date} · {inc.type === 'salary' ? 'Sueldo' : 'Extra'}</div>
                </div>
                <div className="list-item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="list-item-amount amount-positive">+{formatARS(inc.amount)}</div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={() => handleOpenEdit(inc)}
                    title="Editar ingreso"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 8px', fontSize: 12, color: 'var(--negative)' }}
                    onClick={() => inc.id && handleDelete(inc.id)}
                    title="Eliminar ingreso"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal: Registrar / Editar Ingreso */}
      <Modal isOpen={showAddIncome} onClose={() => setShowAddIncome(false)} title={editingIncome ? "✏️ Editar Ingreso" : "💵 Registrar Nuevo Ingreso"}>
        <div className="form-group">
          <label className="form-label">Tipo de ingreso</label>
          <div className="chips-row">
            <button type="button" className={`chip${type === 'extra' ? ' active' : ''}`} onClick={() => setType('extra')}>💵 Extra / Freelance</button>
            <button type="button" className={`chip${type === 'salary' ? ' active' : ''}`} onClick={() => setType('salary')}>💼 Sueldo</button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Monto ($)</label>
          <input id="income-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" inputMode="decimal" />
        </div>

        <div className="form-group">
          <label className="form-label">Fecha exacta de cobro</label>
          <input id="income-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Descripción / Origen</label>
          <input id="income-desc" className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Pago cliente, Bono, Sueldo..." />
        </div>

        <button id="save-income-btn" className="btn btn-success" onClick={handleSaveIncome} disabled={!amount}>
          💾 {editingIncome ? "Guardar Cambios" : "Confirmar y Guardar Ingreso"}
        </button>
      </Modal>

      {/* Modal: Confirmar cobro de sueldo con fecha editable */}
      <Modal isOpen={showConfirmSalaryModal} onClose={() => setShowConfirmSalaryModal(false)} title="📅 Seleccionar fecha de cobro del sueldo">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Ingresá la fecha real en la que cobraste este sueldo ({salaryConfig ? formatARS(salaryConfig.monthly_amount) : ''}):
        </p>

        <div className="form-group">
          <label className="form-label">Fecha de cobro</label>
          <input
            id="confirm-salary-date"
            className="form-input"
            type="date"
            value={confirmSalaryDate}
            onChange={e => setConfirmSalaryDate(e.target.value)}
          />
        </div>

        <button id="save-confirm-salary-btn" className="btn btn-success" onClick={handleConfirmMonthlySalary}>
          ✅ Registrar Sueldo en Fecha {confirmSalaryDate}
        </button>
      </Modal>
    </>
  );
}
