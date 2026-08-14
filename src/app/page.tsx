'use client';

import { useState, useEffect } from 'react';
import { db, seedDatabase, getCategoriesWithSubs, formatARS, syncMovementToGoogleSheets, syncToSheets } from '@/lib/db';
import { parseExpenseWithAI, parseTicketImageWithAI, categorizePendingExpensesWithAI } from '@/lib/ai';
import { Modal } from '@/components/Modal';

export default function HomePage() {
  const [inputMode, setInputMode] = useState<'ai' | 'form'>('ai');
  const [text, setText] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);
  const [keepOpenMode, setKeepOpenMode] = useState(false);
  const [categorizingBatch, setCategorizingBatch] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success', duration = 4000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), duration);
  };

  // Formulario Directo / Modal de confirmación
  const [showModal, setShowModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [store, setStore] = useState(''); // Comercio / Local
  const [detail, setDetail] = useState(''); // Detalle / Artículo
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null); // Por defecto NULL (Sin definir / Pendiente)
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [selectedPendingCat, setSelectedPendingCat] = useState<{ [expId: number]: number }>({});
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      await seedDatabase();
      loadData();
    };
    init();

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              setImageBase64(evt.target?.result as string);
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);

    const recent = await db.expenses
      .orderBy('id').reverse().limit(12).toArray();
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

    setRecentExpenses(recent.map(e => ({
      ...e,
      category: e.category_id ? catMap[e.category_id] : { name: '⚠️ Pendiente', icon: '❓', color: '#f59e0b' }
    })));

    const pendings = await db.expenses
      .where('category_id').equals(0)
      .and(e => e.status === 'active')
      .toArray();
    setPendingExpenses(pendings);
  };

  const setQuickDate = (type: 'today' | 'yesterday' | 'last_month') => {
    const d = new Date();
    if (type === 'yesterday') {
      d.setDate(d.getDate() - 1);
    } else if (type === 'last_month') {
      d.setMonth(d.getMonth() - 1);
    }
    setDate(d.toISOString().split('T')[0]);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setImageBase64(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePasteFromClipboardApi = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        showToast('📋 Mantené presionado el cuadro de texto para PEGAR la foto.', 'info', 4000);
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (evt) => {
            setImageBase64(evt.target?.result as string);
            showToast('📸 Foto pegada desde el portapapeles', 'success');
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      showToast('ℹ️ No hay ninguna foto en el portapapeles', 'info');
    } catch {
      showToast('📋 Mantené presionado el cuadro de texto para PEGAR la foto', 'info', 4000);
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim() && !imageBase64) return;
    setLoading(true);

    let result = null;
    if (imageBase64) {
      result = await parseTicketImageWithAI(imageBase64, text, categories, date);
    } else {
      result = await parseExpenseWithAI(text, categories, date);
    }

    setLoading(false);

    if (result) {
      setAmount(result.amount > 0 ? result.amount.toString() : '');
      setStore(result.store || '');
      setDetail(result.detail || '');
      setDate(result.date);
      // Pre-seleccionamos la categoría y subcategoría sugeridas por la IA para revisar en la vista previa
      setSelectedCatId(result.categoryId || null);
      setSelectedSubId(result.subcategoryId || null);
    } else {
      setAmount('');
      setStore('');
      setDetail(text || '');
      setSelectedCatId(null);
      setSelectedSubId(null);
    }
    setShowModal(true);
  };

  const handleOpenEdit = (exp: any) => {
    setEditingExpenseId(exp.id);
    setStore(exp.store || '');
    setDetail(exp.detail || '');
    setAmount(exp.amount.toString());
    setDate(exp.date);
    setSelectedCatId(exp.category_id || null);
    setSelectedSubId(exp.subcategory_id || null);
    setNotes(exp.notes || '');
    setShowModal(true);
  };

  const handleReplicateExpense = (exp: any) => {
    setEditingExpenseId(null);
    setStore(exp.store || '');
    setDetail(exp.detail || '');
    setAmount(exp.amount.toString());
    setDate(new Date().toISOString().split('T')[0]);
    setSelectedCatId(exp.category_id || null);
    setSelectedSubId(exp.subcategory_id || null);
    setNotes(exp.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || (!detail.trim() && !store.trim())) return;

    const catId = selectedCatId || 0;
    const subId = selectedSubId || 0;

    const catObj = categories.find(c => c.id === catId);
    const subObj = catObj?.subcategories?.find((s: any) => s.id === subId);

    const expenseData = {
      date,
      amount: numAmount,
      store: store.trim(),
      detail: detail.trim(),
      notes,
      category_id: catId,
      subcategory_id: subId,
      status: 'active' as const,
      module_origin: imageBase64 ? 'ticket_vision' as const : 'general' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (editingExpenseId) {
      // EDITAR EXISTENTE
      await db.expenses.update(editingExpenseId, expenseData);
      syncToSheets('update', editingExpenseId, {
        fecha: date,
        tipo: 'Gasto',
        categoria: catObj?.name || 'Pendiente',
        subcategoria: subObj?.name || 'Pendiente',
        comercio: store.trim(),
        detalle: detail.trim(),
        monto: numAmount,
        notas: notes,
      });
      showToast('✅ Gasto actualizado correctamente', 'success');
    } else {
      // NUEVO O DUPLICADO
      const newExpenseId = await db.expenses.add(expenseData);
      syncToSheets('add', Number(newExpenseId), {
        fecha: date,
        tipo: 'Gasto',
        categoria: catObj?.name || 'Pendiente',
        subcategoria: subObj?.name || 'Pendiente',
        comercio: store.trim(),
        detalle: detail.trim(),
        monto: numAmount,
        notas: notes,
      });
      showToast('✅ Gasto guardado con éxito', 'success');
    }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setEditingExpenseId(null);
      if (!keepOpenMode) {
        setShowModal(false);
        setText('');
        setImageBase64(null);
        setNotes('');
        setAmount('');
        setStore('');
        setDetail('');
        setSelectedCatId(null);
        setSelectedSubId(null);
      } else {
        setAmount('');
        setStore('');
        setDetail('');
        setImageBase64(null);
        setNotes('');
        setSelectedCatId(null);
        setSelectedSubId(null);
      }
      loadData();
    }, 800);
  };

  const confirmDeleteExpense = async () => {
    if (!deletingId) return;
    await db.expenses.delete(deletingId);
    syncToSheets('delete', deletingId);
    setDeletingId(null);
    showToast('🗑️ Gasto eliminado correctamente', 'info');
    loadData();
  };

  const handleBatchCategorize = async () => {
    if (pendingExpenses.length === 0) return;
    setCategorizingBatch(true);

    const results = await categorizePendingExpensesWithAI(
      pendingExpenses.map(p => ({ id: p.id!, detail: p.detail || p.store || 'Gasto', amount: p.amount, date: p.date })),
      categories
    );

    if (results) {
      for (const res of results) {
        await db.expenses.update(res.id, {
          category_id: res.categoryId,
          subcategory_id: res.subcategoryId,
          updated_at: new Date().toISOString(),
        });
        const exp = pendingExpenses.find(p => p.id === res.id);
        const catObj = categories.find(c => c.id === res.categoryId);
        const subObj = catObj?.subcategories?.find((s: any) => s.id === res.subcategoryId);
        if (exp) {
          syncToSheets('update', res.id, {
            fecha: exp.date,
            tipo: 'Gasto',
            categoria: catObj?.name || 'Varios',
            subcategoria: subObj?.name || 'General',
            comercio: exp.store || '',
            detalle: exp.detail || '',
            monto: exp.amount,
            notas: exp.notes || '',
          });
        }
      }
      showToast(`✅ ¡${results.length} gastos categorizados con IA y enviados a Sheets!`, 'success');
    } else {
      showToast('⚠️ No se pudo categorizar. Verificá tu Gemini API Key en Configuración.', 'error');
    }

    setCategorizingBatch(false);
    loadData();
  };

  const handleAssignCategoryToPending = async (expId: number, cId: number, sId: number) => {
    await db.expenses.update(expId, {
      category_id: cId,
      subcategory_id: sId,
      updated_at: new Date().toISOString(),
    });

    const exp = await db.expenses.get(expId);
    if (exp) {
      const catObj = categories.find(c => c.id === cId);
      const subObj = catObj?.subcategories?.find((s: any) => s.id === sId);
      await syncToSheets('update', expId, {
        fecha: exp.date,
        tipo: 'Gasto',
        categoria: catObj?.name || 'Varios',
        subcategoria: subObj?.name || 'General',
        comercio: exp.store || '',
        detalle: exp.detail || '',
        monto: exp.amount,
        notas: exp.notes || '',
      });
      showToast(`✅ Asignado: ${catObj?.name || ''} › ${subObj?.name || ''} y actualizado en Sheets`, 'success');
    }
    loadData();
  };

  const handleSyncPendingsToSheets = async () => {
    if (pendingExpenses.length === 0) return;
    setSyncingSheets(true);
    showToast('📤 Enviando a Google Sheets...', 'info', 3000);

    try {
      for (const p of pendingExpenses) {
        const catObj = categories.find(c => c.id === p.category_id);
        const subObj = catObj?.subcategories?.find((s: any) => s.id === p.subcategory_id);
        await syncToSheets('add', p.id!, {
          fecha: p.date,
          tipo: 'Gasto',
          categoria: catObj?.name || 'Pendiente',
          subcategoria: subObj?.name || 'Pendiente',
          comercio: p.store || '',
          detalle: p.detail || '',
          monto: p.amount,
          notas: p.notes || '',
        });
        // Pequeña pausa para no saturar Google Apps Script
        await new Promise(res => setTimeout(res, 300));
      }
      showToast(`✅ ¡${pendingExpenses.length} gasto${pendingExpenses.length > 1 ? 's' : ''} enviado${pendingExpenses.length > 1 ? 's' : ''} a tu Google Sheets! Verificá la hoja "Nuevos_Movimientos_App".`, 'success', 6000);
    } catch (err) {
      showToast('❌ No se pudo conectar con Google Sheets. Verificá tu URL en Configuración.', 'error', 6000);
    } finally {
      setSyncingSheets(false);
    }
  };

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            setImageBase64(evt.target?.result as string);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
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

      {/* Banner de Pendientes de Clasificar */}
      {pendingExpenses.length > 0 && (
        <div className="card card-accent" style={{ borderColor: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)' }}>
              ⚠️ Tenés {pendingExpenses.length} gasto{pendingExpenses.length > 1 ? 's' : ''} pendiente{pendingExpenses.length > 1 ? 's' : ''} de categoría
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Podés auto-clasificarlos todos juntos con IA o asignarles su categoría manualmente en 1 tap.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleBatchCategorize}
              disabled={categorizingBatch}
            >
              {categorizingBatch ? '🧠 Categorizando...' : '✨ Auto-Categorizar con IA'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPendingModal(true)}
            >
              📋 Atender Pendientes
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSyncPendingsToSheets}
              disabled={syncingSheets}
              title="Enviar los gastos pendientes a tu Google Sheets"
            >
              {syncingSheets ? '⏳ Enviando...' : '📤 Enviar a Sheets'}
            </button>
          </div>
        </div>
      )}

      {/* Toast de feedback visual */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 90,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: toast.type === 'success' ? '#22c55e'
            : toast.type === 'error' ? '#ef4444'
            : '#6366f1',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
          maxWidth: '85vw',
          textAlign: 'center',
          animation: 'slideUp 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Tabs de Selección de Modo */}
      <div className="chips-row" style={{ marginBottom: 14 }}>
        <button
          className={`chip${inputMode === 'ai' ? ' active' : ''}`}
          onClick={() => setInputMode('ai')}
        >
          ✨ Cargar con IA / Foto / Texto
        </button>
        <button
          className={`chip${inputMode === 'form' ? ' active' : ''}`}
          onClick={() => setInputMode('form')}
        >
          📝 Formulario Rápido (Comercio + Detalle + Monto)
        </button>
      </div>

      {/* MODO 1: Carga Asistida con IA / Foto / Texto */}
      {inputMode === 'ai' ? (
        <div className="card card-accent animate-in">
          <label className="form-label">Cargar gasto (Texto, Foto o Pegar Imagen)</label>

          {/* Carga de Imagen / Foto de comprobante */}
          <div style={{ marginBottom: 12 }}>
            {imageBase64 ? (
              <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                <img
                  src={imageBase64}
                  alt="Vista previa ticket"
                  style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)' }}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setImageBase64(null)}
                  style={{ position: 'absolute', top: 8, right: 8, padding: '4px 8px', fontSize: 12 }}
                >
                  ✕ Quitar foto
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <label className="btn btn-ghost" style={{ cursor: 'pointer', borderStyle: 'dashed', justifyContent: 'center', padding: '10px 4px', fontSize: 12 }}>
                  📷 Tomar Foto
                  <input
                    id="ticket-camera-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                </label>
                <label className="btn btn-ghost" style={{ cursor: 'pointer', borderStyle: 'dashed', justifyContent: 'center', padding: '10px 4px', fontSize: 12 }}>
                  🖼️ Galería
                  <input
                    id="ticket-gallery-input"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handlePasteFromClipboardApi}
                  style={{ borderStyle: 'dashed', justifyContent: 'center', padding: '10px 4px', fontSize: 12 }}
                >
                  📋 Pegar Foto
                </button>
              </div>
            )}
          </div>

          {/* Input de Texto */}
          <p style={{ fontSize: 12, color: 'var(--accent-light)', marginBottom: 6, fontWeight: 600 }}>
            💡 Formato sugerido para IA: <span style={{ color: 'var(--text-primary)' }}>Monto, Comercio, Detalle</span>
          </p>
          <textarea
            id="expense-text-input"
            className="form-textarea"
            placeholder='Ej: "15000, Coto, Asado y verduras" o "60000, YPF, Nafta super" (o mantené presionado para PEGAR foto copiada)...'
            value={text}
            onChange={e => setText(e.target.value)}
            onPaste={handleTextareaPaste}
            rows={3}
          />

          {/* Atajos de fecha */}
          <label className="form-label" style={{ marginTop: 12 }}>Fecha del gasto</label>
          <div className="chips-row" style={{ marginBottom: 8 }}>
            <button type="button" className={`chip${date === new Date().toISOString().split('T')[0] ? ' active' : ''}`} onClick={() => setQuickDate('today')}>Hoy</button>
            <button type="button" className="chip" onClick={() => setQuickDate('yesterday')}>Ayer</button>
            <button type="button" className="chip" onClick={() => setQuickDate('last_month')}>Mes Pasado</button>
          </div>

          <input
            id="expense-date-input"
            type="date"
            className="form-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />

          <button
            id="analyze-btn"
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={handleAnalyze}
            disabled={loading || (!text.trim() && !imageBase64)}
          >
            {loading ? '🧠 Analizando con IA...' : imageBase64 && text ? '✨ Analizar Texto + Ticket' : imageBase64 ? '📸 Leer Ticket con IA' : '✨ Analizar Texto con IA'}
          </button>
        </div>
      ) : (
        /* MODO 2: Formulario Rápido Directo por Campos (Comercio y Detalle independientes) */
        <div className="card card-accent animate-in">
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--accent-light)' }}>
            📝 Carga Manual Directa
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Monto ($) (*Requerido)</label>
              <input
                id="direct-amount"
                className="form-input"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Ej: 15400"
                inputMode="decimal"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Comercio / Local</label>
              <input
                id="direct-store"
                className="form-input"
                value={store}
                onChange={e => setStore(e.target.value)}
                placeholder="Ej: Coto, YPF, Shell..."
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Detalle / Artículo (descripción)</label>
            <input
              id="direct-detail"
              className="form-input"
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="Ej: Nafta super, Carnes y verduras..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Fecha del gasto</label>
            <div className="chips-row" style={{ marginBottom: 6 }}>
              <button type="button" className={`chip${date === new Date().toISOString().split('T')[0] ? ' active' : ''}`} onClick={() => setQuickDate('today')}>Hoy</button>
              <button type="button" className="chip" onClick={() => setQuickDate('yesterday')}>Ayer</button>
              <button type="button" className="chip" onClick={() => setQuickDate('last_month')}>Mes Pasado</button>
            </div>
            <input
              id="direct-date"
              className="form-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Categoría</label>
            <div className="chips-row">
              {/* Si hay una categoría seleccionada (ej: por IA), la mostramos PRIMERA en la lista */}
              {[...categories]
                .sort((a, b) => (a.id === selectedCatId ? -1 : b.id === selectedCatId ? 1 : 0))
                .map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`chip${selectedCatId === cat.id ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedCatId(cat.id);
                      setSelectedSubId(cat.subcategories[0]?.id || null);
                    }}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              <button
                type="button"
                className={`chip${selectedCatId === null ? ' active' : ''}`}
                onClick={() => { setSelectedCatId(null); setSelectedSubId(null); }}
              >
                ❓ Sin definir (Pendiente)
              </button>
            </div>
          </div>

          {activeCat?.subcategories?.length > 0 && (
            <div className="form-group">
              <label className="form-label">Subcategoría</label>
              <div className="chips-row">
                {[...activeCat.subcategories]
                  .sort((a: any, b: any) => (a.id === selectedSubId ? -1 : b.id === selectedSubId ? 1 : 0))
                  .map((sub: any) => (
                    <button
                      key={sub.id}
                      type="button"
                      className={`chip${selectedSubId === sub.id ? ' active' : ''}`}
                      onClick={() => setSelectedSubId(sub.id)}
                    >
                      {sub.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <button
            id="save-direct-btn"
            className="btn btn-success"
            style={{ marginTop: 8 }}
            onClick={handleSave}
            disabled={(!detail.trim() && !store.trim()) || !amount || parseFloat(amount) <= 0}
          >
            💾 Guardar Gasto {selectedCatId === null ? '(Como Pendiente)' : ''}
          </button>
        </div>
      )}

      {/* Gastos recientes con opciones de Editar, Replicar y Eliminar */}
      {recentExpenses.length > 0 && (
        <>
          <p className="section-title">Últimos gastos cargados</p>
          <div className="card">
            {recentExpenses.map((exp) => (
              <div key={exp.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '14px 16px', marginBottom: 8, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                {/* Fila superior: Ícono + Comercio + Detalle + Subtítulo */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    className="list-item-icon"
                    style={{ background: (exp.category?.color || '#6366f1') + '22', flexShrink: 0, marginTop: 2 }}
                  >
                    {exp.category?.icon || '📦'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.35', wordBreak: 'break-word' }}>
                      {exp.store ? <span style={{ fontWeight: 800 }}>{exp.store}</span> : null}
                      {exp.store && exp.detail ? ' · ' : null}
                      {exp.detail ? <span style={{ fontWeight: 400 }}>{exp.detail}</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      {exp.category?.name || '⚠️ Pendiente'} · {exp.date}
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
                      title="Editar este gasto"
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
        </>
      )}

      {/* Modal de confirmación / Carga */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="💾 Confirmar o Cargar Gasto">
        {saved ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <p style={{ color: 'var(--positive)', fontWeight: 700, marginTop: 8 }}>
              {keepOpenMode ? '¡Gasto guardado! Listo para el siguiente...' : '¡Gasto guardado con éxito!'}
            </p>
          </div>
        ) : (
          <>
            {imageBase64 && (
              <div style={{ marginBottom: 12 }}>
                <img src={imageBase64} alt="Ticket" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Monto ($) (*Requerido)</label>
                <input id="modal-amount" className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" inputMode="decimal" />
              </div>

              <div className="form-group">
                <label className="form-label">Comercio / Local</label>
                <input id="modal-store" className="form-input" value={store} onChange={e => setStore(e.target.value)} placeholder="Ej: Coto, YPF..." />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Detalle / Artículo (descripción)</label>
              <input id="modal-detail" className="form-input" value={detail} onChange={e => setDetail(e.target.value)} placeholder="Ej: Nafta super, Carnes..." />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha del gasto</label>
              <div className="chips-row" style={{ marginBottom: 6 }}>
                <button type="button" className="chip" onClick={() => setQuickDate('today')}>Hoy</button>
                <button type="button" className="chip" onClick={() => setQuickDate('yesterday')}>Ayer</button>
                <button type="button" className="chip" onClick={() => setQuickDate('last_month')}>Mes Pasado</button>
              </div>
              <input id="modal-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Categoría (*Sugerida por IA al comienzo)</label>
              <div className="chips-row">
                {/* Mostramos primero la categoría seleccionada por la IA */}
                {[...categories]
                  .sort((a, b) => (a.id === selectedCatId ? -1 : b.id === selectedCatId ? 1 : 0))
                  .map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`chip${selectedCatId === cat.id ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedCatId(cat.id);
                        setSelectedSubId(cat.subcategories[0]?.id || null);
                      }}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                <button
                  type="button"
                  className={`chip${selectedCatId === null ? ' active' : ''}`}
                  onClick={() => { setSelectedCatId(null); setSelectedSubId(null); }}
                >
                  ❓ Sin definir (Pendiente)
                </button>
              </div>
            </div>

            {activeCat?.subcategories?.length > 0 && (
              <div className="form-group">
                <label className="form-label">Subcategoría (*Sugerida por IA al comienzo)</label>
                <div className="chips-row">
                  {[...activeCat.subcategories]
                    .sort((a: any, b: any) => (a.id === selectedSubId ? -1 : b.id === selectedSubId ? 1 : 0))
                    .map((sub: any) => (
                      <button
                        key={sub.id}
                        type="button"
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
              <label className="form-label">Notas o Medio de pago (opcional)</label>
              <input id="modal-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: MercadoPago, Débito, Efectivo..." />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
              <input
                type="checkbox"
                id="keep-open-check"
                checked={keepOpenMode}
                onChange={e => setKeepOpenMode(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              <label htmlFor="keep-open-check" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                ⚡ Carga continua (mantiene ventana abierta para cargar varios gastos pasados)
              </label>
            </div>

            <button
              id="save-expense-btn"
              className="btn btn-success"
              onClick={handleSave}
              disabled={(!detail.trim() && !store.trim()) || !amount || parseFloat(amount) <= 0}
            >
              💾 Guardar Gasto
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowModal(false)}>Cancelar</button>
          </>
        )}
      </Modal>

      {/* Modal Bandeja de Atender Pendientes de Categoría */}
      <Modal isOpen={showPendingModal} onClose={() => setShowPendingModal(false)} title={`📋 Atender Pendientes (${pendingExpenses.length})`}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Asignales su categoría a cada uno con 1 tap o tocá el botón para que la IA los ordene todos juntos.
        </p>

        <button
          className="btn btn-primary"
          style={{ marginBottom: 16 }}
          onClick={() => { setShowPendingModal(false); handleBatchCategorize(); }}
        >
          ✨ Auto-Categorizar Todos con IA
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 380, overflowY: 'auto' }}>
          {pendingExpenses.map(p => {
            const activePendingCatId = selectedPendingCat[p.id!];
            const activeCatObj = categories.find(c => c.id === activePendingCatId);

            return (
              <div key={p.id} style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {p.store ? `${p.store}` : ''}{p.store && p.detail ? ' · ' : ''}{p.detail}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--negative)' }}>{formatARS(p.amount)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{p.date}</div>

                <p style={{ fontSize: 11, color: 'var(--accent-light)', marginBottom: 4, fontWeight: 600 }}>
                  1. Seleccioná Categoría:
                </p>
                <div className="chips-row" style={{ marginBottom: activeCatObj ? 8 : 0 }}>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      className={`chip${activePendingCatId === cat.id ? ' active' : ''}`}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => {
                        setSelectedPendingCat(prev => ({ ...prev, [p.id!]: cat.id }));
                      }}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                </div>

                {/* Subcategorías de la categoría seleccionada */}
                {activeCatObj && activeCatObj.subcategories?.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: 8, borderRadius: 8, marginTop: 6 }}>
                    <p style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 6, fontWeight: 600 }}>
                      2. Seleccioná Subcategoría para confirmar:
                    </p>
                    <div className="chips-row">
                      {activeCatObj.subcategories.map((sub: any) => (
                        <button
                          key={sub.id}
                          className="chip active"
                          style={{ fontSize: 11, padding: '4px 8px', background: 'var(--accent)' }}
                          onClick={() => handleAssignCategoryToPending(p.id!, activeCatObj.id, sub.id)}
                        >
                          📌 {sub.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Modal de confirmación para Eliminar Gasto */}
      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="🗑️ Eliminar Gasto">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
          ¿Estás seguro de que querés eliminar este gasto? Esta acción lo borrará localmente y en tu Google Sheets.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setDeletingId(null)}>
            Cancelar
          </button>
          <button className="btn btn-danger" onClick={confirmDeleteExpense}>
            🗑️ Eliminar Definitivamente
          </button>
        </div>
      </Modal>
    </>
  );
}
