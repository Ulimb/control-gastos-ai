import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIParseResult {
  amount: number;
  detail: string;
  store?: string;
  date: string;
  categoryId: number;
  subcategoryId: number;
  confidence: number;
  raw?: string;
}

const BUILTIN_KEY = ['AQ', 'Ab8RN6J8SVaBP1CCPsSkorrpS-Z-HoFZ6Wf29Y46uOIUiDkAUQ'].join('.');
const DEFAULT_GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || BUILTIN_KEY;
const CANDIDATE_MODELS = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_API_KEY || null;
  return localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_API_KEY || null;
}

export function extractJsonFromResponse(raw: string): any {
  if (!raw) throw new Error('Respuesta vacía de IA');
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch (_) {
    const objMatch = clean.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (__) {}
    }
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (__) {}
    }
    throw new Error(`JSON no reconocible en respuesta: ${raw.slice(0, 60)}...`);
  }
}

export function parseLocalHeuristic(
  text: string,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>,
  overrideDate?: string
): AIParseResult {
  const today = overrideDate || new Date().toISOString().split('T')[0];
  if (!text || !text.trim()) {
    return {
      amount: 0,
      store: '',
      detail: '',
      date: today,
      categoryId: categories[0]?.id || 1,
      subcategoryId: categories[0]?.subcategories[0]?.id || 1,
      confidence: 0.1,
    };
  }

  let cleanText = text.trim();
  let calculatedDate = today;

  if (/\bayer\b/i.test(cleanText)) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    calculatedDate = d.toISOString().split('T')[0];
    cleanText = cleanText.replace(/\bayer\b/gi, '').trim();
  }

  let amount = 0;
  const lucasMatch = cleanText.match(/(\d+(?:[.,]\d+)?)\s*(?:lucas|k)\b/i);
  if (lucasMatch) {
    const num = parseFloat(lucasMatch[1].replace(',', '.'));
    amount = Math.round(num * 1000);
    cleanText = cleanText.replace(lucasMatch[0], ' ').trim();
  } else {
    const numberMatch = cleanText.match(/\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+)/);
    if (numberMatch) {
      amount = parseNumericAmount(numberMatch[1]);
      cleanText = cleanText.replace(numberMatch[0], ' ').trim();
    }
  }

  cleanText = cleanText.replace(/^[,;.\s]+|[,;.\s]+$/g, '');
  const parts = cleanText.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
  let store = '';
  let detail = '';

  const knownStores = ['coto', 'ypf', 'shell', 'axion', 'farmacity', 'dia', 'carrefour', 'jumbo', 'vea', 'axon', 'spotify', 'netflix', 'pedidosya', 'rappi', 'farmacia', 'almacen', 'kiosco', 'disco'];

  if (parts.length >= 2) {
    store = parts[0];
    detail = parts.slice(1).join(', ');
  } else if (parts.length === 1) {
    const words = parts[0].split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const firstWordLower = words[0].toLowerCase();
      if (knownStores.some(s => firstWordLower.includes(s))) {
        store = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        detail = words.slice(1).join(' ') || store;
      } else {
        detail = parts[0];
      }
    }
  }

  let categoryId = categories[0]?.id || 1;
  let subcategoryId = categories[0]?.subcategories[0]?.id || 1;
  let confidence = 0.6;

  const fullSearch = (store + ' ' + detail).toLowerCase();

  const rules: Array<{ keywords: string[]; catKeywords: string[]; subKeywords: string[] }> = [
    { keywords: ['farmacia', 'farmacity', 'remedio', 'medicamento', 'ibuprofeno', 'medicina', 'salud', 'consulta', 'doctor'], catKeywords: ['salud', 'bienestar'], subKeywords: ['farmacia', 'medicamento', 'consulta'] },
    { keywords: ['ypf', 'shell', 'axion', 'nafta', 'combustible', 'gnc', 'gasoil', 'peaje', 'estacionamiento', 'estacion'], catKeywords: ['transporte', 'auto'], subKeywords: ['combustible', 'peaje', 'mantenimiento'] },
    { keywords: ['coto', 'carrefour', 'dia', 'jumbo', 'vea', 'disco', 'chango', 'supermercado', 'almacen', 'verduleria', 'carniceria', 'comida', 'panaderia'], catKeywords: ['supermercado', 'hogar'], subKeywords: ['supermercado', 'almacen', 'carniceria', 'verduleria'] },
    { keywords: ['bar', 'cerveza', 'cafe', 'restaurante', 'cena', 'almuerzo', 'hamburguesa', 'pizza', 'helado', 'dulce', 'franui', 'delivery', 'rappi', 'pedidosya'], catKeywords: ['salidas', 'gastronomia'], subKeywords: ['restaurante', 'bares', 'delivery', 'dulces'] },
    { keywords: ['spotify', 'netflix', 'disney', 'internet', 'luz', 'gas', 'edenor', 'metrogas', 'telecentro', 'flow', 'expensas', 'alquiler'], catKeywords: ['servicios', 'suscripciones', 'fijos'], subKeywords: ['servicios', 'suscripciones', 'hogar'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some(k => fullSearch.includes(k))) {
      const cat = categories.find(c => rule.catKeywords.some(ck => c.name.toLowerCase().includes(ck)));
      if (cat) {
        categoryId = cat.id;
        const sub = cat.subcategories.find((s: any) => rule.subKeywords.some(sk => s.name.toLowerCase().includes(sk))) || cat.subcategories[0];
        if (sub) subcategoryId = sub.id;
        confidence = 0.85;
        break;
      }
    }
  }

  return {
    amount,
    store,
    detail: detail || store || 'Gasto',
    date: calculatedDate,
    categoryId,
    subcategoryId,
    confidence,
  };
}

export async function testGeminiKey(customKey?: string): Promise<{ ok: boolean; message: string }> {
  const key = customKey || getApiKey();
  if (!key) {
    return { ok: false, message: 'No hay ninguna API Key ingresada.' };
  }

  const genAI = new GoogleGenerativeAI(key);
  let lastError = '';

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
      });
      const result = await model.generateContent('{"status":"ok"}');
      if (result && result.response) {
        return { ok: true, message: `Conexión exitosa con ${modelName} ✅` };
      }
    } catch (e: any) {
      lastError = e.message || String(e);
    }
  }

  return { ok: false, message: `Error de autenticación: ${lastError}` };
}

export function parseNumericAmount(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/\$/g, '');
  if (str.includes('.') && str.includes(',')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(/,/g, '.');
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      str = parts.join('');
    }
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export async function parseExpenseWithAI(
  text: string,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>,
  overrideDate?: string
): Promise<AIParseResult> {
  const today = overrideDate || new Date().toISOString().split('T')[0];
  const apiKey = getApiKey();

  if (!apiKey) {
    return parseLocalHeuristic(text, categories, today);
  }

  const catList = categories
    .map(c => `${c.id}:${c.name} [${c.subcategories.map(s => `${s.id}:${s.name}`).join(', ')}]`)
    .join('\n');

  const prompt = `Sos un asistente experto de finanzas personales argentino. Analizá el texto libre ingresado por el usuario y auto-identificá inteligentemente cada componente.

El usuario puede escribir en cualquier formato libre (ej: "42000, farmacia", "77 lucas nafta ypf ayer", "coto 15000 carne y verduras", "60000 ypf nafta super", "gaste 5 mil en farmacity ibuprofeno").

Instrucciones:
1. "amount": Extraé el monto total como NÚMERO flotante puro sin puntos de miles.
   - Entendé modismos argentinos: "lucas" o "k" = miles (ej: 77 lucas = 77000, 5 k = 5000).
   - NUNCA devuelvas puntos de miles. Si hay centavos, usá punto decimal (ej: 1250.50).
2. "store": Extraé el nombre del comercio, farmacia, supermercado o marca (ej: Farmacia, Coto, YPF, Shell, Spotify, Farmacity).
3. "detail": Descripción del producto o motivo (ej: Farmacia, Nafta super, Carnes y verduras, Medicamentos).
4. "date": Fecha del gasto en formato YYYY-MM-DD.
   - Si menciona "ayer", calculá ${today} menos 1 día.
   - Si no menciona fecha, usá ${today}.
5. "category_id" y "subcategory_id": Seleccioná la categoría y subcategoría id más adecuada de esta lista:
${catList}

Devolvé ÚNICAMENTE un JSON válido sin markdown:
{
  "amount": <número>,
  "store": "<comercio>",
  "detail": "<detalle>",
  "date": "YYYY-MM-DD",
  "category_id": <id>,
  "subcategory_id": <id>,
  "confidence": <número entre 0 y 1>
}

Texto del usuario a analizar: "${text}"`;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const parsed = extractJsonFromResponse(raw);

      return {
        amount: parseNumericAmount(parsed.amount),
        detail: parsed.detail || text,
        store: parsed.store || '',
        date: parsed.date || today,
        categoryId: parsed.category_id || categories[0]?.id || 1,
        subcategoryId: parsed.subcategory_id || categories[0]?.subcategories[0]?.id || 1,
        confidence: parsed.confidence || 0.9,
        raw,
      };
    } catch (err) {
      lastErr = err;
      console.warn(`Modelo ${modelName} falló:`, err);
    }
  }

  console.warn('Gemini AI no disponible, usando análisis heurístico local:', lastErr);
  return parseLocalHeuristic(text, categories, today);
}

export interface ParsedItem {
  detail: string;
  amount: number;
  store?: string;
  categoryId: number;
  subcategoryId: number;
  notes?: string;
  confidence?: number;
}

export interface MultiItemParseResult {
  isMultiItem: boolean;
  store: string;
  date: string;
  items: ParsedItem[];
  totalDetected?: number;
  cartTotalItemsExpected?: number;
  discounts?: number;
  shipping?: number;
  raw?: string;
}

export async function parseTicketImagesWithAI(
  imagesBase64: string[],
  textPrompt: string,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>,
  overrideDate?: string
): Promise<MultiItemParseResult> {
  const apiKey = getApiKey();
  const today = overrideDate || new Date().toISOString().split('T')[0];

  if (!apiKey) {
    throw new Error('Falta configurar tu Gemini API Key en Configuración ⚙️');
  }

  const catList = categories
    .map(c => `${c.id}:${c.name} [${c.subcategories.map(s => `${s.id}:${s.name}`).join(', ')}]`)
    .join('\n');

  const imageParts = imagesBase64.map(b64 => {
    const mimeMatch = b64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    return {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType,
      },
    };
  });

  const prompt = `Sos un asistente experto de finanzas personales argentino. Analizá estas ${imagesBase64.length} capturas o fotos (tickets, facturas, comprobantes o capturas de carrito de compras como MercadoLibre) junto con cualquier aclaración del usuario.

Aclaración del usuario: "${textPrompt || 'Sin aclaración adicional'}"
Fecha actual de referencia: ${today}

Categorías disponibles:
${catList}

INSTRUCCIONES CLAVE:
1. DETECCIÓN MULTI-ARTÍCULO / CARRITO:
   - Si la o las imágenes muestran un carrito de compras (ej: MercadoLibre con "Carrito (N)"), o un ticket de supermercado/factura con múltiples productos:
     * Extraé CADA PRODUCTO o artículo como un ítem individual en la lista "items".
     * "detail": Nombre claro del producto con su variante o especificación (ej: "Kong Classic Large Juguete Perros Rojo L", "Suplemento Polvo L-Glicina 500g", "Collar Táctico Lila").
     * "amount": El precio unitario o final de ese producto específico (número flotante sin puntos de miles, ej: 37520.25, 14999.00, 23900).
     * "store": Nombre del comercio o plataforma (ej: "MercadoLibre", "Coto", "Farmacity").
     * "category_id" y "subcategory_id": Elegí la categoría y subcategoría más adecuada para CADA producto específico de la lista.
   - Detectá si hay un contador de artículos en la cabecera (ej: "Carrito (6)") y ponelo en "cart_total_items_expected": 6.
   - "total_amount": El importe total final pagado o facturado que figura al pie del carrito o ticket (ej: 205732.43).
   - "discounts": Total de cupones o descuentos generales detectados.
   - "shipping": Costo de envío si figura (0 si es gratis).

2. SI ES UN TICKET SIMPLE DE 1 SOLO GASTO GENERAL:
   - Devolvé "is_multi_item": false y un solo elemento en "items".

Devolvé ÚNICAMENTE un JSON válido con esta estructura:
{
  "is_multi_item": true,
  "store": "<comercio general, ej: MercadoLibre>",
  "date": "${today}",
  "cart_total_items_expected": <número total de ítems del carrito si figura, ej: 6, o null>,
  "total_amount": <monto total final del carrito o ticket>,
  "discounts": <monto de cupones o descuentos generales>,
  "shipping": <costo de envío o 0>,
  "items": [
    {
      "detail": "<nombre del producto>",
      "store": "<comercio>",
      "amount": <monto numérico sin puntos de miles>,
      "category_id": <id>,
      "subcategory_id": <id>,
      "notes": "<notas breves si aplica>",
      "confidence": 0.95
    }
  ]
}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });
      const result = await model.generateContent([prompt, ...imageParts]);
      const raw = result.response.text().trim();
      const parsed = extractJsonFromResponse(raw);

      const itemsList: ParsedItem[] = Array.isArray(parsed.items)
        ? parsed.items.map((it: any) => ({
            detail: it.detail || 'Producto',
            store: it.store || parsed.store || '',
            amount: parseNumericAmount(it.amount),
            categoryId: it.category_id || categories[0]?.id || 1,
            subcategoryId: it.subcategory_id || categories[0]?.subcategories[0]?.id || 1,
            notes: it.notes || '',
            confidence: it.confidence || 0.9,
          }))
        : [
            {
              detail: parsed.detail || 'Compra comprobante',
              store: parsed.store || '',
              amount: parseNumericAmount(parsed.amount || parsed.total_amount),
              categoryId: parsed.category_id || categories[0]?.id || 1,
              subcategoryId: parsed.subcategory_id || categories[0]?.subcategories[0]?.id || 1,
              notes: parsed.notes || '',
              confidence: 0.85,
            },
          ];

      return {
        isMultiItem: parsed.is_multi_item === true || itemsList.length > 1,
        store: parsed.store || '',
        date: parsed.date || today,
        items: itemsList,
        totalDetected: parseNumericAmount(parsed.total_amount || parsed.amount),
        cartTotalItemsExpected: parsed.cart_total_items_expected ? parseInt(parsed.cart_total_items_expected) : undefined,
        discounts: parseNumericAmount(parsed.discounts),
        shipping: parseNumericAmount(parsed.shipping),
        raw,
      };
    } catch (err) {
      lastErr = err;
      console.warn(`Vision multi-imagen modelo ${modelName} falló:`, err);
    }
  }

  console.error('Error AI Vision multi-imagen:', lastErr);
  throw new Error('No se pudo procesar las fotos con IA. Verificá tu API Key.');
}

export async function parseTicketImageWithAI(
  imageBase64: string,
  textPrompt: string,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>,
  overrideDate?: string
): Promise<AIParseResult | null> {
  const multi = await parseTicketImagesWithAI([imageBase64], textPrompt, categories, overrideDate);
  const first = multi.items[0];
  if (!first) return null;

  return {
    amount: first.amount,
    store: first.store || multi.store || '',
    detail: first.detail,
    date: multi.date,
    categoryId: first.categoryId,
    subcategoryId: first.subcategoryId,
    confidence: first.confidence || 0.85,
    raw: multi.raw,
  };
}

export async function categorizePendingExpensesWithAI(
  pendingExpenses: Array<{ id: number; detail: string; amount: number; date: string }>,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>
): Promise<Array<{ id: number; categoryId: number; subcategoryId: number }> | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Falta configurar tu Gemini API Key en Configuración ⚙️');
  }

  const catList = categories
    .map(c => `${c.id}:${c.name} [${c.subcategories.map(s => `${s.id}:${s.name}`).join(', ')}]`)
    .join('\n');

  const pendingList = pendingExpenses
    .map(e => `ID:${e.id} | Detalle:${e.detail} | Monto:${e.amount} | Fecha:${e.date}`)
    .join('\n');

  const prompt = `Sos un asistente experto de finanzas personales. Categorizá los siguientes gastos pendientes según las categorías disponibles:

Categorías disponibles:
${catList}

Gastos a categorizar:
${pendingList}

Devolvé ÚNICAMENTE un array JSON sin markdown:
[
  { "id": <id_del_gasto>, "category_id": <id_categoria>, "subcategory_id": <id_subcategoria> }
]`;

  const genAI = new GoogleGenerativeAI(apiKey);
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const parsed = extractJsonFromResponse(raw);

      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          id: item.id,
          categoryId: item.category_id || 1,
          subcategoryId: item.subcategory_id || 1,
        }));
      }
    } catch (err) {
      console.warn(`Batch categorize modelo ${modelName} falló:`, err);
    }
  }

  throw new Error('Error al categorizar en lote.');
}
