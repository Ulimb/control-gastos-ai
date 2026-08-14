const fs = require('fs');

const data = JSON.parse(fs.readFileSync('c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/src/lib/historical-data.json', 'utf8'));

const catMap = Object.fromEntries((data.categories || []).map(c => [c.id, c.name]));
const subMap = Object.fromEntries((data.subcategories || []).map(s => [s.id, s.name]));

const rows = [];

// Gastos
(data.expenses || []).forEach(e => {
  rows.push({
    tipo: 'Gasto',
    fecha: e.date,
    categoria: catMap[e.category_id] || 'Sin categoría',
    subcategoria: subMap[e.subcategory_id] || 'General',
    detalle: e.detail,
    monto: e.amount,
    notas: e.notes || '',
  });
});

// Ingresos
(data.income || []).forEach(i => {
  rows.push({
    tipo: 'Ingreso',
    fecha: i.date,
    categoria: 'Ingresos',
    subcategoria: i.type === 'salary' ? 'Sueldo' : 'Extra',
    detalle: i.description || 'Ingreso registrado',
    monto: i.amount,
    notas: '',
  });
});

// Gastos Fijos
(data.fixed_expenses || []).forEach(f => {
  rows.push({
    tipo: 'Gasto Fijo',
    fecha: `Fijo Mensual (Día ${f.due_day})`,
    categoria: catMap[f.category_id] || 'Servicios',
    subcategoria: subMap[f.subcategory_id] || 'Fijos',
    detalle: f.name,
    monto: f.estimated_amount,
    notas: `Vence día ${f.due_day}`,
  });
});

// Préstamos
(data.loans || []).forEach(l => {
  rows.push({
    tipo: 'Préstamo',
    fecha: l.date,
    categoria: 'Social & Eventos',
    subcategoria: 'Préstamos',
    detalle: `Prestado a ${l.person_name}`,
    monto: l.amount,
    notas: l.notes || '',
  });
});

// Reintegros
(data.reintegros || []).forEach(r => {
  rows.push({
    tipo: 'Reintegro',
    fecha: r.date,
    categoria: 'Reintegros',
    subcategoria: r.type,
    detalle: r.description,
    monto: r.amount,
    notas: '',
  });
});

rows.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.subcategoria.localeCompare(b.subcategoria) || b.fecha.localeCompare(a.fecha));

let csv = 'Categoría;Subcategoría;Tipo de Movimiento;Fecha;Detalle;Monto ($);Notas\n';
rows.forEach(r => {
  const cleanDetail = `"${(r.detalle || '').replace(/"/g, '""')}"`;
  const cleanNotes = `"${(r.notas || '').replace(/"/g, '""')}"`;
  csv += `"${r.categoria}";"${r.subcategoria}";"${r.tipo}";"${r.fecha}";${cleanDetail};${r.monto};${cleanNotes}\n`;
});

const csvPath = 'c:/Users/Ulises/Documents/Proyectos/control-gastos-ai/Consolidado_Movimientos.csv';
fs.writeFileSync(csvPath, '\uFEFF' + csv, 'utf8');

const webPublicPath = 'c:/Users/Ulises/Documents/Proyectos/mis-finanzas-web/public/Consolidado_Movimientos.csv';
fs.writeFileSync(webPublicPath, '\uFEFF' + csv, 'utf8');

console.log('Clean CSV updated successfully! Total rows:', rows.length);
