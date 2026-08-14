const fs = require('fs');

const jsonPath = 'c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/src/lib/historical-data.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('Total expenses before deduplication:', data.expenses.length);

// 1. Resetear todos los pagos de gastos fijos a 'pending' (sin pagos marcados falsamente como pagados)
data.fixed_expense_payments = (data.fixed_expense_payments || []).map(p => ({
  ...p,
  status: 'pending',
  paid_date: undefined,
  amount_paid: undefined,
  expense_id: undefined,
}));

// También eliminar de expenses cualquier gasto que provenga de module_origin === 'fixed' sintético
data.expenses = data.expenses.filter(e => e.module_origin !== 'fixed');

// 2. Desduplicar gastos que tengan misma fecha, mismo monto y mismo detalle
const seenExpenses = new Map();
const cleanExpenses = [];
let duplicateCount = 0;

for (const exp of data.expenses) {
  const cleanDetail = (exp.detail || '').trim().toLowerCase();
  // Clave compuesta por fecha + monto + detalle limpio
  const key = `${exp.date}_${exp.amount}_${cleanDetail}`;

  if (seenExpenses.has(key)) {
    duplicateCount++;
    // Si ya existe, nos quedamos con el que tenga categoría válida (id !== 1 o id !== null)
    const existingIndex = seenExpenses.get(key);
    const existing = cleanExpenses[existingIndex];
    if ((!existing.category_id || existing.category_id === 1) && exp.category_id && exp.category_id !== 1) {
      cleanExpenses[existingIndex] = exp;
    }
  } else {
    seenExpenses.set(key, cleanExpenses.length);
    cleanExpenses.push(exp);
  }
}

data.expenses = cleanExpenses;

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

console.log(`Desduplicación completada: se eliminaron ${duplicateCount} gastos redundantes/duplicados.`);
console.log('Total de gastos únicos restantes:', cleanExpenses.length);
