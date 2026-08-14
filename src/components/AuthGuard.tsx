'use client';

import { useState, useEffect } from 'react';

const DEFAULT_PIN = '1234';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [savedPin, setSavedPin] = useState(DEFAULT_PIN);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pin = localStorage.getItem('app_pin') || DEFAULT_PIN;
      setSavedPin(pin);
      const authed = sessionStorage.getItem('app_auth') === 'true';
      setIsAuthenticated(authed);
    }
  }, []);

  const handleDigit = (digit: string) => {
    if (pinInput.length >= 8) return;
    const next = pinInput + digit;
    setPinInput(next);
    setErrorMsg('');

    // Si coincide exactamente con el PIN guardado
    if (next === savedPin) {
      sessionStorage.setItem('app_auth', 'true');
      setIsAuthenticated(true);
      setPinInput('');
    }
  };

  const handleDeleteDigit = () => {
    setPinInput(prev => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === savedPin) {
      sessionStorage.setItem('app_auth', 'true');
      setIsAuthenticated(true);
      setPinInput('');
    } else {
      setErrorMsg('❌ PIN / Contraseña incorrecta');
      setPinInput('');
    }
  };

  // Mientras verifica el estado inicial en cliente
  if (isAuthenticated === null) {
    return <div style={{ background: '#0A0F1E', minHeight: '100vh' }} />;
  }

  // Si no está autenticado, muestra la pantalla de bloqueo PIN
  if (!isAuthenticated) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'linear-gradient(145deg, #0A0F1E 0%, #060913 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 24,
          padding: '32px 24px',
          maxWidth: 360,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px 0', color: '#fff' }}>
            Mis Finanzas
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px 0' }}>
            Ingresá tu PIN para acceder a tu app
          </p>

          <form onSubmit={handleLoginSubmit}>
            {/* Indicador de dígitos */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid #6366f1',
                    background: pinInput.length > idx ? '#6366f1' : 'transparent',
                    transition: 'all 0.15s ease'
                  }}
                />
              ))}
            </div>

            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                {errorMsg}
              </p>
            )}

            {/* Teclado numérico táctil */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigit(num)}
                  style={{
                    padding: '14px 0',
                    fontSize: 22,
                    fontWeight: 700,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handleDigit('0')}
                style={{
                  padding: '14px 0',
                  fontSize: 22,
                  fontWeight: 700,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                0
              </button>
              <button
                type="button"
                onClick={handleDeleteDigit}
                style={{
                  padding: '14px 0',
                  fontSize: 18,
                  fontWeight: 700,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                  cursor: 'pointer',
                }}
              >
                ⌫
              </button>
            </div>

            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              PIN por defecto: <strong style={{ color: '#cbd5e1' }}>1234</strong> (cambiable en Configuración)
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
}

export function logoutApp() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('app_auth');
    window.location.reload();
  }
}
