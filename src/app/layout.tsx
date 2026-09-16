import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';
import { AuthGuard } from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: 'Mis Finanzas',
  description: 'Control inteligente de gastos personales con IA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mis Finanzas',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0A0F1E',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Kill-switch: elimina todos los service workers y cachés previos */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
              for (let reg of registrations) {
                reg.update();
                reg.unregister();
              }
            });
            if ('caches' in window) {
              caches.keys().then(function(names) {
                for (let name of names) { caches.delete(name); }
              });
            }
          }
        `}} />
      </head>
      <body>
        <AuthGuard>
          <div className="app-shell">
            <main className="page-content">
              {children}
            </main>
            <BottomNav />
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}
