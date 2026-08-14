const fs = require('fs');

const jsonPath = 'c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/src/lib/historical-data.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('BEFORE INCOMES:', data.income.length);
console.log('BEFORE LOANS:', data.loans.length);
console.log('BEFORE REINTEGROS:', data.reintegros.length);

// Filtrar income: quitar cualquier mención a Carlos, Roberto o Devolución Préstamo sintética
data.income = (data.income || []).filter(i => {
  const desc = (i.description || '').toLowerCase();
  if (desc.includes('carlos') || desc.includes('roberto') || desc.includes('test') || desc.includes('devolución préstamo')) {
    return false;
  }
  return true;
});

// Filtrar loans: quitar Carlos, Roberto y préstamos de prueba
data.loans = (data.loans || []).filter(l => {
  const name = (l.person_name || '').toLowerCase();
  if (name.includes('carlos') || name.includes('roberto') || name.includes('test')) {
    return false;
  }
  return true;
});

// Filtrar loan_payments
data.loan_payments = [];

// Filtrar reintegros sintéticos de prueba ("Devolución parcial comercio repuesto")
data.reintegros = (data.reintegros || []).filter(r => {
  const desc = (r.description || '').toLowerCase();
  if (desc.includes('comercio repuesto') || desc.includes('test')) {
    return false;
  }
  return true;
});

// Filtrar expenses: quitar las respuestas sintéticas automáticas de préstamos/reintegros de prueba
data.expenses = (data.expenses || []).filter(e => {
  const detail = (e.detail || '').toLowerCase();
  if (detail.includes('carlos') || detail.includes('roberto') || detail.includes('test') || detail.includes('comercio repuesto')) {
    return false;
  }
  return true;
});

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

console.log('AFTER INCOMES:', data.income.length);
console.log('AFTER LOANS:', data.loans.length);
console.log('AFTER REINTEGROS:', data.reintegros.length);
console.log('AFTER EXPENSES:', data.expenses.length);
