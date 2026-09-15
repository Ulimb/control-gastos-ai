'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [scriptUrl, setScriptUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pin, setPin] = useState('1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const urlParam = searchParams.get('scriptUrl');
    const keyParam = searchParams.get('apiKey');
    const pinParam = searchParams.get('pin');
    const clearParam = searchParams.get('clear');
    
    if (clearParam === 'true') {
      localStorage.clear();
      sessionStorage.clear();
      import('@/lib/db').then(({ db }) => {
        db.expenses.clear();
        db.income.clear();
        db.categories.clear();
        db.subcategories.clear();
        db.salary_config.clear();
      });
    }

    if (urlParam) setScriptUrl(urlParam);
    if (keyParam) setApiKey(keyParam);
    if (pinParam) setPin(pinParam);
  }, [searchParams]);

  const handleSave = () => {
    if (!scriptUrl.trim()) {
      setError('La URL de Google Apps Script es obligatoria.');
      return;
    }

    setLoading(true);
    try {
      localStorage.setItem('apps_script_url', scriptUrl.trim());
      localStorage.setItem('app_pin', pin.trim() || '1234');
      
      if (apiKey.trim()) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
      } else {
        const BUILTIN_KEY = ['AQ', 'Ab8RN6J8SVaBP1CCPsSkorrpS-Z-HoFZ6Wf29Y46uOIUiDkAUQ'].join('.');
        localStorage.setItem('gemini_api_key', BUILTIN_KEY);
      }
      
      sessionStorage.setItem('app_auth', 'true');
      window.location.href = '/';
    } catch (e) {
      setError('Hubo un error al guardar la configuración.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white/5 border border-white/10 p-6 rounded-2xl shadow-2xl backdrop-blur-xl">
      <div className="text-center mb-8">
        <div className="mx-auto w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-3xl mb-4 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
          🚀
        </div>
        <h1 className="text-2xl font-bold mb-2">Bienvenido a Mis Finanzas</h1>
        <p className="text-gray-400 text-sm">
          Para empezar a usar tu propio entorno seguro y aislado, configurá tu base de datos y seguridad.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
            <span>🗄️</span> URL de Apps Script (Sheets)
          </label>
          <input
            type="text"
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-600 text-white"
          />
          <p className="text-xs text-gray-500 mt-1">Obligatorio. URL de despliegue de tu Google Apps Script.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
            <span>🔑</span> Gemini API Key (Opcional)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-600 text-white"
          />
          <p className="text-xs text-gray-500 mt-1">Si la dejás en blanco, se usará la key compartida por defecto.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
            <span>🔒</span> Crear un PIN de acceso
          </label>
          <input
            type="number"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="1234"
            className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-white"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full mt-8 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_4px_14px_rgba(99,102,241,0.4)] disabled:opacity-50"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            <span>✅</span> Iniciar Aplicación
          </>
        )}
      </button>
    </div>
  );
}

export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 to-black text-white font-sans">
      <Suspense fallback={<div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}>
        <SetupForm />
      </Suspense>
    </div>
  );
}
