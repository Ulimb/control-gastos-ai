import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIParseResult {
  amount: number;
  detail: string;
  date: string;
  categoryId: number;
  subcategoryId: number;
  confidence: number;
  raw?: string;
}

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gemini_api_key');
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

  const prompt = `Sos un asistente de finanzas personales argentino. Analizá este gasto y devolvé SOLO un JSON válido sin markdown.

Texto del usuario: "${text}"
Fecha actual: ${today}

Categorías disponibles (formato id:nombre):
${catList}

Devolvé exactamente este JSON:
{
  "amount": <número en pesos ARS, sin signo $>,
  "detail": "<descripción breve del gasto>",
  "date": "<fecha en formato YYYY-MM-DD>",
  "category_id": <id numérico de la categoría más apropiada>,
  "subcategory_id": <id numérico de la subcategoría más apropiada>,
  "confidence": <número entre 0 y 1>
}

Si el texto menciona "ayer", resta un día a la fecha actual. Si menciona un día de la semana, calculá la fecha correcta.
Si no podés determinar el monto, ponelo en 0.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // Limpiar markdown si viene con backticks
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      amount: parsed.amount || 0,
      detail: parsed.detail || text,
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
