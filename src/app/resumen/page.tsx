'use client';

import { useState, useEffect } from 'react';
import { getPeriodBalance, getExpensesByCategory, formatARS } from '@/lib/db';

export default function ResumenPage() {
  const [balance, setBalance] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [bal, cat] = await Promise.all([
      getPeriodBalance(startDate, endDate),
      getExpensesByCategory(startDate, endDate),
    ]);
    setBalance(bal);
    setBreakdown(cat);
    setLoading(false);
  };

  const monthName = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Resumen</h1>
          <p className="page-subtitle" style={{ textTransform: 'capitalize' }}>{monthName}</p>
        </div>
        <button id="refresh-btn" className="btn btn-ghost btn-sm" onClick={loadData}>↻ Actualizar</button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p className="empty-state-text">Cargando datos...</p>
        </div>
      ) : (
        <>
          {/* Balance card */}
          <div className="balance-card animate-in">
            <p className="balance-label">Disponible en el mes</p>
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
          <p className="section-title">Gastos por categoría</p>

          {breakdown.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-state-icon">📭</div>
                <p className="empty-state-text">No hay gastos registrados este mes</p>
              </div>
            </div>
          ) : (
            <div className="card">
              {breakdown.map((cat, idx) => {
                const pct = balance?.totalExpenses > 0
                  ? Math.min((cat.total / balance.totalExpenses) * 100, 100)
                  : 0;
                return (
                  <div key={idx} style={{ marginBottom: idx < breakdown.length - 1 ? 16 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {cat.name}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-light)' }}>
                        {formatARS(cat.total)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${pct}%`, background: cat.color || 'var(--accent)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Indicadores extras */}
          {balance && (
            <>
              <p className="section-title">Indicadores</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📈</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Gasto diario prom.</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatARS(balance.totalExpenses / today.getDate())}
                  </div>
                </div>
                <div className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>🗓️</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Días restantes</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()}
                  </div>
                </div>
                <div className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>💡</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Proyección del mes</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: balance.totalExpenses / today.getDate() * 30 > balance.totalIncome ? 'var(--negative)' : 'var(--positive)' }}>
                    {formatARS(balance.totalExpenses / today.getDate() * new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate())}
                  </div>
                </div>
                <div className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>🏷️</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Categorías usadas</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {breakdown.length}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
