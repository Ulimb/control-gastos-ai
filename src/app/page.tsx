'use client';

import { useState, useEffect } from 'react';
import { db, seedDatabase, getCategoriesWithSubs, formatARS } from '@/lib/db';
import { parseExpenseWithAI } from '@/lib/ai';
import { Modal } from '@/components/Modal';

export default function HomePage() {
  const [text, setText] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);

  // Propuesta de IA
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const init = async () => {
      await seedDatabase();
      loadData();
    };
    init();
  }, []);

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);

    const recent = await db.expenses
      .orderBy('id').reverse().limit(5).toArray();
    const catMap = Object.fromEntries((await db.categories.toArray()).map(c => [c.id, c]));
    setRecentExpenses(recent.map(e => ({ ...e, category: catMap[e.category_id] })));
  };

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setLoading(true);

    const result = await parseExpenseWithAI(text, categories, date);
    setLoading(false);

    if (result) {
      setAmount(result.amount > 0 ? result.amount.toString() : '');
      setDetail(result.detail);
      setDate(result.date);
      setSelectedCatId(result.categoryId);
      setSelectedSubId(result.subcategoryId);
    } else {
      setAmount('');
      setDetail(text);
      setSelectedCatId(categories[0]?.id || null);
      setSelectedSubId(categories[0]?.subcategories[0]?.id || null);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || !selectedCatId || !selectedSubId) return;

    await db.expenses.add({
      date,
      amount: numAmount,
      detail: detail || text,
      notes,
      category_id: selectedCatId,
      subcategory_id: selectedSubId,
      status: 'active',
      module_origin: 'general',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setShowModal(false);
      setText('');
      setNotes('');
      loadData();
    }, 1000);
  };

  const activeCat = categories.find(c => c.id === selectedCatId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚡ Mis Finanzas</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      {/* Input rápido */}
      <div className="card card-accent animate-in">
        <label className="form-label">Describí tu gasto</label>
        <textarea
          id="expense-text-input"
          className="form-textarea"
          placeholder='Ej: "Almuerzo 15000", "Nafta 60000 ayer", "Médico clínica 25000"'
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">Fecha</label>
            <input
              id="expense-date-input"
              type="date"
              className="form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <button
          id="analyze-btn"
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={handleAnalyze}
          disabled={loading || !text.trim()}
        >
          {loading ? '🧠 Analizando...' : '✨ Analizar con IA'}
        </button>

        <button
          id="manual-btn"
          className="btn btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            setDetail('');
            setAmount('');
            setSelectedCatId(categories[0]?.id || null);
            setSelectedSubId(categories[0]?.subcategories[0]?.id || null);
            setShowModal(true);
          }}
        >
          ✏️ Cargar manualmente
        </button>
      </div>

      {/* Gastos recientes */}
      {recentExpenses.length > 0 && (
        <>
          <p className="section-title">Últimos gastos</p>
          <div className="card">
            {recentExpenses.map((exp) => (
              <div key={exp.id} className="list-item">
                <div
                  className="list-item-icon"
                  style={{ background: exp.category?.color + '22' }}
                >
                  {exp.category?.icon || '📦'}
                </div>
                <div className="list-item-body">
                  <div className="list-item-title">{exp.detail}</div>
                  <div className="list-item-subtitle">{exp.category?.name} · {exp.date}</div>
                </div>
                <div className="list-item-right">
                  <div className="list-item-amount amount-negative">{formatARS(exp.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal de confirmación */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="💾 Confirmar gasto">
        {saved ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <p style={{ color: 'var(--positive)', fontWeight: 700, marginTop: 8 }}>¡Gasto guardado!</p>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Detalle</label>
              <input id="modal-detail" className="form-input" value={detail} onChange={e => setDetail(e.target.value)} placeholder="Descripción del gasto" />
            </div>

            <div className="form-group">
              <label className="form-label">Monto ($)</label>
              <input id="modal-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" inputMode="decimal" />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input id="modal-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Categoría</label>
              <div className="chips-row">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`chip${selectedCatId === cat.id ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedCatId(cat.id);
                      setSelectedSubId(cat.subcategories[0]?.id || null);
                    }}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {activeCat?.subcategories?.length > 0 && (
              <div className="form-group">
                <label className="form-label">Subcategoría</label>
                <div className="chips-row">
                  {activeCat.subcategories.map((sub: any) => (
                    <button
                      key={sub.id}
                      className={`chip${selectedSubId === sub.id ? ' active' : ''}`}
                      onClick={() => setSelectedSubId(sub.id)}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notas (opcional)</label>
              <input id="modal-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Comentario adicional..." />
            </div>

            <button
              id="save-expense-btn"
              className="btn btn-success"
              onClick={handleSave}
              disabled={!amount || parseFloat(amount) <= 0 || !selectedCatId || !selectedSubId}
            >
              💾 Guardar Gasto
            </button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowModal(false)}>Cancelar</button>
          </>
        )}
      </Modal>
    </>
  );
}
