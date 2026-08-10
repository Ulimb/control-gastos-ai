'use client';

import { useState, useEffect } from 'react';
import { db, formatARS, getCategoriesWithSubs } from '@/lib/db';
import type { Purchase } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function ComprasPage() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const [productName, setProductName] = useState('');
  const [store, setStore] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('1');
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);
    if (!selectedCatId && cats.length > 0) {
      setSelectedCatId(cats[0].id || null);
      setSelectedSubId(cats[0].subcategories[0]?.id || null);
    }

    const today = new Date().toISOString().split('T')[0];
    // Expirar garantías
    await db.purchases
      .where('status').equals('active')
      .and(p => !!(p.warranty_until && p.warranty_until < today))
      .modify({ status: 'warranty_expired' });

    const items = await db.purchases.orderBy('purchase_date').reverse().toArray();
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
    setPurchases(items.map(p => ({ ...p, category: catMap[p.category_id] })));
  };

  const handleAdd = async () => {
    if (!productName || !totalAmount || !selectedCatId || !selectedSubId) return;
    const total = parseFloat(totalAmount);
    const inst = parseInt(installments) || 1;
    const warMonths = parseInt(warrantyMonths) || 0;

    const warUntil = new Date(purchaseDate);
    warUntil.setMonth(warUntil.getMonth() + warMonths);

    await db.purchases.add({
      product_name: productName, store,
      purchase_date: purchaseDate, total_amount: total,
      installments_count: inst,
      installment_amount: inst > 1 ? total / inst : total,
      warranty_months: warMonths,
      warranty_until: warMonths > 0 ? warUntil.toISOString().split('T')[0] : undefined,
      category_id: selectedCatId, subcategory_id: selectedSubId,
      status: 'active', created_at: new Date().toISOString(),
    });

    // Si no es en cuotas, registrar como gasto directo
    if (inst === 1) {
      await db.expenses.add({
        date: purchaseDate, amount: total,
        detail: `[Compra] ${productName}`,
        category_id: selectedCatId, subcategory_id: selectedSubId,
        status: 'active', module_origin: 'purchase',
      });
    }

    setProductName(''); setStore(''); setTotalAmount(''); setInstallments('1'); setWarrantyMonths('12');
    setShowAdd(false);
    loadData();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">🛍️ Compras</h1>
          <p className="page-subtitle">{purchases.length} compras registradas</p>
        </div>
        <button id="add-purchase-btn" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Nueva</button>
      </div>

      {purchases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛍️</div>
          <p className="empty-state-text">No hay compras registradas</p>
        </div>
      ) : (
        purchases.map(p => (
          <div key={p.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{p.product_name}</div>
              <span className={`badge ${p.status === 'active' ? 'badge-active' : p.status === 'warranty_expired' ? 'badge-settled' : 'badge-settled'}`}>
                {p.status === 'active' ? 'Activo' : p.status === 'warranty_expired' ? 'Garantía vencida' : 'Devuelto'}
              </span>
            </div>
            {p.store && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>🏪 {p.store}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {p.installments_count > 1 ? `${p.installments_count} cuotas de ${formatARS(p.installment_amount || 0)}` : 'Pago único'}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--negative)' }}>{formatARS(p.total_amount)}</span>
            </div>
            {p.warranty_until && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                🛡️ Garantía hasta: {p.warranty_until}
              </div>
            )}
          </div>
        ))
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nueva Compra">
        <div className="form-group">
          <label className="form-label">Producto</label>
          <input id="product-name" className="form-input" value={productName} onChange={e => setProductName(e.target.value)} placeholder="Ej: Heladera Samsung" />
        </div>
        <div className="form-group">
          <label className="form-label">Tienda</label>
          <input id="store-name" className="form-input" value={store} onChange={e => setStore(e.target.value)} placeholder="Ej: Frávega, MercadoLibre" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha de compra</label>
          <input id="purchase-date" className="form-input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Monto total ($)</label>
          <input id="purchase-amount" className="form-input" type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Cuotas</label>
            <input id="installments" className="form-input" type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Garantía (meses)</label>
            <input id="warranty" className="form-input" type="number" min="0" value={warrantyMonths} onChange={e => setWarrantyMonths(e.target.value)} />
          </div>
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
        <button id="save-purchase-btn" className="btn btn-primary" onClick={handleAdd} disabled={!productName || !totalAmount}>💾 Guardar compra</button>
      </Modal>
    </>
  );
}
