'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { db } from '@/lib/db';

const BUILTIN_KEY = ['AQ', 'Ab8RN6J8SVaBP1CCPsSkorrpS-Z-HoFZ6Wf29Y46uOIUiDkAUQ'].join('.');
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbzjFpwwpOvKFTTTHb9Quf5J6MgTDCBF-pHQLFgBYIrQogBNqMSIvdvyrGg5oQ31TyaRaw/exec';

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      if (typeof window !== 'undefined') {
        const url = localStorage.getItem('apps_script_url');
        
        if (!url) {
          if (pathname !== '/setup') {
            router.push('/setup');
          } else {
            setIsReady(true);
          }
        } else {
          setIsReady(true);
        }
      }
    };

    checkSetup();
  }, [pathname, router]);

  if (!isReady) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'linear-gradient(145deg, #0A0F1E 0%, #060913 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />
      </div>
    );
  }

  return <>{children}</>;
}
