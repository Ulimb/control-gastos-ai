'use client';

import { useState, useEffect } from 'react';
import { db, getCategoriesWithSubs } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function CategoriasPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showAddCat, setShowAddCat] = useState(false);
  const [showAddSub, setShowAddSub] = useState<number | null>(null);

  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('📦');
  const [catColor, setCatColor] = useState('#6366F1');
  const [subName, setSubName] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const cats = await getCategoriesWithSubs();
    setCategories(cats);
  };

  const handleAddCat = async () => {
    if (!catName.trim()) return;
    const maxOrder = await db.categories.count();
    await db.categories.add({
      name: catName.trim(),
      icon: catIcon || '📦',
      color: catColor || '#6366F1',
      sort_order: maxOrder + 1,
    });
    setCatName('');
    setShowAddCat(false);
    loadData();
  };

  const handleAddSub = async (catId: number) => {
    if (!subName.trim()) return;
    const count = await db.subcategories.where('category_id').equals(catId).count();
    await db.subcategories.add({
      category_id: catId,
      name: subName.trim(),
      sort_order: count + 1,
    });
    setSubName('');
    setShowAddSub(null);
    loadData();
  };

  const ICONS = ['🍔', '🚗', '🏠', '💡', '🏥', '🎬', '👕', '💪', '🎉', '📚', '💻', '💰', '🐶', '✈️', '🛒', '📦'];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏷️ Categorías</h1>
          <p className="page-subtitle">{categories.length} categorías configuradas</p>
        </div>
        <button id="add-category-btn" className="btn btn-primary btn-sm" onClick={() => setShowAddCat(true)}>+ Nueva</button>
      </div>

      <div className="card">
        {categories.map(cat => (
          <div key={cat.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, background: cat.color + '22', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cat.icon}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{cat.name}</span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setShowAddSub(cat.id); setSubName(''); }}
              >
                + Subcategoría
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 46 }}>
              {cat.subcategories.map((sub: any) => (
                <span key={sub.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {sub.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Nueva categoría */}
      <Modal isOpen={showAddCat} onClose={() => setShowAddCat(false)} title="Nueva Categoría">
        <div className="form-group">
          <label className="form-label">Nombre de la categoría</label>
          <input id="cat-name-input" className="form-input" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Ej: Mascotas, Viajes" />
        </div>

        <div className="form-group">
          <label className="form-label">Ícono</label>
          <div className="chips-row">
            {ICONS.map(icon => (
              <button key={icon} className={`chip${catIcon === icon ? ' active' : ''}`} onClick={() => setCatIcon(icon)}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Color de acento</label>
          <input id="cat-color-input" type="color" className="form-input" value={catColor} onChange={e => setCatColor(e.target.value)} style={{ height: 44, padding: 4 }} />
        </div>

        <button id="save-cat-btn" className="btn btn-primary" onClick={handleAddCat} disabled={!catName.trim()}>💾 Crear Categoría</button>
      </Modal>

      {/* Modal: Nueva subcategoría */}
      <Modal isOpen={showAddSub !== null} onClose={() => setShowAddSub(null)} title="Nueva Subcategoría">
        <div className="form-group">
          <label className="form-label">Nombre de la subcategoría</label>
          <input id="sub-name-input" className="form-input" value={subName} onChange={e => setSubName(e.target.value)} placeholder="Ej: Veterinaria, Alimento" />
        </div>
        <button id="save-sub-btn" className="btn btn-primary" onClick={() => handleAddSub(showAddSub!)} disabled={!subName.trim()}>💾 Crear Subcategoría</button>
      </Modal>
    </>
  );
}
