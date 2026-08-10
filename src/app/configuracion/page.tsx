'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/db';

export default function ConfiguracionPage() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState({ expenses: 0, incomes: 0, fixed: 0 });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiKey(localStorage.getItem('gemini_api_key') || '');
    }
    loadStats();
  }, []);

  const loadStats = async () => {
    const [e, i, f] = await Promise.all([
      db.expenses.count(),
      db.income.count(),
      db.fixed_expenses.count(),
    ]);
    setStats({ expenses: e, incomes: i, fixed: f });
  };

  const handleSaveKey = () => {
    localStorage.setItem('gemini_api_key', apiKey.trim());
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 2000);
  };

  const handleExportData = async () => {
    setExporting(true);
    const data = {
      categories: await db.categories.toArray(),
      subcategories: await db.subcategories.toArray(),
      expenses: await db.expenses.toArray(),
      fixed_expenses: await db.fixed_expenses.toArray(),
      income: await db.income.toArray(),
      salary_config: await db.salary_config.toArray(),
      medical: await db.medical_consultations.toArray(),
      purchases: await db.purchases.toArray(),
      loans: await db.loans.toArray(),
      reintegros: await db.reintegros.toArray(),
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-finanzas-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        if (json.expenses) {
          await db.transaction('rw', [db.categories, db.subcategories, db.expenses, db.income, db.fixed_expenses], async () => {
            if (json.categories) await db.categories.bulkPut(json.categories);
            if (json.subcategories) await db.subcategories.bulkPut(json.subcategories);
            if (json.expenses) await db.expenses.bulkPut(json.expenses);
            if (json.income) await db.income.bulkPut(json.income);
            if (json.fixed_expenses) await db.fixed_expenses.bulkPut(json.fixed_expenses);
          });
          alert('✅ Datos importados con éxito');
          loadStats();
        }
      } catch (err) {
        alert('❌ Error al importar el archivo JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">⚙️ Configuración</h1>
      </div>

      {/* Clave de Gemini AI */}
      <div className="card animate-in">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🤖 Clave de Inteligencia Artificial (Gemini)</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Ingresá tu API Key gratuita de Google Gemini para habilitar el análisis en lenguaje natural de la pantalla de inicio.
        </p>

        <div className="form-group">
          <label className="form-label">Gemini API Key</label>
          <input
            id="gemini-key-input"
            type="password"
            className="form-input"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
          />
        </div>

        <button id="save-key-btn" className="btn btn-primary" onClick={handleSaveKey}>
          {savedKey ? '✅ ¡Guardada con éxito!' : '💾 Guardar API Key'}
        </button>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          Consíguela gratis en Google AI Studio (airstudio.google.com)
        </p>
      </div>

      {/* Resumen de base de datos */}
      <p className="section-title">Estadísticas locales</p>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-light)' }}>{stats.expenses}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gastos</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--positive)' }}>{stats.incomes}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ingresos</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--warning)' }}>{stats.fixed}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fijos</div>
          </div>
        </div>
      </div>

      {/* Copia de seguridad */}
      <p className="section-title">Copia de seguridad (Backup)</p>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Tus datos se guardan en el navegador de tu dispositivo. Exportá una copia para resguardarlos.
        </p>

        <button id="export-json-btn" className="btn btn-ghost" onClick={handleExportData} disabled={exporting} style={{ marginBottom: 10 }}>
          📥 {exporting ? 'Exportando...' : 'Exportar datos a JSON'}
        </button>

        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
          📤 Importar desde JSON
          <input type="file" accept=".json" onChange={handleImportData} style={{ display: 'none' }} />
        </label>
      </div>
    </>
  );
}
