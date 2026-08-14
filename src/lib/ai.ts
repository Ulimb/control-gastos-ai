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

const DEFAULT_GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'models/gemini-3.5-flash';

function getApiKey(): string | null {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_API_KEY;
  return localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_API_KEY || null;
}

function parseNumericAmount(val: any): number {
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
): Promise<AIParseResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const today = overrideDate || new Date().toISOString().split('T')[0];
  const catList = categories
    .map(c => `${c.id}:${c.name} [${c.subcategories.map(s => `${s.id}:${s.name}`).join(', ')}]`)
    .join('\n');

  const prompt = `Sos un asistente experto de finanzas personales argentino. Analizá el texto libre ingresado por el usuario y auto-identificá inteligentemente cada componente.

El usuario puede escribir en cualquier formato libre (ej: "77 lucas nafta ypf ayer", "coto 15000 carne y verduras", "60000 ypf nafta super", "gaste 5 mil en farmacity ibuprofeno").

Instrucciones:
1. "amount": Extraé el monto total como NÚMERO flotante puro sin puntos de miles.
   - Entendé modismos argentinos: "lucas" o "k" = miles (ej: 77 lucas = 77000, 5 k = 5000).
   - NUNCA devuelvas puntos de miles. Si hay centavos, usá punto decimal (ej: 1250.50).
2. "store": Extraé el nombre del comercio, marca, negocio o estación de servicio (ej: Coto, YPF, Shell, Spotify, Farmacity).
3. "detail": Descripción del producto o motivo (ej: Nafta super, Carnes y verduras, Subscripción junio).
4. "date": Fecha del gasto en formato YYYY-MM-DD.
   - Si menciona "ayer", calculá ${today} menos 1 día.
   - Si menciona un día de la semana, calculá la fecha correspondiente.
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
}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      amount: parseNumericAmount(parsed.amount),
      detail: parsed.detail || text,
      store: parsed.store || '',
      date: parsed.date || today,
      categoryId: parsed.category_id || categories[0]?.id || 1,
      subcategoryId: parsed.subcategory_id || categories[0]?.subcategories[0]?.id || 1,
      confidence: parsed.confidence || 0.5,
      raw,
    };
  } catch (err) {
    console.error('Error AI parse:', err);
    return null;
  }
}

export async function parseTicketImageWithAI(
  imageBase64: string,
  textPrompt: string,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>,
  overrideDate?: string
): Promise<AIParseResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const today = overrideDate || new Date().toISOString().split('T')[0];
  const catList = categories
    .map(c => `${c.id}:${c.name} [${c.subcategories.map(s => `${s.id}:${s.name}`).join(', ')}]`)
    .join('\n');

  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  const prompt = `Sos un asistente experto de finanzas personales argentino. Analizá esta imagen de ticket, comprobante o factura junto con la aclaración de texto (si la hay).

Aclaración del usuario: "${textPrompt || 'Sin aclaración adicional'}"
Fecha actual de referencia: ${today}

Categorías disponibles:
${catList}

Reglas estrictas para el monto:
- "amount": Debe ser el MONTO TOTAL como NÚMERO flotante puro sin separadores de miles.
- NUNCA uses puntos de miles. Si el comprobante dice "$1.250,00", el valor devuelto debe ser 1250.00.

Devolvé ÚNICAMENTE un JSON válido sin markdown:
{
  "amount": <monto numérico>,
  "store": "<nombre del comercio/empresa del ticket, ej: Coto, YPF, Spotify, Farmacity>",
  "detail": "<descripción de los ítems comprados o servicio>",
  "date": "<fecha del comprobante en YYYY-MM-DD o ${today}>",
  "category_id": <id de categoría>,
  "subcategory_id": <id de subcategoría>,
  "confidence": <número entre 0 y 1>
}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      amount: parseNumericAmount(parsed.amount),
      store: parsed.store || '',
      detail: parsed.detail || 'Compra comprobante',
      date: parsed.date || today,
      categoryId: parsed.category_id || categories[0]?.id || 1,
      subcategoryId: parsed.subcategory_id || categories[0]?.subcategories[0]?.id || 1,
      confidence: parsed.confidence || 0.8,
      raw,
    };
  } catch (err) {
    console.error('Error AI Vision parse:', err);
    return null;
  }
}

export async function categorizePendingExpensesWithAI(
  pendingExpenses: Array<{ id: number; detail: string; amount: number; date: string }>,
  categories: Array<{ id: number; name: string; subcategories: Array<{ id: number; name: string }> }>
): Promise<Array<{ id: number; categoryId: number; subcategoryId: number }> | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const catList = categories
    .map(c => `${c.id}:${c.name} [${c.subcategories.map(s => `${s.id}:${s.name}`).join(', ')}]`)
    .join('\n');

  const itemsList = pendingExpenses.map(e => `ID ${e.id}: "${e.detail}" ($${e.amount})`).join('\n');

  const prompt = `Sos un asistente de finanzas personales argentino. Asigná la categoría y subcategoría más adecuada para cada uno de estos gastos pendientes y devolvé SOLO un JSON válido sin markdown.

Lista de gastos pendientes:
${itemsList}

Categorías disponibles (formato id:nombre [subcategorías]):
${catList}

Devolvé exactamente este formato de array JSON:
[
  { "id": <id numérico del gasto>, "category_id": <id de categoría>, "subcategory_id": <id de subcategoría> }
]`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return parsed.map((item: any) => ({
      id: item.id,
      categoryId: item.category_id || categories[0]?.id || 1,
      subcategoryId: item.subcategory_id || categories[0]?.subcategories[0]?.id || 1,
    }));
  } catch (err) {
    console.error('Error batch categorize:', err);
    return null;
  }
}
