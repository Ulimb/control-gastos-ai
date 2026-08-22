import Dexie, { Table } from 'dexie';
import historicalData from './historical-data.json';

export interface Category {
  id?: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

export interface Subcategory {
  id?: number;
  category_id: number;
  name: string;
  sort_order: number;
}

export interface Expense {
  id?: number;
  date: string;
  amount: number;
  detail: string;
  store?: string; // Comercio / Local
  notes?: string;
  category_id: number;
  subcategory_id: number;
  payment_method?: string;
  status: 'active' | 'anulado';
  module_origin?: string;
  module_reference_id?: number;
  reimbursement_person?: string; // Nombre de quien debe devolver (ej: "Sabri")
  reimbursement_amount?: number; // Monto a devolver (ej: 20000)
  reimbursement_status?: 'pending' | 'settled'; // Estado de la devolución
  created_at?: string;
  updated_at?: string;
}

export interface FixedExpense {
  id?: number;
  name: string;
  estimated_amount: number;
  category_id: number;
  subcategory_id: number;
  frequency: 'monthly' | 'quarterly' | 'annual';
  due_day: number;
  notification_enabled?: number;
  notification_days_before?: number;
  status: 'active' | 'cancelled';
  created_at?: string;
}

export interface FixedExpensePayment {
  id?: number;
  fixed_expense_id: number;
  due_date: string;
  paid_date?: string;
  amount_paid?: number;
  status: 'pending' | 'paid' | 'skipped';
  notes?: string;
  expense_id?: number;
}

export interface Income {
  id?: number;
  date: string;
  amount: number;
  type: 'salary' | 'extra';
  description?: string;
  created_at?: string;
}

export interface SalaryConfig {
  id?: number;
  monthly_amount: number;
  payment_day: number;
  is_last_business_day: number;
  updated_at?: string;
}

export interface MedicalConsultation {
  id?: number;
  date: string;
  specialty: string;
  doctor_name?: string;
  cost?: number;
  has_cost?: number;
  next_visit_date?: string;
  notes?: string;
  status: 'completed' | 'postponed' | 'cancelled';
  expense_id?: number;
  created_at?: string;
}

export interface Purchase {
  id?: number;
  product_name: string;
  store?: string;
  purchase_date: string;
  total_amount: number;
  installments_count: number;
  installment_amount?: number;
  warranty_months?: number;
  warranty_until?: string;
  category_id: number;
  subcategory_id: number;
  status: 'active' | 'returned' | 'warranty_expired';
  created_at?: string;
}

export interface Loan {
  id?: number;
  person_name: string;
  date: string;
  amount: number;
  notes?: string;
  expected_return_date?: string;
  status: 'active' | 'partially_paid' | 'settled' | 'written_off';
  expense_id?: number;
  created_at?: string;
}

export interface LoanPayment {
  id?: number;
  loan_id: number;
  date: string;
  amount: number;
  notes?: string;
}

export interface Reintegro {
  id?: number;
  date: string;
  amount: number;
  description: string;
  type: 'linked' | 'income';
  linked_expense_id?: number;
  created_at?: string;
}

export interface AIRule {
  id?: number;
  pattern: string;
  category_id: number;
  subcategory_id: number;
  used_count: number;
  last_used?: string;
}

class MisFinanzasDB extends Dexie {
  categories!: Table<Category>;
  subcategories!: Table<Subcategory>;
  expenses!: Table<Expense>;
  fixed_expenses!: Table<FixedExpense>;
  fixed_expense_payments!: Table<FixedExpensePayment>;
  income!: Table<Income>;
  salary_config!: Table<SalaryConfig>;
  medical_consultations!: Table<MedicalConsultation>;
  purchases!: Table<Purchase>;
  loans!: Table<Loan>;
  loan_payments!: Table<LoanPayment>;
  reintegros!: Table<Reintegro>;
  ai_rules!: Table<AIRule>;

  constructor() {
    super('MisFinanzasDB');
    this.version(1).stores({
      categories: '++id, name, sort_order',
      subcategories: '++id, category_id, name, sort_order',
      expenses: '++id, date, category_id, subcategory_id, status, module_origin',
      fixed_expenses: '++id, status, category_id',
      fixed_expense_payments: '++id, fixed_expense_id, due_date, status',
      income: '++id, date, type',
      salary_config: '++id',
      medical_consultations: '++id, date, status',
      purchases: '++id, purchase_date, status, category_id',
      loans: '++id, person_name, status',
      loan_payments: '++id, loan_id, date',
      reintegros: '++id, date, type',
      ai_rules: '++id, pattern, category_id',
    });
  }
}

export const db = new MisFinanzasDB();

// ─── Carga automática de datos históricos ────────────────────────────────────
export async function seedDatabase(force: boolean = false) {
  if (typeof window !== 'undefined' && !force && localStorage.getItem('db_seeded') === 'true') {
    return;
  }

  const expenseCount = await db.expenses.count();
  if (expenseCount > 0 && !force) {
    if (typeof window !== 'undefined') localStorage.setItem('db_seeded', 'true');
    return;
  }

  await db.transaction(
    'rw',
    [
      db.categories,
      db.subcategories,
      db.expenses,
      db.fixed_expenses,
      db.fixed_expense_payments,
      db.income,
      db.salary_config,
      db.loans,
      db.loan_payments,
      db.reintegros,
      db.ai_rules,
    ],
    async () => {
      if (force) {
        await Promise.all([
          db.categories.clear(),
          db.subcategories.clear(),
          db.expenses.clear(),
          db.fixed_expenses.clear(),
          db.fixed_expense_payments.clear(),
          db.income.clear(),
          db.salary_config.clear(),
          db.loans.clear(),
          db.loan_payments.clear(),
          db.reintegros.clear(),
          db.ai_rules.clear(),
        ]);
      }

      const h = historicalData as any;
      if (h.categories?.length) await db.categories.bulkAdd(h.categories);
      if (h.subcategories?.length) await db.subcategories.bulkAdd(h.subcategories);
      if (h.expenses?.length) await db.expenses.bulkAdd(h.expenses);
      if (h.fixed_expenses?.length) await db.fixed_expenses.bulkAdd(h.fixed_expenses);
      if (h.fixed_expense_payments?.length) await db.fixed_expense_payments.bulkAdd(h.fixed_expense_payments);
      if (h.income?.length) await db.income.bulkAdd(h.income);
      if (h.salary_config?.length) await db.salary_config.bulkAdd(h.salary_config);
      if (h.loans?.length) await db.loans.bulkAdd(h.loans);
      if (h.loan_payments?.length) await db.loan_payments.bulkAdd(h.loan_payments);
      if (h.reintegros?.length) await db.reintegros.bulkAdd(h.reintegros);
      if (h.ai_rules?.length) await db.ai_rules.bulkAdd(h.ai_rules);
    }
  );

  if (typeof window !== 'undefined') {
    localStorage.setItem('db_seeded', 'true');
  }
}

// ─── Helpers de consulta ─────────────────────────────────────────────────────
export async function getCategoriesWithSubs() {
  const cats = await db.categories.orderBy('sort_order').toArray();
  const subs = await db.subcategories.orderBy('sort_order').toArray();
  return cats.map(c => ({ ...c, subcategories: subs.filter(s => s.category_id === c.id) }));
}

export async function getPeriodExpensesTotal(startDate: string, endDate: string): Promise<number> {
  const exps = await db.expenses
    .where('date').between(startDate, endDate, true, true)
    .and(e => e.status === 'active')
    .toArray();
  return exps.reduce((sum, e) => sum + e.amount, 0);
}

export async function getPeriodIncomeTotal(startDate: string, endDate: string): Promise<number> {
  const incomes = await db.income
    .where('date').between(startDate, endDate, true, true)
    .toArray();
  return incomes.reduce((sum, i) => sum + i.amount, 0);
}

export async function getPeriodBalance(startDate: string, endDate: string) {
  let totalIncome = await getPeriodIncomeTotal(startDate, endDate);
  const totalExpenses = await getPeriodExpensesTotal(startDate, endDate);

  // Si no hay ingresos en el mes actual, buscar si hay un sueldo cobrado a fin del mes anterior (días 24-31)
  if (totalIncome === 0) {
    const prevDate = new Date(startDate);
    prevDate.setDate(prevDate.getDate() - 8);
    const prevWindowStart = prevDate.toISOString().split('T')[0];

    const prevSalary = await db.income
      .where('date').between(prevWindowStart, startDate, false, true)
      .and(i => i.type === 'salary')
      .first();

    if (prevSalary) {
      totalIncome = prevSalary.amount;
    }
  }

  return { totalIncome, totalExpenses, disponible: totalIncome - totalExpenses, startDate, endDate };
}

export async function getExpensesByCategory(startDate: string, endDate: string) {
  const exps = await db.expenses
    .where('date').between(startDate, endDate, true, true)
    .and(e => e.status === 'active' && e.amount > 0)
    .toArray();

  const cats = await db.categories.toArray();
  const grouped: Record<number, { name: string; color: string; total: number }> = {};

  for (const exp of exps) {
    const cat = cats.find(c => c.id === exp.category_id);
    if (!cat) continue;
    if (!grouped[exp.category_id]) {
      grouped[exp.category_id] = { name: cat.name, color: cat.color, total: 0 };
    }
    grouped[exp.category_id].total += exp.amount;
  }

  return Object.values(grouped).sort((a, b) => b.total - a.total);
}

export function formatARS(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzjFpwwpOvKFTTTHb9Quf5J6MgTDCBF-pHQLFgBYIrQogBNqMSIvdvyrGg5oQ31TyaRaw/exec';

// ─── Logging de sincronización ────────────────────────────────────────────────

export interface SyncLogEntry {
  ts: string;
  action: 'add' | 'update' | 'delete';
  expenseId: number;
  movement?: object;
  status: 'ENVIADO' | 'ERROR_URL' | 'ERROR_RED';
  error?: string;
}

function addSyncLog(entry: SyncLogEntry) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('sync_logs');
    const logs: SyncLogEntry[] = raw ? JSON.parse(raw) : [];
    logs.unshift(entry); // más reciente primero
    if (logs.length > 50) logs.splice(50);
    localStorage.setItem('sync_logs', JSON.stringify(logs));
  } catch { /* ignorar errores de storage */ }
}

export function getSyncLogs(): SyncLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('sync_logs');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function clearSyncLogs() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('sync_logs');
}

// ─── Función central de sincronización ───────────────────────────────────────

export async function syncToSheets(
  action: 'add' | 'update' | 'delete',
  expenseId: number,
  movement?: {
    fecha?: string;
    tipo?: 'Gasto' | 'Ingreso';
    categoria?: string;
    subcategoria?: string;
    comercio?: string;
    detalle?: string;
    monto?: number;
    notas?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const ts = new Date().toISOString();
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('apps_script_url') : null;
  const url = customUrl || APPS_SCRIPT_URL;

  if (!url) {
    const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ERROR_URL', error: 'Sin URL configurada' };
    addSyncLog(entry);
    console.error('[SYNC] ❌ Sin URL de Apps Script configurada', entry);
    return { ok: false, error: 'Sin URL configurada' };
  }

  const payload = {
    action: action === 'add' ? 'add_new_movement' : action,
    actionType: action,
    sheetName: 'Nuevos_Movimientos_App',
    expenseId,
    movement,
  };

  console.log(`[SYNC] 📤 Enviando action=${action} expenseId=${expenseId}`, payload);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      mode: 'no-cors',
      cache: 'no-cache',
    });

    const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ENVIADO' };
    addSyncLog(entry);
    console.log(`[SYNC] ✅ Enviado OK action=${action} expenseId=${expenseId}`);
    return { ok: true };
  } catch (err: any) {
    const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ERROR_RED', error: String(err) };
    addSyncLog(entry);
    console.error(`[SYNC] ❌ Error de red action=${action}`, err);
    return { ok: false, error: String(err) };
  }
}

// ─── Alias de compatibilidad (usado en código existente) ──────────────────────

export async function syncMovementToGoogleSheets(movement: {
  fecha: string;
  tipo: 'Gasto' | 'Ingreso';
  categoria: string;
  subcategoria: string;
  comercio?: string;
  detalle: string;
  monto: number;
  notas?: string;
  expenseId?: number;
}) {
  return await syncToSheets('add', movement.expenseId || 0, movement);
}

// ─── Cobrar / Saldar Devolución de Gasto Compartido ──────────────────────────

export async function settleExpenseReimbursement(expenseId: number, returnDate?: string): Promise<boolean> {
  const exp = await db.expenses.get(expenseId);
  if (!exp || !exp.reimbursement_amount) return false;

  const date = returnDate || new Date().toISOString().split('T')[0];
  const person = exp.reimbursement_person || 'Tercero';
  const amount = exp.reimbursement_amount;

  // 1. Actualizar el estado del gasto a 'settled'
  await db.expenses.update(expenseId, {
    reimbursement_status: 'settled',
    notes: (exp.notes ? exp.notes + ' · ' : '') + `[Devolución de ${person} por $${amount} cobrada el ${date}]`,
    updated_at: new Date().toISOString(),
  });

  // 2. Registrar en la tabla de reintegros vinculados para trazabilidad
  await db.reintegros.add({
    date,
    amount,
    description: `Devolución de ${person} (${exp.detail || exp.store || 'Gasto'})`,
    type: 'linked',
    linked_expense_id: expenseId,
    created_at: new Date().toISOString(),
  });

  // 3. Sincronizar actualización con Google Sheets
  await syncToSheets('update', expenseId, {
    fecha: exp.date,
    tipo: 'Gasto',
    comercio: exp.store || '',
    detalle: exp.detail || '',
    monto: exp.amount,
    notas: (exp.notes ? exp.notes + ' · ' : '') + `[Devolución de ${person} por $${amount} cobrada]`,
  });

  return true;
}

// ─── Sincronizar Configuración de Sueldo con Google Sheets ─────────────────

export async function syncSalaryConfigToSheets(config: SalaryConfig): Promise<{ ok: boolean }> {
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('apps_script_url') : null;
  const url = customUrl || APPS_SCRIPT_URL;

  if (!url) return { ok: false };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_salary_config',
        salaryConfig: config,
      }),
      mode: 'no-cors',
      cache: 'no-cache',
    });
    console.log('[SYNC] ✅ Configuración de sueldo enviada a Google Sheets', config);
    return { ok: true };
  } catch (err) {
    console.error('[SYNC] ❌ Error al enviar configuración de sueldo:', err);
    return { ok: false };
  }
}

// ─── Sincronizar Gastos e Ingresos Faltantes en Sheets ─────────────────────────

export async function syncMissingExpensesToSheets(
  progressCallback?: (msg: string) => void
): Promise<{ sent: number; total: number }> {
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('apps_script_url') : null;
  const url = customUrl || APPS_SCRIPT_URL;

  if (!url) return { sent: 0, total: 0 };

  progressCallback?.('📡 Consultando movimientos en Google Sheets...');
  try {
    const res = await fetch(`${url}?action=get_all_expenses`, { cache: 'no-cache' });
    const json = await res.json();
    const sheetIds = new Set((json.rows || []).map((r: any) => parseInt(r.id)).filter(Boolean));

    // 1. Gastos locales creados por la app (ID > 267)
    const localExpenses = await db.expenses
      .where('id')
      .above(267)
      .and(e => e.status === 'active')
      .toArray();
    const missingExpenses = localExpenses.filter(e => e.id && !sheetIds.has(e.id));

    // 2. Ingresos locales
    const localIncomes = await db.income.toArray();
    const missingIncomes = localIncomes.filter(i => i.id && !sheetIds.has(i.id));

    // 3. Configuración de sueldo
    const sal = await db.salary_config.orderBy('id').last();
    if (sal) {
      await syncSalaryConfigToSheets(sal);
    }

    const totalMissing = missingExpenses.length + missingIncomes.length;
    if (totalMissing === 0) {
      progressCallback?.('✅ Todos los gastos e ingresos ya están sincronizados en Sheets.');
      return { sent: 0, total: localExpenses.length + localIncomes.length };
    }

    const cats = await db.categories.toArray();
    const subs = await db.subcategories.toArray();
    const catMap = Object.fromEntries(cats.map(c => [c.id!, c]));
    const subMap = Object.fromEntries(subs.map(s => [s.id!, s]));

    let count = 0;

    // Enviar gastos faltantes
    for (const exp of missingExpenses) {
      count++;
      const cat = exp.category_id ? catMap[exp.category_id] : null;
      const sub = exp.subcategory_id ? subMap[exp.subcategory_id] : null;

      progressCallback?.(`📤 Enviando gasto ${count} de ${totalMissing}: ${exp.detail || exp.store}...`);
      await syncToSheets('add', exp.id!, {
        fecha: exp.date,
        tipo: 'Gasto',
        categoria: cat?.name || 'Varios',
        subcategoria: sub?.name || 'General',
        comercio: exp.store || '',
        detalle: exp.detail || '',
        monto: exp.amount,
        notas: exp.notes || '',
      });
      await new Promise(r => setTimeout(r, 350));
    }

    // Enviar ingresos faltantes
    for (const inc of missingIncomes) {
      count++;
      progressCallback?.(`📤 Enviando ingreso ${count} de ${totalMissing}: ${inc.description || 'Ingreso'}...`);
      await syncToSheets('add', inc.id!, {
        fecha: inc.date,
        tipo: 'Ingreso',
        categoria: 'Ingresos',
        subcategoria: inc.type === 'salary' ? 'Sueldo' : 'Extra',
        detalle: inc.description || (inc.type === 'salary' ? 'Sueldo mensual' : 'Ingreso extra'),
        monto: inc.amount,
      });
      await new Promise(r => setTimeout(r, 350));
    }

    progressCallback?.(`✅ Se sincronizaron ${totalMissing} movimientos faltantes a Google Sheets.`);
    return { sent: totalMissing, total: localExpenses.length + localIncomes.length };
  } catch (err: any) {
    progressCallback?.('❌ Error al sincronizar faltantes: ' + err.message);
    return { sent: 0, total: 0 };
  }
}

// ─── Importar desde Google Sheets → IndexedDB ────────────────────────────────

export interface SheetsImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function syncFromSheets(progressCallback?: (msg: string) => void): Promise<SheetsImportResult> {
  const result: SheetsImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('apps_script_url') : null;
  const url = customUrl || APPS_SCRIPT_URL;

  if (!url) {
    result.errors.push('Sin URL de Apps Script configurada');
    return result;
  }

  progressCallback?.('📡 Conectando con Google Sheets...');

  try {
    const response = await fetch(`${url}?action=get_all_expenses`, {
      method: 'GET',
      cache: 'no-cache',
    });

    if (!response.ok) {
      result.errors.push(`Error HTTP: ${response.status}`);
      return result;
    }

    const data = await response.json();

    if (data.status !== 'ok' || !Array.isArray(data.rows)) {
      result.errors.push(data.message || 'Respuesta inválida del servidor');
      return result;
    }

    // 1. Sincronizar configuración de sueldo si viene en la respuesta
    if (data.salary_config && typeof data.salary_config === 'object') {
      const sc = data.salary_config;
      if (sc.monthly_amount) {
        await db.salary_config.clear();
        await db.salary_config.add({
          monthly_amount: parseFloat(sc.monthly_amount),
          payment_day: parseInt(sc.payment_day) || 31,
          is_last_business_day: sc.is_last_business_day ?? 1,
          updated_at: sc.updated_at || new Date().toISOString(),
        });
        console.log('[SYNC] ✅ Configuración de sueldo sincronizada desde Sheets:', sc);
      }
    }

    const rows: any[] = data.rows;
    progressCallback?.(`📦 ${rows.length} registros encontrados en Sheets. Sincronizando...`);

    // Obtener categorías para resolver nombres a IDs
    const cats = await db.categories.toArray();
    const subs = await db.subcategories.toArray();

    const catByName = Object.fromEntries(cats.map(c => [c.name.toLowerCase().trim(), c.id]));
    const subByName = Object.fromEntries(subs.map(s => [s.name.toLowerCase().trim(), s.id]));

    for (const row of rows) {
      try {
        const sheetId = parseInt(row.id);
        if (!sheetId || isNaN(sheetId)) { result.skipped++; continue; }

        // Parsear monto: soporta formato argentino "77.000" o "77000" o "8.413,47"
        let amount = 0;
        const rawMonto = String(row.monto || '0').replace(/[$ ]/g, '').trim();
        if (rawMonto.includes(',')) {
          amount = parseFloat(rawMonto.replace(/\./g, '').replace(',', '.'));
        } else if (rawMonto.includes('.') && rawMonto.split('.').length === 2 && rawMonto.split('.')[1].length === 3) {
          amount = parseFloat(rawMonto.replace('.', ''));
        } else {
          amount = parseFloat(rawMonto) || 0;
        }

        const isIncome = String(row.tipo || '').toLowerCase() === 'ingreso' || String(row.categoria || '').toLowerCase() === 'ingresos';

        if (isIncome) {
          // Procesar como Ingreso
          const isSalary = String(row.subcategoria || '').toLowerCase() === 'sueldo' || /sueldo/i.test(row.detalle || '');
          const incomeData: Income = {
            id: sheetId,
            date: row.fecha || new Date().toISOString().split('T')[0],
            amount,
            type: isSalary ? 'salary' : 'extra',
            description: row.detalle || (isSalary ? 'Sueldo' : 'Ingreso extra'),
            created_at: new Date().toISOString(),
          };

          const existingInc = await db.income.get(sheetId);
          if (existingInc) {
            if (existingInc.amount !== amount || existingInc.description !== incomeData.description || existingInc.date !== incomeData.date) {
              await db.income.put(incomeData);
              result.updated++;
            } else {
              result.skipped++;
            }
          } else {
            await db.income.put(incomeData);
            result.imported++;
          }
        } else {
          // Procesar como Gasto
          const catName = (row.categoria || '').toLowerCase().trim();
          const subName = (row.subcategoria || '').toLowerCase().trim();
          const category_id = catByName[catName] || 0;
          const subcategory_id = subByName[subName] || 0;

          // Detectar reintegro si está en las notas
          let reimbPerson: string | undefined = undefined;
          let reimbAmount: number | undefined = undefined;
          let reimbStatus: 'pending' | 'settled' | undefined = undefined;

          if (row.notas && /Devolución pendiente:\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\s*debe\s*\$?([\d.,]+)/i.test(row.notas)) {
            const match = row.notas.match(/Devolución pendiente:\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\s*debe\s*\$?([\d.,]+)/i);
            if (match) {
              reimbPerson = match[1];
              reimbAmount = parseFloat(match[2].replace(/\./g, '').replace(',', '.')) || 0;
              reimbStatus = 'pending';
            }
          } else if (row.notas && /Devolución de\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\s*por\s*\$?([\d.,]+)\s*cobrada/i.test(row.notas)) {
            const match = row.notas.match(/Devolución de\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\s*por\s*\$?([\d.,]+)\s*cobrada/i);
            if (match) {
              reimbPerson = match[1];
              reimbAmount = parseFloat(match[2].replace(/\./g, '').replace(',', '.')) || 0;
              reimbStatus = 'settled';
            }
          }

          const expenseData: Expense = {
            id: sheetId,
            date: row.fecha || new Date().toISOString().split('T')[0],
            amount,
            store: row.comercio || '',
            detail: row.detalle || '',
            notes: row.notas || '',
            category_id,
            subcategory_id,
            status: 'active',
            module_origin: 'sheets_import',
            reimbursement_person: reimbPerson,
            reimbursement_amount: reimbAmount,
            reimbursement_status: reimbStatus,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Verificar si ya existe en IndexedDB
          const existing = await db.expenses.get(sheetId);
          if (existing) {
            if (
              existing.amount !== amount ||
              existing.detail !== expenseData.detail ||
              existing.store !== expenseData.store ||
              existing.category_id !== category_id ||
              existing.reimbursement_status !== reimbStatus
            ) {
              await db.expenses.put(expenseData);
              result.updated++;
            } else {
              result.skipped++;
            }
          } else {
            await db.expenses.put(expenseData);
            result.imported++;
          }
        }
      } catch (rowErr) {
        result.errors.push(`Fila ID ${row.id}: ${String(rowErr)}`);
      }
    }

    progressCallback?.(`✅ Sincronización completa: ${result.imported} nuevos, ${result.updated} actualizados, ${result.skipped} sin cambios`);
  } catch (err) {
    result.errors.push(`Error de red: ${String(err)}`);
    progressCallback?.('❌ Error de conexión con Google Sheets');
  }

  return result;
}
