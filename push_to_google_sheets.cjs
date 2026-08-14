const fs = require('fs');

const url = 'https://script.google.com/macros/s/AKfycbxPKK60SpZjORB0B-C0ke0nFuvoMhWtR4Hh2HnFkfLzlsfsYvct2c6JWTw0LrlUa7jGdA/exec';

const data = JSON.parse(fs.readFileSync('c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/src/lib/historical-data.json', 'utf8'));

const catMap = Object.fromEntries((data.categories || []).map(c => [c.id, c.name]));
const subMap = Object.fromEntries((data.subcategories || []).map(s => [s.id, s.name]));

// Mapear gastos con nombres de categoría
const enrichedExpenses = (data.expenses || []).map(e => ({
  ...e,
  category_name: catMap[e.category_id] || 'Sin categoría',
  subcategory_name: subMap[e.subcategory_id] || 'General',
}));

const payload = {
  action: 'full_sync_overwrite',
  categoriesTree: (data.categories || []).map(c => ({
    ...c,
    subcategories: (data.subcategories || []).filter(s => s.category_id === c.id),
  })),
  expenses: enrichedExpenses,
  fixedExpenses: data.fixed_expenses || [],
  income: data.income || [],
  medical: data.medical || [],
  purchases: data.purchases || [],
  loans: data.loans || [],
  reintegros: data.reintegros || [],
};

console.log(`Enviando a Google Sheets (gastos: ${enrichedExpenses.length}, ingresos: ${payload.income.length})...`);

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
  .then(res => res.text())
  .then(txt => {
    console.log('✅ Respuesta de Google Sheets Apps Script:', txt);
  })
  .catch(err => {
    console.error('❌ Error enviando a Google Sheets:', err);
  });
