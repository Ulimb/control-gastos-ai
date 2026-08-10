'use client';

import Link from 'next/link';

const MORE_ITEMS = [
  { href: '/medico', icon: '🏥', label: 'Médico', desc: 'Consultas y gastos de salud' },
  { href: '/compras', icon: '🛍️', label: 'Compras', desc: 'Garantías y cuotas' },
  { href: '/prestamos', icon: '💸', label: 'Préstamos', desc: 'Dinero prestado a personas' },
  { href: '/reintegros', icon: '🔄', label: 'Reintegros', desc: 'Devoluciones y reembolsos' },
  { href: '/categorias', icon: '🏷️', label: 'Categorías', desc: 'Gestionar categorías y subcategorías' },
  { href: '/configuracion', icon: '⚙️', label: 'Configuración', desc: 'API Key, backup de datos' },
];

export default function MasPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">☰ Más opciones</h1>
      </div>

      <div className="card">
        {MORE_ITEMS.map((item, idx) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 0',
              borderBottom: idx < MORE_ITEMS.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none',
            }}
          >
            <div className="list-item-icon" style={{ background: 'var(--accent-dim)', fontSize: 22 }}>
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{item.desc}</div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
