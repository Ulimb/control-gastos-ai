const XLSX = require('xlsx');
const fs = require('fs');

// ─── Mapeo de categorías Excel → IDs de la app ─────────────────────────────
// Categorías app: 1=Supermercado, 2=Gastos Fijos, 3=Transporte, 4=Mascotas,
// 5=Salidas&Gastronomía, 6=Social&Eventos, 7=Ocio&Recreación,
// 8=Deportes&Bienestar, 9=Vivienda&Hogar, 10=Seguros, 11=Formación, 12=Impuestos

const CATEGORY_MAP = {
  // Supermercado
  'supermercado': 1, 'almacen': 1, 'almacén': 1, 'verduleria': 1, 'verdulería': 1,
  'carniceria': 1, 'carnicería': 1, 'delivery': 1, 'limpieza': 1,
  // Gastos Fijos
  'gastos fijos': 2, 'servicios': 2, 'suscripciones': 2,
  // Transporte
  'transporte': 3, 'auto': 3, 'combustible': 3, 'nafta': 3, 'peaje': 3,
  'vehiculo': 3, 'vehículo': 3,
  // Mascotas
  'mascotas': 4, 'mascota': 4, 'olivia': 4,
  // Salidas & Gastronomía
  'gastronomia': 5, 'gastronomía': 5, 'restaurante': 5, 'bar': 5, 'café': 5,
  'cafeteria': 5, 'cafetería': 5, 'helado': 5, 'dulces': 5, 'food': 5,
  // Social & Eventos
  'social': 6, 'eventos': 6, 'regalo': 6, 'regalos': 6, 'juntadas': 6,
  'ocio': 6, 'cumpleaños': 6,
  // Ocio & Recreación
  'recreacion': 7, 'recreación': 7, 'gaming': 7, 'paseo': 7, 'vacaciones': 7,
  'entretenimiento': 7,
  // Deportes & Bienestar
  'deportes': 8, 'salud': 8, 'farmacia': 8, 'gimnasio': 8, 'futbol': 8,
  'fútbol': 8, 'bienestar': 8, 'higiene': 8,
  // Vivienda & Hogar
  'vivienda': 9, 'hogar': 9, 'muebles': 9, 'electrodomesticos': 9,
  'electrodomésticos': 9, 'reparaciones': 9, 'decoracion': 9, 'decoración': 9,
  // Seguros
  'seguros': 10, 'seguro': 10,
  // Formación
  'formacion': 11, 'formación': 11, 'cursos': 11, 'libros': 11, 'educacion': 11,
  'educación': 11,
  // Impuestos
  'impuestos': 12, 'abl': 12, 'ganancias': 12, 'ingresos brutos': 12,
};

const SUBCATEGORY_MAP = {
  // Supermercado (cat 1)
  'almacen': 1, 'almacén': 1, 'super': 1, 'supermercado': 1,
  'carniceria': 2, 'carnicería': 2,
  'verduleria': 3, 'verdulería': 3,
  'delivery': 4,
  'articulos limpieza': 5, 'artículos limpieza': 5, 'limpieza hogar': 5,
  'equipamiento': 6,
  // Gastos Fijos (cat 2)
  'celular': 7, 'luz': 8, 'gas': 9, 'agua': 10, 'internet': 11,
  'fibra': 11, 'cable': 12, 'suscripcion': 13, 'suscripción': 13, 'streaming': 13,
  // Transporte (cat 3)
  'combustible': 14, 'nafta': 14, 'auto mantenimiento': 15, 'mantenimiento': 15,
  'peaje': 16, 'peajes': 16, 'multas': 17, 'garage': 18, 'tramites': 19, 'trámites': 19,
  // Mascotas (cat 4)
  'alimento': 20, 'alimentacion mascota': 20, 'vet': 21, 'veterinario': 21,
  'juguetes': 22, 'accesorios': 22,
  // Salidas (cat 5)
  'restaurante': 23, 'restaurantes': 23, 'bar': 24, 'bares': 24,
  'helado': 25, 'heladeria': 25, 'heladería': 25, 'dulces': 25, 'cafeteria': 25,
  // Social (cat 6)
  'regalo': 26, 'regalos': 26, 'juntada': 27, 'juntadas': 27, 'cumpleaños': 28,
  'o - otros': 27, 'ocio': 27,
  // Ocio (cat 7)
  'recreacion': 29, 'recreación': 29, 'gaming': 30, 'paseo': 31, 'vacaciones': 32,
  // Deportes (cat 8)
  'futbol': 33, 'fútbol': 33, 'gimnasio': 34, 'suplementos': 35,
  'farmacia': 36, 'medicamento': 36, 'cuidado personal': 37, 'higiene': 37,
  // Vivienda (cat 9)
  'muebles': 38, 'electrodomestico': 39, 'electrodoméstico': 39,
  'electrodomesticos': 39, 'electrodomésticos': 39,
  'reparacion': 40, 'reparación': 40, 'reparaciones': 40,
  'decoracion': 41, 'decoración': 41, 'limpieza': 42,
  // Seguros (cat 10)
  'vehiculo': 43, 'vehículo': 43, 'seguro auto': 43, 'seguro vida': 45,
  // Formación (cat 11)
  'cursos': 47, 'libros': 48, 'material escolar': 49,
  // Impuestos (cat 12)
  'abl': 50, 'ingresos brutos': 51, 'ganancias': 53,
};

function getCategoryId(catStr) {
  const key = catStr.toLowerCase().trim();
  // Búsqueda exacta
  if (CATEGORY_MAP[key] !== undefined) return CATEGORY_MAP[key];
  // Búsqueda parcial
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 7; // Ocio como fallback genérico
}

function getSubcategoryId(subcatStr, catId) {
  const key = subcatStr.toLowerCase().trim();
  if (SUBCATEGORY_MAP[key] !== undefined) return SUBCATEGORY_MAP[key];
  for (const [k, v] of Object.entries(SUBCATEGORY_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Fallback por categoría
  const fallbacks = { 1:1, 2:13, 3:14, 4:20, 5:23, 6:27, 7:29, 8:36, 9:40, 10:43, 11:47, 12:50 };
  return fallbacks[catId] || 29;
}

// ─── Leer los Excel ─────────────────────────────────────────────────────────
const MONTH_SHEETS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number' || serial < 40000) return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

function extractRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const rows = [];

  for (const sheetName of MONTH_SHEETS) {
    if (!wb.SheetNames.includes(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Buscar fila de encabezados
    let headerRow = -1;
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const rowStr = raw[i].join('|').toUpperCase();
      if (rowStr.includes('CATEGOR') && rowStr.includes('FECHA') && rowStr.includes('IMPORTE')) {
        headerRow = i;
        break;
      }
    }

    let catIdx = 0, subcatIdx = 1, fechaIdx = 2, detalleIdx = 3, importeIdx = 4;

    if (headerRow >= 0) {
      const h = raw[headerRow].map(x => String(x).toUpperCase().trim());
      catIdx = h.findIndex(x => x.includes('CATEGOR') && !x.includes('SUBCAT'));
      subcatIdx = h.findIndex(x => x.includes('SUBCAT'));
      fechaIdx = h.findIndex(x => x.includes('FECHA'));
      detalleIdx = h.findIndex(x => x.includes('DETALLE') || x.includes('DESCRIP'));
      importeIdx = h.findIndex(x => x.includes('IMPORTE') || x.includes('MONTO'));
      if (catIdx < 0) catIdx = 0;
      if (subcatIdx < 0) subcatIdx = 1;
      if (fechaIdx < 0) fechaIdx = 2;
      if (detalleIdx < 0) detalleIdx = 3;
      if (importeIdx < 0) importeIdx = 4;
    }

    const startRow = headerRow >= 0 ? headerRow + 1 : 5;

    for (let i = startRow; i < raw.length; i++) {
      const row = raw[i];
      const cat = String(row[catIdx] || '').trim();
      const fecha = row[fechaIdx];
      const importe = row[importeIdx];

      if (!cat || cat.length < 2 || cat.toUpperCase().includes('CATEGOR')) continue;
      if (typeof importe !== 'number' || importe <= 0) continue;
      if (typeof fecha !== 'number' || fecha < 40000) continue;

      const fechaISO = excelDateToISO(fecha);
      if (!fechaISO) continue;

      const subcatStr = String(row[subcatIdx] || '').trim();
      const detalle = String(row[detalleIdx] || '').trim();

      const catId = getCategoryId(cat);
      const subcatId = getSubcategoryId(subcatStr || cat, catId);

      rows.push({
        date: fechaISO,
        category_id: catId,
        subcategory_id: subcatId,
        detail: detalle || `${cat} - ${subcatStr}`,
        amount: importe,
        notes: '',
        module_origin: 'expense',
        status: 'active',
        sync_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  return rows;
}

console.log('📖 Leyendo Gastos 2025.xlsx...');
const rows2025 = extractRows('C:\\Users\\Ulises\\Desktop\\Gastos 2025.xlsx');
console.log(`   → ${rows2025.length} filas`);

console.log('📖 Leyendo Gastos 2026.xlsx...');
const rows2026 = extractRows('C:\\Users\\Ulises\\Desktop\\Gastos 2026.xlsx');
console.log(`   → ${rows2026.length} filas`);

const allRows = [...rows2025, ...rows2026];

// Desduplicar
const seen = new Set();
const unique = allRows.filter(r => {
  const key = `${r.date}|${r.amount}|${r.detail.toLowerCase().trim()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`✅ Total únicos: ${unique.length} (se eliminaron ${allRows.length - unique.length} duplicados)`);

// Asignar IDs secuenciales
unique.forEach((r, i) => { r.id = i + 1; });

// ─── Actualizar historical-data.json ───────────────────────────────────────
const jsonPath = 'src/lib/historical-data.json';
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Mantener categorías, subcategorías y gastos fijos originales
// Reemplazar expenses, limpiar income/loans/reintegros sintéticos
data.expenses = unique;
data.income = [];
data.loans = [];
data.reintegros = [];
data.loan_payments = [];
data.fixed_expense_payments = [];

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
console.log('✅ historical-data.json actualizado con los gastos reales del Excel');

// ─── Resumen por categoría ──────────────────────────────────────────────────
const catNames = Object.fromEntries(data.categories.map(c => [c.id, c.name]));
const byCat = {};
for (const r of unique) {
  const name = catNames[r.category_id] || `Cat ${r.category_id}`;
  if (!byCat[name]) byCat[name] = { count: 0, total: 0 };
  byCat[name].count++;
  byCat[name].total += r.amount;
}
const fmt = v => '$' + Math.round(v).toLocaleString('es-AR');
console.log('\n📊 Resumen por categoría:');
for (const [cat, d] of Object.entries(byCat).sort((a,b) => b[1].total - a[1].total)) {
  console.log(`   ${cat}: ${d.count} gastos | ${fmt(d.total)}`);
}
