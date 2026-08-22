'use client';

import { useState, useEffect, useRef } from 'react';
import { db, seedDatabase, getCategoriesWithSubs, formatARS, syncMovementToGoogleSheets, syncToSheets, syncMissingExpensesToSheets, settleExpenseReimbursement, syncFromSheets } from '@/lib/db';
import { parseExpenseWithAI, parseTicketImagesWithAI, parseMultiExpenseTextWithAI, categorizePendingExpensesWithAI, parseNumericAmount, parseLocalHeuristic, parseDiscount } from '@/lib/ai';
import type { ParsedItem } from '@/lib/ai';
import { Modal } from '@/components/Modal';

const DRAFT_KEY = 'misfinanzas_home_draft';

export default function HomePage() {
  const [inputMode, setInputMode] = useState<'ai' | 'form'>('ai');
  const [text, setText] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);
  const [keepOpenMode, setKeepOpenMode] = useState(false);
  const [categorizingBatch, setCategorizingBatch] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [syncingMissing, setSyncingMissing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success', duration = 4000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), duration);
  };

  // Formulario Directo / Modal de confirmación individual
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

  // Gasto Compartido / Reintegro de Terceros
  const [isShared, setIsShared] = useState(false);
  const [reimbursementPerson, setReimbursementPerson] = useState('');
  const [reimbursementAmount, setReimbursementAmount] = useState('');

  // Modal de Desglose Multi-Artículo (ej: Carrito MercadoLibre / Ticket Super / Multi-Líneas)
  const [showMultiModal, setShowMultiModal] = useState(false);
  const [multiItems, setMultiItems] = useState<ParsedItem[]>([]);
  const [multiStore, setMultiStore] = useState('MercadoLibre');
  const [multiDate, setMultiDate] = useState(new Date().toISOString().split('T')[0]);
  const [multiTotalDetected, setMultiTotalDetected] = useState<number | null>(null);
  const [multiCartExpected, setMultiCartExpected] = useState<number | null>(null);
  const [multiSaving, setMultiSaving] = useState(false);
  const [multiSavingProgress, setMultiSavingProgress] = useState<string | null>(null);
  const [multiDiscount, setMultiDiscount] = useState<number | null>(null);
  const [multiDiscountDesc, setMultiDiscountDesc] = useState<string>('');

  const addImages = (newImages: string[]) => {
    setImagesBase64(prev => {
      const unique = newImages.filter(img => !prev.includes(img));
      if (unique.length === 0) return prev;
      showToast(unique.length === 1 ? '📸 Foto adjuntada' : `📸 ${unique.length} fotos adjuntadas`, 'success', 2500);
      return [...prev, ...unique];
    });
  };

  const removeImage = (index: number) => {
    setImagesBase64(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const init = async () => {
      await seedDatabase();
      await loadData();

      // Restaurar borrador de inicio si existe
      try {
        const savedDraft = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null;
        if (savedDraft) {
          const d = JSON.parse(savedDraft);
          const hasData = (d.text && d.text.trim()) || (d.imagesBase64 && d.imagesBase64.length > 0) || (d.amount && d.amount.trim()) || (d.detail && d.detail.trim());
          if (hasData) {
            if (d.text) setText(d.text);
            if (d.date) setDate(d.date);
            if (d.inputMode) setInputMode(d.inputMode);
            if (d.amount) setAmount(d.amount);
            if (d.store) setStore(d.store);
            if (d.detail) setDetail(d.detail);
            if (d.selectedCatId) setSelectedCatId(d.selectedCatId);
            if (d.selectedSubId) setSelectedSubId(d.selectedSubId);
            if (d.imagesBase64 && d.imagesBase64.length > 0) setImagesBase64(d.imagesBase64);
            if (d.isShared) setIsShared(d.isShared);
            if (d.reimbursementPerson) setReimbursementPerson(d.reimbursementPerson);
            if (d.reimbursementAmount) setReimbursementAmount(d.reimbursementAmount);
            setDraftRestored(true);
          }
        }
      } catch (_) {}

      // Sincronizar en segundo plano desde Google Sheets para mantener actualizados Safari, Chrome y dispositivos
      try {
        syncFromSheets().then(res => {
          if (res.imported > 0 || res.updated > 0) {
            loadData();
          }
        }).catch(() => {});
      } catch (_) {}
    };
    init();

    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Si el usuario está dentro del cuadro de texto, lo maneja el onPaste específico para no duplicar
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'TEXTAREA' || targetTag === 'INPUT') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              if (evt.target?.result) {
                addImages([evt.target.result as string]);
              }
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

  // Auto-guardado en localStorage ante cambios en el formulario de inicio
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasData = text.trim() || imagesBase64.length > 0 || amount.trim() || store.trim() || detail.trim() || reimbursementPerson.trim();
    if (hasData) {
      const draft = {
        text,
        date,
        inputMode,
        amount,
        store,
        detail,
        selectedCatId,
        selectedSubId,
        imagesBase64,
        isShared,
        reimbursementPerson,
        reimbursementAmount,
        updatedAt: Date.now()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [text, date, inputMode, amount, store, detail, selectedCatId, selectedSubId, imagesBase64, isShared, reimbursementPerson, reimbursementAmount]);

  const handleDiscardDraft = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DRAFT_KEY);
    }
    resetForm(false);
    setImagesBase64([]);
    setText('');
    setIsShared(false);
    setReimbursementPerson('');
    setReimbursementAmount('');
    setDraftRestored(false);
    showToast('🗑️ Borrador descartado', 'info', 2000);
  };

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);

    const recent = await db.expenses
      .orderBy('id').reverse().limit(20).toArray();
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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          addImages([evt.target.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset value so user can pick the same file again if desired
    e.target.value = '';
  };

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        e.stopPropagation();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (evt.target?.result) {
              addImages([evt.target.result as string]);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  const handlePasteFromClipboardApi = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        let found = false;
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const reader = new FileReader();
            reader.onload = (evt) => {
              if (evt.target?.result) {
                addImages([evt.target.result as string]);
              }
            };
            reader.readAsDataURL(blob);
            found = true;
          }
        }
        if (found) return;
      }
    } catch (_) {
      // Ignorar excepción de permisos estrictos en navegadores móviles
    }

    // Si la API del portapapeles está bloqueada por el sistema móvil, asistimos al usuario con foco inmediato
    if (textareaRef.current) {
      textareaRef.current.focus();
      showToast('👉 Mantené presionado el cuadro de texto y tocá "Pegar"', 'info', 4000);
    } else {
      showToast('📋 Mantené presionado el cuadro de texto para PEGAR la foto', 'info', 4000);
    }
  };

  const handleSyncMissing = async () => {
    setSyncingMissing(true);
    showToast('🔄 Verificando integridad de gastos con Google Sheets...', 'info', 3000);
    try {
      const res = await syncMissingExpensesToSheets((msg) => showToast(msg, 'info', 3000));
      if (res.sent > 0) {
        showToast(`✅ Se sincronizaron ${res.sent} gastos faltantes a Google Sheets`, 'success', 5000);
      } else {
        showToast('✅ Todos los gastos están 100% sincronizados con Sheets', 'success', 4000);
      }
    } catch (err: any) {
      showToast('❌ Error al sincronizar: ' + err.message, 'error');
    } finally {
      setSyncingMissing(false);
    }
  };

  const resetForm = (keepDate = false) => {
    setAmount('');
    setStore('');
    setDetail('');
    setNotes('');
    setSelectedCatId(null);
    setSelectedSubId(null);
    setEditingExpenseId(null);
    setIsShared(false);
    setReimbursementPerson('');
    setReimbursementAmount('');
    if (!keepDate) {
      setDate(new Date().toISOString().split('T')[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim() && imagesBase64.length === 0) return;
    setLoading(true);

    // Preservar la fecha explícitamente elegida por el usuario antes de analizar
    const currentSelectedDate = date || new Date().toISOString().split('T')[0];
    resetForm(true);

    const analysisDate = currentSelectedDate;
    const textLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    try {
      if (imagesBase64.length > 0) {
        const multiResult = await parseTicketImagesWithAI(
          imagesBase64,
          text,
          categories,
          analysisDate
        );

        if (multiResult.isMultiItem && multiResult.items.length > 1) {
          setMultiStore(multiResult.store || 'MercadoLibre');
          setMultiDate(multiResult.date || analysisDate);
          setMultiItems(multiResult.items);
          setMultiTotalDetected(multiResult.totalDetected || null);
          setMultiCartExpected(multiResult.cartTotalItemsExpected || null);
          if (multiResult.discountApplied && multiResult.discountApplied > 0) {
            setMultiDiscount(multiResult.discountApplied);
            setMultiDiscountDesc(multiResult.discountDescription || 'Promoción aplicada');
          } else {
            setMultiDiscount(null);
            setMultiDiscountDesc('');
          }
          setShowMultiModal(true);
          return;
        }

        // 1 solo item detectado en la foto
        const first = multiResult.items[0];
        if (first) {
          setAmount(first.amount > 0 ? first.amount.toString() : '');
          setStore(first.store || multiResult.store || '');
          setDetail(first.detail || '');
          setDate(multiResult.date || analysisDate);
          setSelectedCatId(first.categoryId || null);
          setSelectedSubId(first.subcategoryId || null);
          if (first.reimbursementPerson || first.reimbursementAmount) {
            setIsShared(true);
            setReimbursementPerson(first.reimbursementPerson || '');
            setReimbursementAmount(first.reimbursementAmount ? first.reimbursementAmount.toString() : '');
          }
          setShowModal(true);
          return;
        }
      } else if (textLines.length > 1) {
        // Carga de Múltiples Gastos en un Solo Mensaje (Multi-línea)
        const multiTextResult = await parseMultiExpenseTextWithAI(text, categories, analysisDate);
        if (multiTextResult.isMultiItem && multiTextResult.items.length > 1) {
          setMultiStore(multiTextResult.store || '');
          setMultiDate(multiTextResult.date || analysisDate);
          setMultiItems(multiTextResult.items);
          setMultiTotalDetected(multiTextResult.totalDetected || null);
          setMultiCartExpected(multiTextResult.items.length);
          const promo = parseDiscount(text, multiTextResult.totalDetected || multiTextResult.items.reduce((s, it) => s + it.amount, 0));
          if (promo.discountAmount > 0) {
            setMultiDiscount(promo.discountAmount);
            setMultiDiscountDesc(promo.discountDesc);
          } else {
            setMultiDiscount(null);
            setMultiDiscountDesc('');
          }
          setShowMultiModal(true);
          return;
        }
      }

      // Análisis de texto puro (1 solo gasto)
      const result = await parseExpenseWithAI(text, categories, analysisDate);
      if (result) {
        setAmount(result.amount > 0 ? result.amount.toString() : '');
        setStore(result.store || '');
        setDetail(result.detail || '');
        setDate(result.date || analysisDate);
        setSelectedCatId(result.categoryId || null);
        setSelectedSubId(result.subcategoryId || null);
        if (result.reimbursementPerson || result.reimbursementAmount) {
          setIsShared(true);
          setReimbursementPerson(result.reimbursementPerson || '');
          setReimbursementAmount(result.reimbursementAmount ? result.reimbursementAmount.toString() : '');
        }
        setShowModal(true);
      }
    } catch (err: any) {
      console.warn('Error en análisis principal, aplicando fallback heurístico:', err);
      const fallback = parseLocalHeuristic(text, categories, analysisDate);
      setAmount(fallback.amount > 0 ? fallback.amount.toString() : '');
      setStore(fallback.store || '');
      setDetail(fallback.detail || text || '');
      setDate(fallback.date || analysisDate);
      setSelectedCatId(fallback.categoryId || null);
      setSelectedSubId(fallback.subcategoryId || null);
      if (fallback.reimbursementPerson || fallback.reimbursementAmount) {
        setIsShared(true);
        setReimbursementPerson(fallback.reimbursementPerson || '');
        setReimbursementAmount(fallback.reimbursementAmount ? fallback.reimbursementAmount.toString() : '');
      }
      showToast('💡 Completado con análisis inteligente rápido', 'info', 3000);
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleProrateDifference = () => {
    if (!multiTotalDetected || multiItems.length === 0) return;
    const currentSum = multiItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    if (currentSum <= 0) return;

    const ratio = multiTotalDetected / currentSum;
    let runningSum = 0;
    const updated = multiItems.map((it, idx) => {
      if (idx === multiItems.length - 1) {
        const lastAmount = Math.round((multiTotalDetected - runningSum) * 100) / 100;
        return { ...it, amount: lastAmount };
      }
      const newAmt = Math.round(it.amount * ratio * 100) / 100;
      runningSum += newAmt;
      return { ...it, amount: newAmt };
    });

    setMultiItems(updated);
    showToast(`⚡ Precios prorrateados para sumar exactamente ${formatARS(multiTotalDetected)}`, 'success');
  };

  const handleProrateDiscount = (discountAmt: number, desc: string) => {
    if (!discountAmt || multiItems.length === 0) return;
    const currentSum = multiItems.reduce((acc, it) => acc + (parseFloat(it.amount as any) || 0), 0);
    if (currentSum <= 0) return;

    const targetTotal = currentSum - discountAmt;
    const ratio = targetTotal / currentSum;
    let runningSum = 0;

    const updated = multiItems.map((it, idx) => {
      const oldAmt = parseFloat(it.amount as any) || 0;
      if (idx === multiItems.length - 1) {
        const lastAmount = Math.round((targetTotal - runningSum) * 100) / 100;
        return {
          ...it,
          amount: lastAmount,
          notes: (it.notes ? it.notes + ' · ' : '') + `[${desc || 'Promo'} aplicada. Lista original: $${oldAmt}]`
        };
      }
      const newAmt = Math.round(oldAmt * ratio * 100) / 100;
      runningSum += newAmt;
      return {
        ...it,
        amount: newAmt,
        notes: (it.notes ? it.notes + ' · ' : '') + `[${desc || 'Promo'} aplicada. Lista original: $${oldAmt}]`
      };
    });

    setMultiItems(updated);
    setMultiTotalDetected(targetTotal);
    setMultiDiscount(null);
    showToast(`⚡ Descuento de ${formatARS(discountAmt)} prorrateado en los productos`, 'success', 4000);
  };

  const handleAddDiscountItem = (discountAmt: number, desc: string) => {
    if (!discountAmt) return;
    const adjItem: ParsedItem = {
      detail: desc || 'Descuento / Promoción',
      store: multiStore || 'MercadoLibre',
      amount: -Math.abs(discountAmt),
      categoryId: multiItems[0]?.categoryId || 1,
      subcategoryId: multiItems[0]?.subcategoryId || 1,
      notes: 'Bonificación / Promoción global',
    };
    setMultiItems(prev => [...prev, adjItem]);
    setMultiDiscount(null);
    showToast(`➕ Fila de descuento de -${formatARS(discountAmt)} agregada a la compra`, 'info', 3500);
  };

  const handleAddAdjustmentItem = () => {
    if (!multiTotalDetected) return;
    const currentSum = multiItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    const diff = Math.round((multiTotalDetected - currentSum) * 100) / 100;
    if (Math.abs(diff) < 0.01) {
      showToast('ℹ️ Los artículos ya suman el total exacto', 'info');
      return;
    }

    const adjItem: ParsedItem = {
      detail: diff > 0 ? 'Envío / Recargo de compra' : 'Descuento cupón / Bonificación',
      store: multiStore || 'MercadoLibre',
      amount: diff,
      categoryId: categories[0]?.id || 1,
      subcategoryId: categories[0]?.subcategories[0]?.id || 1,
      notes: 'Ajuste para conciliar total de compra',
    };

    setMultiItems(prev => [...prev, adjItem]);
    showToast(`➕ Fila de ajuste agregada por ${formatARS(diff)}`, 'info');
  };

  const handleSaveMultiItems = async () => {
    if (multiItems.length === 0) return;
    setMultiSaving(true);

    try {
      let count = 0;
      for (const it of multiItems) {
        count++;
        const numAmount = parseFloat(it.amount as any) || 0;
        if (numAmount <= 0) continue;

        setMultiSavingProgress(`Guardando ${count} de ${multiItems.length}...`);

        const catId = it.categoryId || 1;
        const subId = it.subcategoryId || 1;
        const catObj = categories.find(c => c.id === catId);
        const subObj = catObj?.subcategories?.find((s: any) => s.id === subId);

        const itemReimbAmount = it.reimbursementAmount ? parseFloat(it.reimbursementAmount as any) : undefined;
        const itemHasReimb = it.reimbursementPerson && itemReimbAmount && itemReimbAmount > 0;

        const expData = {
          date: multiDate,
          amount: numAmount,
          store: (it.store || multiStore).trim(),
          detail: it.detail.trim(),
          notes: it.notes || '',
          category_id: catId,
          subcategory_id: subId,
          status: 'active' as const,
          module_origin: imagesBase64.length > 0 ? ('ticket_vision' as const) : ('multiline_ai' as const),
          reimbursement_person: itemHasReimb ? it.reimbursementPerson?.trim() : undefined,
          reimbursement_amount: itemHasReimb ? itemReimbAmount : undefined,
          reimbursement_status: itemHasReimb ? ('pending' as const) : undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const newId = await db.expenses.add(expData);
        await syncToSheets('add', Number(newId), {
          fecha: multiDate,
          tipo: 'Gasto',
          categoria: catObj?.name || 'Varios',
          subcategoria: subObj?.name || 'General',
          comercio: (it.store || multiStore).trim(),
          detalle: it.detail.trim(),
          monto: numAmount,
          notas: (it.notes || '') + (itemHasReimb ? ` · [Devolución pendiente: ${it.reimbursementPerson} debe $${itemReimbAmount}]` : ''),
        });

        // Pausa secuencial para garantizar escritura ordenada en Google Sheets
        await new Promise(r => setTimeout(r, 450));
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem(DRAFT_KEY);
      }
      setDraftRestored(false);

      showToast(`✅ ¡${multiItems.length} gastos guardados y sincronizados individualmente en Sheets!`, 'success', 5000);
      setShowMultiModal(false);
      setImagesBase64([]);
      setText('');
      loadData();
    } catch (err: any) {
      showToast('❌ Error al guardar artículos: ' + err.message, 'error');
    } finally {
      setMultiSaving(false);
      setMultiSavingProgress(null);
    }
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
    if (exp.reimbursement_person) {
      setIsShared(true);
      setReimbursementPerson(exp.reimbursement_person || '');
      setReimbursementAmount(exp.reimbursement_amount ? exp.reimbursement_amount.toString() : '');
    } else {
      setIsShared(false);
      setReimbursementPerson('');
      setReimbursementAmount('');
    }
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
    if (exp.reimbursement_person) {
      setIsShared(true);
      setReimbursementPerson(exp.reimbursement_person || '');
      setReimbursementAmount(exp.reimbursement_amount ? exp.reimbursement_amount.toString() : '');
    } else {
      setIsShared(false);
      setReimbursementPerson('');
      setReimbursementAmount('');
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    const numAmount = parseNumericAmount(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('⚠️ Ingresá un monto válido mayor a $0', 'error');
      return;
    }
    if (!detail.trim() && !store.trim()) {
      showToast('⚠️ Completá al menos el Detalle o el Comercio', 'error');
      return;
    }

    const catId = selectedCatId || 0;
    const subId = selectedSubId || 0;

    const catObj = categories.find(c => c.id === catId);
    const subObj = catObj?.subcategories?.find((s: any) => s.id === subId);

    const numReimb = isShared && reimbursementAmount ? parseNumericAmount(reimbursementAmount) : undefined;
    const hasReimb = isShared && numReimb && numReimb > 0;

    const expenseData = {
      date,
      amount: numAmount,
      store: store.trim(),
      detail: detail.trim(),
      notes,
      category_id: catId,
      subcategory_id: subId,
      status: 'active' as const,
      module_origin: imagesBase64.length > 0 ? 'ticket_vision' as const : 'general' as const,
      reimbursement_person: hasReimb && reimbursementPerson ? reimbursementPerson.trim() : undefined,
      reimbursement_amount: hasReimb ? numReimb : undefined,
      reimbursement_status: hasReimb ? ('pending' as const) : undefined,
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
        notas: notes + (hasReimb ? ` · [Devolución pendiente: ${reimbursementPerson} debe $${numReimb}]` : ''),
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
        notas: notes + (hasReimb ? ` · [Devolución pendiente: ${reimbursementPerson} debe $${numReimb}]` : ''),
      });
      showToast('✅ Gasto guardado con éxito', 'success');
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(DRAFT_KEY);
    }
    setDraftRestored(false);

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setEditingExpenseId(null);
      if (!keepOpenMode) {
        setShowModal(false);
        setText('');
        setImagesBase64([]);
        setNotes('');
        setAmount('');
        setStore('');
        setDetail('');
        setSelectedCatId(null);
        setSelectedSubId(null);
        setIsShared(false);
        setReimbursementPerson('');
        setReimbursementAmount('');
      } else {
        setAmount('');
        setStore('');
        setDetail('');
        setImagesBase64([]);
        setNotes('');
        setSelectedCatId(null);
        setSelectedSubId(null);
        setIsShared(false);
        setReimbursementPerson('');
        setReimbursementAmount('');
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

  const activeCat = categories.find(c => c.id === selectedCatId);

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">⚡ Mis Finanzas</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={async () => {
            showToast('📡 Sincronizando con Google Sheets...', 'info', 2500);
            const res = await syncFromSheets((msg) => showToast(msg, 'info', 2500));
            if (res.imported > 0 || res.updated > 0) {
              showToast(`✅ Sincronizados: ${res.imported} nuevos, ${res.updated} actualizados`, 'success', 4500);
              loadData();
            } else {
              showToast('✅ Tu app ya está 100% al día con Google Sheets', 'success', 3000);
            }
          }}
          title="Descargar y sincronizar con Google Sheets"
        >
          🔄 Sincronizar
        </button>
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

      {/* Banner de Borrador Recuperado si existía contenido previo */}
      {draftRestored && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(99, 102, 241, 0.15)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12
        }}>
          <span style={{ color: 'var(--text-primary)' }}>
            📝 <strong>Borrador recuperado</strong> (lo que estabas anotando se mantuvo)
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleDiscardDraft}
            style={{ fontSize: 11, padding: '2px 8px', color: '#ef4444' }}
          >
            ✕ Descartar
          </button>
        </div>
      )}

      {/* Tabs de Selección de Modo */}
      <div className="chips-row" style={{ marginBottom: 14 }}>
        <button
          className={`chip${inputMode === 'ai' ? ' active' : ''}`}
          onClick={() => { setInputMode('ai'); }}
        >
          ✨ Cargar con IA / Foto / Texto
        </button>
        <button
          className={`chip${inputMode === 'form' ? ' active' : ''}`}
          onClick={() => { setInputMode('form'); }}
        >
          📝 Formulario Rápido (Comercio + Detalle + Monto)
        </button>
      </div>

      {/* MODO 1: Carga Asistida con IA / Foto / Texto */}
      {inputMode === 'ai' ? (
        <div className="card card-accent animate-in">
          <label className="form-label">Cargar gasto (Texto, Fotos o Pegar Imágenes)</label>

          {/* Carga de Múltiples Imágenes / Fotos de comprobantes o carrito */}
          <div style={{ marginBottom: 12 }}>
            {imagesBase64.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-light)' }}>
                    📸 {imagesBase64.length} foto{imagesBase64.length > 1 ? 's' : ''} adjuntada{imagesBase64.length > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setImagesBase64([])}
                    style={{ fontSize: 11, padding: '2px 8px', color: '#ef4444' }}
                  >
                    Borrar todas
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                  {imagesBase64.map((img, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-accent)', height: 90 }}>
                      <img
                        src={img}
                        alt={`Foto ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          background: 'rgba(239, 68, 68, 0.85)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: 20,
                          height: 20,
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <label className="btn btn-ghost" style={{ cursor: 'pointer', borderStyle: 'dashed', justifyContent: 'center', padding: '10px 4px', fontSize: 12 }}>
                📷 {imagesBase64.length > 0 ? '+ Tomar' : 'Tomar Foto'}
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
                🖼️ {imagesBase64.length > 0 ? '+ Galería' : 'Galería'}
                <input
                  id="ticket-gallery-input"
                  type="file"
                  accept="image/*"
                  multiple
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
          </div>

          {/* Input de Texto */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p style={{ fontSize: 12, color: 'var(--accent-light)', margin: 0, fontWeight: 600 }}>
              💡 Formato: <span style={{ color: 'var(--text-primary)' }}>Monto, Comercio, Detalle</span>
            </p>
            <button
              type="button"
              className="chip"
              style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.4)', color: 'var(--warning)' }}
              onClick={() => {
                if (!text.trim()) {
                  setText('no identificado');
                } else if (!text.toLowerCase().includes('no identificado')) {
                  setText(prev => prev.trim() + ', no identificado');
                }
                textareaRef.current?.focus();
              }}
            >
              ❓ No identificado
            </button>
          </div>
          <textarea
            ref={textareaRef}
            id="expense-text-input"
            className="form-textarea"
            placeholder={'Ej: "15000, Coto, Carnes" o "40000 hamburguesas sabri me debe 20000" o pegá varios renglones para múltiples gastos...'}
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

          {(() => {
            const currentTextLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return (
              <button
                id="analyze-btn"
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                onClick={handleAnalyze}
                disabled={loading || (!text.trim() && imagesBase64.length === 0)}
              >
                {loading
                  ? '🧠 Analizando con IA...'
                  : imagesBase64.length > 1
                  ? `✨ Analizar ${imagesBase64.length} Fotos con IA`
                  : imagesBase64.length === 1 && text
                  ? '✨ Analizar Texto + Foto'
                  : imagesBase64.length === 1
                  ? '📸 Leer Ticket con IA'
                  : currentTextLines.length > 1
                  ? `✨ Analizar ${currentTextLines.length} Gastos con IA`
                  : '✨ Analizar Texto con IA'}
              </button>
            );
          })()}
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
                type="text"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Detalle / Artículo (descripción)</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, padding: '2px 8px', color: 'var(--warning)' }}
                onClick={() => {
                  setStore('');
                  setDetail('Gasto no identificado');
                  setSelectedCatId(null);
                  setSelectedSubId(null);
                  showToast('❓ Marcado como gasto no identificado (Pendiente)', 'info', 2500);
                }}
              >
                ❓ No identificado
              </button>
            </div>
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

          {/* Gasto Compartido en Formulario Rápido */}
          <div style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', margin: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="direct-shared-check" style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                👥 Gasto compartido (Me deben plata)
              </label>
              <input
                type="checkbox"
                id="direct-shared-check"
                checked={isShared}
                onChange={e => {
                  setIsShared(e.target.checked);
                  if (e.target.checked && amount && !reimbursementAmount) {
                    const half = Math.round((parseFloat(amount) / 2) * 100) / 100;
                    if (!isNaN(half)) setReimbursementAmount(half.toString());
                  }
                }}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
            </div>

            {isShared && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 11 }}>Persona que te debe</label>
                  <input
                    className="form-input"
                    value={reimbursementPerson}
                    onChange={e => setReimbursementPerson(e.target.value)}
                    placeholder="Ej: Sabri, Juan..."
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>Monto a devolver ($)</label>
                    {amount && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, padding: '1px 4px', color: 'var(--accent-light)' }}
                        onClick={() => {
                          const half = Math.round((parseFloat(amount) / 2) * 100) / 100;
                          if (!isNaN(half)) setReimbursementAmount(half.toString());
                        }}
                      >
                        50%
                      </button>
                    )}
                  </div>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="decimal"
                    value={reimbursementAmount}
                    onChange={e => setReimbursementAmount(e.target.value)}
                    placeholder="0"
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            id="save-direct-btn"
            className="btn btn-success"
            style={{ marginTop: 8 }}
            onClick={handleSave}
            disabled={(!detail.trim() && !store.trim()) || !amount.trim()}
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

                {/* Badge de Reintegro / Gasto Compartido */}
                {exp.reimbursement_person && exp.reimbursement_status === 'pending' && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 12
                  }}>
                    <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                      ⏳ {exp.reimbursement_person} te debe {formatARS(exp.reimbursement_amount || 0)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      style={{ fontSize: 11, padding: '3px 8px', height: 'auto' }}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await settleExpenseReimbursement(exp.id!);
                        if (ok) {
                          showToast(`🎉 ¡Cobro de ${formatARS(exp.reimbursement_amount)} de ${exp.reimbursement_person} registrado!`, 'success', 4000);
                          loadData();
                        }
                      }}
                    >
                      ✅ Cobrado
                    </button>
                  </div>
                )}

                {exp.reimbursement_person && exp.reimbursement_status === 'settled' && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 11,
                    color: 'var(--positive)',
                    fontWeight: 600
                  }}>
                    <span>✅ Devolución de {exp.reimbursement_person} ({formatARS(exp.reimbursement_amount || 0)}) cobrada</span>
                  </div>
                )}

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

      {/* Modal de confirmación / Carga Individual */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); setText(''); setImagesBase64([]); }} title="💾 Confirmar o Cargar Gasto">
        {saved ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <p style={{ color: 'var(--positive)', fontWeight: 700, marginTop: 8 }}>
              {keepOpenMode ? '¡Gasto guardado! Listo para el siguiente...' : '¡Gasto guardado con éxito!'}
            </p>
          </div>
        ) : (
          <>
            {imagesBase64.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <img src={imagesBase64[0]} alt="Ticket" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Monto ($) (*Requerido)</label>
                <input id="modal-amount" className="form-input" type="text" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" inputMode="decimal" />
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

            {/* Gasto Compartido en Modal de Confirmación */}
            <div style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', margin: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="modal-shared-check" style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  👥 Gasto compartido (Me deben plata)
                </label>
                <input
                  type="checkbox"
                  id="modal-shared-check"
                  checked={isShared}
                  onChange={e => {
                    setIsShared(e.target.checked);
                    if (e.target.checked && amount && !reimbursementAmount) {
                      const half = Math.round((parseFloat(amount) / 2) * 100) / 100;
                      if (!isNaN(half)) setReimbursementAmount(half.toString());
                    }
                  }}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                />
              </div>

              {isShared && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 11 }}>Persona que te debe</label>
                    <input
                      className="form-input"
                      value={reimbursementPerson}
                      onChange={e => setReimbursementPerson(e.target.value)}
                      placeholder="Ej: Sabri, Juan..."
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>Monto a devolver ($)</label>
                      {amount && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, padding: '1px 4px', color: 'var(--accent-light)' }}
                          onClick={() => {
                            const half = Math.round((parseFloat(amount) / 2) * 100) / 100;
                            if (!isNaN(half)) setReimbursementAmount(half.toString());
                          }}
                        >
                          50%
                        </button>
                      )}
                    </div>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      value={reimbursementAmount}
                      onChange={e => setReimbursementAmount(e.target.value)}
                      placeholder="0"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                </div>
              )}
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
              disabled={(!detail.trim() && !store.trim()) || !amount.trim()}
            >
              💾 Guardar Gasto
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { setShowModal(false); resetForm(); setText(''); setImagesBase64([]); }}>Cancelar</button>
          </>
        )}
      </Modal>

      {/* Modal de Desglose de Compra Multi-Artículo */}
      <Modal
        isOpen={showMultiModal}
        onClose={() => { setShowMultiModal(false); setImagesBase64([]); setText(''); }}
        title={`🛒 Desglose de Compra (${multiItems.length} artículos)`}
      >
        <div style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
          {/* Header con Comercio y Fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Comercio / Plataforma</label>
              <input
                className="form-input"
                value={multiStore}
                onChange={e => setMultiStore(e.target.value)}
                placeholder="Ej: MercadoLibre, Coto..."
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Fecha de Compra</label>
              <input
                className="form-input"
                type="date"
                value={multiDate}
                onChange={e => setMultiDate(e.target.value)}
              />
            </div>
          </div>

          {/* Alerta de cantidad esperada si aplica */}
          {multiCartExpected && multiCartExpected !== multiItems.length && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#f59e0b',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>⚠️</span>
              <span>
                La captura indica <strong>Carrito ({multiCartExpected})</strong> pero se extrajeron <strong>{multiItems.length} artículos</strong>. Podés guardar estos o adjuntar más fotos.
              </span>
            </div>
          )}

          {/* Banner de Promoción / Descuento detectado o manual */}
          {multiDiscount && multiDiscount > 0 ? (
            <div style={{
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid var(--accent)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light)' }}>
                  🎁 {multiDiscountDesc || 'Promoción / Descuento'}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--positive)' }}>
                  -{formatARS(multiDiscount)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Neto Real a Pagar:</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatARS(Math.max(0, (multiTotalDetected || multiItems.reduce((acc, it) => acc + (parseFloat(it.amount as any) || 0), 0)) - multiDiscount))}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 11, padding: '5px 12px' }}
                  onClick={() => handleProrateDiscount(multiDiscount, multiDiscountDesc)}
                >
                  ⚡ Prorratear descuento en los productos
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '5px 12px', background: 'rgba(255,255,255,0.06)' }}
                  onClick={() => handleAddDiscountItem(multiDiscount, multiDiscountDesc)}
                >
                  ➕ Agregar como fila (-{formatARS(multiDiscount)})
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '5px 8px', color: '#ef4444' }}
                  onClick={() => { setMultiDiscount(null); setMultiDiscountDesc(''); }}
                >
                  ✕ Quitar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 10, textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, padding: '3px 8px', color: 'var(--accent-light)' }}
                onClick={() => {
                  const input = window.prompt('Ingresá el descuento o promo (ej: "20% tope 24000" o "24000"):');
                  if (input) {
                    const currentSum = multiItems.reduce((acc, it) => acc + (parseFloat(it.amount as any) || 0), 0);
                    const calc = parseDiscount(input, multiTotalDetected || currentSum);
                    if (calc.discountAmount > 0) {
                      setMultiDiscount(calc.discountAmount);
                      setMultiDiscountDesc(calc.discountDesc || input);
                      showToast(`🎁 Descuento de ${formatARS(calc.discountAmount)} detectado`, 'success', 3000);
                    } else {
                      showToast('⚠️ No se reconoció el monto o porcentaje de descuento', 'info');
                    }
                  }
                }}
              >
                🎁 + Aplicar Descuento / Promo (Tope)
              </button>
            </div>
          )}

          {/* Barra de Conciliación Matemática */}
          {(() => {
            const currentSum = multiItems.reduce((acc, it) => acc + (parseFloat(it.amount as any) || 0), 0);
            const targetTotal = multiTotalDetected || currentSum;
            const diff = Math.round((targetTotal - currentSum) * 100) / 100;
            const hasDiff = Math.abs(diff) >= 0.01;

            return (
              <div style={{
                background: 'var(--bg-elevated)',
                border: `1px solid ${hasDiff ? 'rgba(99, 102, 241, 0.4)' : 'rgba(34, 197, 94, 0.3)'}`,
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasDiff ? 8 : 0 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Suma de artículos</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatARS(currentSum)}
                    </div>
                  </div>
                  {multiTotalDetected && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total a Pagar</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-light)' }}>
                        {formatARS(multiTotalDetected)}
                      </div>
                    </div>
                  )}
                </div>

                {hasDiff && (
                  <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 11, color: '#a5b4fc', margin: '0 0 8px 0', fontWeight: 600 }}>
                      Diferencia: {diff > 0 ? `+${formatARS(diff)}` : `-${formatARS(Math.abs(diff))}`} (cupones, envíos o descuentos)
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={handleProrateDifference}
                      >
                        ⚡ Prorratear diferencia
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.05)' }}
                        onClick={handleAddAdjustmentItem}
                      >
                        ➕ Fila de ajuste ({diff > 0 ? `+${formatARS(diff)}` : `-${formatARS(Math.abs(diff))}`})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Lista de Artículos Desglosados */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {multiItems.map((item, idx) => {
              const itemCat = categories.find(c => c.id === item.categoryId);
              return (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <input
                        className="form-input"
                        style={{ fontSize: 13, fontWeight: 700, padding: '6px 10px' }}
                        value={item.detail}
                        onChange={e => {
                          const val = e.target.value;
                          setMultiItems(prev => prev.map((it, i) => i === idx ? { ...it, detail: val } : it));
                        }}
                        placeholder="Descripción del producto"
                      />
                    </div>
                    <div style={{ width: 110 }}>
                      <input
                        className="form-input"
                        style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-light)', textAlign: 'right', padding: '6px 8px' }}
                        type="text"
                        inputMode="decimal"
                        value={item.amount}
                        onChange={e => {
                          const val = e.target.value;
                          setMultiItems(prev => prev.map((it, i) => i === idx ? { ...it, amount: val as any } : it));
                        }}
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setMultiItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: 16,
                        padding: '4px 6px',
                        lineHeight: 1
                      }}
                      title="Quitar artículo"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Selector rápido de categoría para este ítem */}
                  <div>
                    <div className="chips-row" style={{ gap: 4 }}>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`chip${item.categoryId === cat.id ? ' active' : ''}`}
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => {
                            setMultiItems(prev => prev.map((it, i) => i === idx ? {
                              ...it,
                              categoryId: cat.id,
                              subcategoryId: cat.subcategories[0]?.id || 1
                            } : it));
                          }}
                        >
                          {cat.icon} {cat.name}
                        </button>
                      ))}
                    </div>

                    {itemCat && itemCat.subcategories?.length > 0 && (
                      <div className="chips-row" style={{ gap: 4, marginTop: 4, paddingLeft: 6 }}>
                        {itemCat.subcategories.map((sub: any) => (
                          <button
                            key={sub.id}
                            type="button"
                            className={`chip${item.subcategoryId === sub.id ? ' active' : ''}`}
                            style={{ fontSize: 10, padding: '2px 6px', background: item.subcategoryId === sub.id ? 'var(--accent-light)' : 'rgba(255,255,255,0.05)', color: item.subcategoryId === sub.id ? '#000' : 'var(--text-secondary)' }}
                            onClick={() => {
                              setMultiItems(prev => prev.map((it, i) => i === idx ? {
                                ...it,
                                subcategoryId: sub.id
                              } : it));
                            }}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Gasto compartido opcional por ítem */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={!!(item.reimbursementPerson || item.reimbursementAmount)}
                          onChange={e => {
                            const active = e.target.checked;
                            setMultiItems(prev => prev.map((it, i) => i === idx ? {
                              ...it,
                              reimbursementPerson: active ? 'Sabri' : undefined,
                              reimbursementAmount: active ? (Math.round(((parseFloat(it.amount as any) || 0) / 2) * 100) / 100) : undefined,
                            } : it));
                          }}
                          style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                        />
                        👥 Compartido
                      </label>
                      {!!(item.reimbursementPerson || item.reimbursementAmount) && (
                        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                          <input
                            className="form-input"
                            style={{ fontSize: 11, padding: '2px 6px', height: 26, flex: 1 }}
                            placeholder="Persona (ej: Sabri)"
                            value={item.reimbursementPerson || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setMultiItems(prev => prev.map((it, i) => i === idx ? { ...it, reimbursementPerson: val } : it));
                            }}
                          />
                          <input
                            className="form-input"
                            style={{ fontSize: 11, padding: '2px 6px', height: 26, width: 85 }}
                            type="text"
                            inputMode="decimal"
                            placeholder="$ a devolver"
                            value={item.reimbursementAmount ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setMultiItems(prev => prev.map((it, i) => i === idx ? { ...it, reimbursementAmount: val as any } : it));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginBottom: 16, borderStyle: 'dashed' }}
            onClick={() => {
              const newItem: ParsedItem = {
                detail: 'Nuevo producto',
                amount: 0,
                store: multiStore,
                categoryId: categories[0]?.id || 1,
                subcategoryId: categories[0]?.subcategories[0]?.id || 1,
              };
              setMultiItems(prev => [...prev, newItem]);
            }}
          >
            ➕ Agregar otro producto manual
          </button>

          <button
            type="button"
            className="btn btn-success"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700 }}
            onClick={handleSaveMultiItems}
            disabled={multiSaving || multiItems.length === 0}
          >
            {multiSaving
              ? (multiSavingProgress || '⏳ Guardando...')
              : `💾 Guardar los ${multiItems.length} Gastos Individuales (${formatARS(multiItems.reduce((acc, it) => acc + (parseFloat(it.amount as any) || 0), 0))})`}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => { setShowMultiModal(false); setImagesBase64([]); setText(''); }}
          >
            Cancelar
          </button>
        </div>
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
