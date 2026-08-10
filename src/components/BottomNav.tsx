'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', icon: '⚡', label: 'Inicio' },
  { href: '/resumen', icon: '📊', label: 'Resumen' },
  { href: '/gastos-fijos', icon: '📌', label: 'Fijos' },
  { href: '/ingresos', icon: '💼', label: 'Ingresos' },
  { href: '/mas', icon: '☰', label: 'Más' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navegación principal">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive ? ' active' : ''}`}
            aria-label={item.label}
          >
            <span className="nav-icon" role="img" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
