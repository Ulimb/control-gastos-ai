const fs = require('fs');

const jsonPath = 'c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/src/lib/historical-data.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Filtrar expenses: quitar los que contengan 'Test' o timestamp sintético
data.expenses = (data.expenses || []).filter(e => {
  const detail = e.detail || '';
  return !detail.includes('Test') && !/\d{10}/.test(detail);
});

// Filtrar income: quitar duplicados de Test o timestamps
data.income = (data.income || []).filter(i => {
  const desc = i.description || '';
  return !desc.includes('Test') && !/\d{10}/.test(desc);
});

// Quedarse con sólo 1 reintegro de demostración si es necesario, o filtrarlos si son duplicados sintéticos
const seenReintegros = new Set();
data.reintegros = (data.reintegros || []).filter(r => {
  if (r.description.includes('Test')) return false;
  const key = `${r.date}_${r.amount}_${r.description}`;
  if (seenReintegros.has(key)) return false;
  seenReintegros.add(key);
  return true;
});

// Filtrar loans: quitar los sintéticos con Test
data.loans = (data.loans || []).filter(l => {
  return !l.person_name.includes('Test') && !/\d{10}/.test(l.person_name);
});

// Filtrar loan_payments
data.loan_payments = (data.loan_payments || []).filter(lp => {
  return !(lp.notes || '').includes('Test');
});

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

console.log('--- PURIFIED DATA SUMMARY ---');
console.log('Expenses count:', data.expenses.length);
console.log('Income count:', data.income.length);
console.log('Fixed expenses count:', data.fixed_expenses.length);
console.log('Loans count:', data.loans.length);
console.log('Reintegros count:', data.reintegros.length);
