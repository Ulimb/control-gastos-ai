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
  const expenseCount = await db.expenses.count();
  if (expenseCount > 0 && !force) return;

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

export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxcSb43RiRBAvy6ksZXg-iF2aL9vsvbHH5T1NyV0GUOqUidq8bnoJbZ0yf0DsgzQfURwg/exec';

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
) {
  const ts = new Date().toISOString();
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('apps_script_url') : null;
  const url = customUrl || APPS_SCRIPT_URL;

  if (!url) {
    const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ERROR_URL', error: 'Sin URL configurada' };
    addSyncLog(entry);
    console.error('[SYNC] ❌ Sin URL de Apps Script configurada', entry);
    return;
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
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      mode: 'no-cors',
      cache: 'no-cache',
    }).then(() => {
      const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ENVIADO' };
      addSyncLog(entry);
      console.log(`[SYNC] ✅ Enviado OK action=${action} expenseId=${expenseId}`);
    }).catch(err => {
      const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ERROR_RED', error: String(err) };
      addSyncLog(entry);
      console.error(`[SYNC] ❌ Error de red action=${action}`, err);
    });
  } catch (err) {
    const entry: SyncLogEntry = { ts, action, expenseId, movement, status: 'ERROR_RED', error: String(err) };
    addSyncLog(entry);
    console.error('[SYNC] ❌ Excepción inesperada', err);
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
  await syncToSheets('add', movement.expenseId || 0, movement);
}
