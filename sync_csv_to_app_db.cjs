const fs = require('fs');

const csvPath = 'C:\\Users\\Ulises\\Documents\\Proyectos\\control-gastos-ai\\Gastos_Consolidados_IMPORTAR_SHEETS.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');

const jsonPath = 'C:\\Users\\Ulises\\Documents\\Proyectos\\mis-finanzas-web\\src\\lib\\historical-data.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const catMap = Object.fromEntries(data.categories.map(c => [c.name.toLowerCase().trim(), c.id]));

// Mapa inverso o aproximado de subcategorías
const subcatMap = Object.fromEntries(data.subcategories.map(s => [s.name.toLowerCase().trim(), s.id]));

function getCatId(name) {
  const clean = name.toLowerCase().trim();
  if (catMap[clean]) return catMap[clean];
  for (const [k, v] of Object.entries(catMap)) {
    if (clean.includes(k) || k.includes(clean)) return v;
  }
  return 7;
}

function getSubcatId(name, catId) {
  const clean = name.toLowerCase().trim();
  if (subcatMap[clean]) return subcatMap[clean];
  for (const [k, v] of Object.entries(subcatMap)) {
    if (clean.includes(k) || k.includes(clean)) return v;
  }
  const fallbacks = { 1:1, 2:13, 3:14, 4:20, 5:23, 6:27, 7:29, 8:36, 9:40, 10:43, 11:47, 12:50 };
  return fallbacks[catId] || 29;
}

const lines = csvContent.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
const rows = lines.slice(1).map((line, idx) => {
  const parts = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ';' && !inQuote) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);

  const catStr = parts[0] || 'Ocio & Recreación';
  const subcatStr = parts[1] || 'General';
  const fecha = parts[2] || '';
  const detalle = parts[3] || '';
  // Convertir 29172,41 a 29172.41
  const rawAmt = parts[4] || '0';
  const amount = parseFloat(rawAmt.replace('.', '').replace(',', '.')) || 0;

  const catId = getCatId(catStr);
  const subcatId = getSubcatId(subcatStr, catId);

  return {
    id: idx + 1,
    date: fecha,
    category_id: catId,
    subcategory_id: subcatId,
    detail: detalle,
    amount: amount,
    notes: '',
    module_origin: 'expense',
    status: 'active',
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}).filter(r => r.amount > 0 && r.date);

console.log(`📊 Sincronizando ${rows.length} gastos consolidados exactos hacia historical-data.json...`);

data.expenses = rows;
data.income = [];
data.loans = [];
data.reintegros = [];
data.loan_payments = [];
data.fixed_expense_payments = [];

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

console.log('✅ historical-data.json sincronizado a la perfección con Gastos_Consolidados_IMPORTAR_SHEETS.csv');
