const fs = require('fs');

const jsonPath = 'c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/src/lib/historical-data.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Limpiar gastos fijos sintéticos
data.fixed_expenses = [];
data.fixed_expense_payments = [];

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

console.log('✅ Gastos fijos sintéticos eliminados por completo.');
console.log('Total gastos reales:', data.expenses.length);
