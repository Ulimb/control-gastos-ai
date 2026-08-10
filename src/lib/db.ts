import Dexie, { Table } from 'dexie';

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

// ─── Seed de categorías por defecto ──────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name: 'Alimentación', icon: '🍔', color: '#F59E0B' },
  { name: 'Transporte', icon: '🚗', color: '#3B82F6' },
  { name: 'Hogar', icon: '🏠', color: '#8B5CF6' },
  { name: 'Servicios', icon: '💡', color: '#06B6D4' },
  { name: 'Salud', icon: '🏥', color: '#10B981' },
  { name: 'Entretenimiento', icon: '🎬', color: '#EC4899' },
  { name: 'Ropa & Calzado', icon: '👕', color: '#F97316' },
  { name: 'Deportes & Bienestar', icon: '💪', color: '#14B8A6' },
  { name: 'Social & Eventos', icon: '🎉', color: '#A855F7' },
  { name: 'Educación', icon: '📚', color: '#6366F1' },
  { name: 'Tecnología', icon: '💻', color: '#0EA5E9' },
  { name: 'Impuestos & Finanzas', icon: '💰', color: '#EAB308' },
  { name: 'Otros', icon: '📦', color: '#94A3B8' },
];

const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  'Alimentación': ['Supermercado', 'Restaurantes', 'Delivery', 'Cafetería', 'Verdulería', 'Carnicería'],
  'Transporte': ['Nafta', 'Peajes', 'Estacionamiento', 'Colectivo', 'Taxi / Uber', 'Mecánico'],
  'Hogar': ['Alquiler', 'Expensas', 'Limpieza', 'Muebles', 'Reparaciones', 'Jardín'],
  'Servicios': ['Electricidad', 'Gas', 'Agua', 'Internet', 'Celular', 'Streaming'],
  'Salud': ['Obra social / Prepaga', 'Farmacia', 'Médico', 'Dentista', 'Laboratorio', 'Óptica'],
  'Entretenimiento': ['Cine', 'Juegos', 'Salidas', 'Vacaciones', 'Libros', 'Conciertos'],
  'Ropa & Calzado': ['Ropa', 'Calzado', 'Accesorios', 'Ropa Interior'],
  'Deportes & Bienestar': ['Gimnasio', 'Equipamiento', 'Suplementos', 'Spa / Belleza', 'Peluquería'],
  'Social & Eventos': ['Regalos', 'Juntadas', 'Cumpleaños', 'Casamiento', 'Propina'],
  'Educación': ['Cursos', 'Universidad', 'Libros', 'Material'],
  'Tecnología': ['Hardware', 'Software', 'Accesorios', 'Suscripciones'],
  'Impuestos & Finanzas': ['Impuestos AFIP', 'Monotributo', 'Seguros', 'Banco', 'Inversiones'],
  'Otros': ['Varios', 'Sin categoría'],
};

export async function seedDatabase() {
  const count = await db.categories.count();
  if (count > 0) return; // Ya inicializado

  await db.transaction('rw', db.categories, db.subcategories, async () => {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i];
      const catId = await db.categories.add({
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        sort_order: i + 1,
      });

      const subs = DEFAULT_SUBCATEGORIES[cat.name] || [];
      for (let j = 0; j < subs.length; j++) {
        await db.subcategories.add({
          category_id: catId as number,
          name: subs[j],
          sort_order: j + 1,
        });
      }
    }
  });
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

  // Fallback: si no hay ingresos manuales, usa el sueldo configurado
  if (totalIncome === 0) {
    const sal = await db.salary_config.orderBy('id').last();
    if (sal) totalIncome = sal.monthly_amount;
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
