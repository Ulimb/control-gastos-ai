const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Configuración ─────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPKK60SpZjORB0B-C0ke0nFuvoMhWtR4Hh2HnFkfLzlsfsYvct2c6JWTw0LrlUa7jGdA/exec';
const SHEETS_ID = '110TxjS6ZcSonGodMz6jPicicXidOPz6_ihb3i5-RtdA';

// Meses de gastos que tienen datos reales
const MONTH_SHEETS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Numero de mes por nombre
const MONTH_NUM = {
  Enero: '01', Febrero: '02', Marzo: '03', Abril: '04',
  Mayo: '05', Junio: '06', Julio: '07', Agosto: '08',
  Septiembre: '09', Octubre: '10', Noviembre: '11', Diciembre: '12',
};

// Conversión de número de serie Excel a fecha ISO
function excelDateToISO(serial, year) {
  if (!serial || typeof serial !== 'number' || serial < 1000) return null;
  // Excel fecha serial: días desde 1/1/1900
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const date = new Date(utcMs);
  return date.toISOString().split('T')[0];
}

// ─── Extraer filas de un archivo y año ─────────────────────────────────────
function extractFromFile(filePath, year) {
  const rows = [];
  const wb = XLSX.readFile(filePath);

  for (const sheetName of MONTH_SHEETS) {
    if (!wb.SheetNames.includes(sheetName)) continue;

    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Buscar la fila con los encabezados reales
    let headerRow = -1;
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const row = raw[i];
      const rowStr = row.join('|').toUpperCase();
      if (rowStr.includes('CATEGOR') && rowStr.includes('FECHA') && rowStr.includes('IMPORTE')) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) {
      // Buscar en Enero que tiene encabezado especial
      // Columnas: CATEGORÍA=0, SUBCATEGORÍA=1, FECHA=2, DETALLE=3, IMPORTE=4
      // Inspeccionar primera fila que tenga string en col 0 y número en col 4
      for (let i = 5; i < raw.length; i++) {
        const row = raw[i];
        const cat = String(row[0] || '').trim();
        const fecha = row[2];
        const importe = row[4];

        if (cat && cat.length > 2 && typeof fecha === 'number' && fecha > 40000 && typeof importe === 'number' && importe > 0) {
          const fechaISO = excelDateToISO(fecha, year);
          if (!fechaISO) continue;

          rows.push({
            año: year,
            mes: sheetName,
            categoria: String(row[0] || '').trim(),
            subcategoria: String(row[1] || '').trim(),
            fecha: fechaISO,
            detalle: String(row[3] || '').trim(),
            importe: importe,
          });
        }
      }
      continue;
    }

    // Extraer con encabezado encontrado
    const headers = raw[headerRow].map(h => String(h).trim().toUpperCase());
    const catIdx = headers.findIndex(h => h.includes('CATEGOR') && !h.includes('SUBCAT'));
    const subcatIdx = headers.findIndex(h => h.includes('SUBCAT'));
    const fechaIdx = headers.findIndex(h => h.includes('FECHA'));
    const detalleIdx = headers.findIndex(h => h.includes('DETALLE') || h.includes('DESCRIPCI'));
    const importeIdx = headers.findIndex(h => h.includes('IMPORTE') || h.includes('MONTO') || h.includes('TOTAL'));

    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i];
      const cat = String(row[catIdx] || '').trim();
      const fecha = row[fechaIdx];
      const importe = row[importeIdx];

      if (!cat || cat.length < 2) continue;
      if (typeof importe !== 'number' || importe <= 0) continue;
      if (typeof fecha !== 'number' || fecha < 40000) continue;

      const fechaISO = excelDateToISO(fecha, year);
      if (!fechaISO) continue;

      rows.push({
        año: year,
        mes: sheetName,
        categoria: cat,
        subcategoria: String(row[subcatIdx] || '').trim(),
        fecha: fechaISO,
        detalle: String(row[detalleIdx] || '').trim(),
        importe: importe,
      });
    }
  }

  return rows;
}

// ─── Extraer todos los datos ────────────────────────────────────────────────
console.log('📖 Leyendo Gastos 2025.xlsx...');
const rows2025 = extractFromFile('C:\\Users\\Ulises\\Desktop\\Gastos 2025.xlsx', 2025);
console.log(`   → ${rows2025.length} filas extraídas`);

console.log('📖 Leyendo Gastos 2026.xlsx...');
const rows2026 = extractFromFile('C:\\Users\\Ulises\\Desktop\\Gastos 2026.xlsx', 2026);
console.log(`   → ${rows2026.length} filas extraídas`);

const allRows = [...rows2025, ...rows2026];
console.log(`\n✅ Total combinado: ${allRows.length} registros\n`);

// ─── Desduplicar por fecha + importe + detalle ──────────────────────────────
const seen = new Set();
const unique = allRows.filter(r => {
  const key = `${r.fecha}|${r.importe}|${r.detalle.toLowerCase()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
console.log(`✅ Registros únicos (sin duplicados): ${unique.length}`);

// ─── Guardar CSV local ──────────────────────────────────────────────────────
const header = 'Categoría;Subcategoría;Fecha;Detalle;Importe ($)';
const csvRows = unique.map(r =>
  `"${r.categoria}";"${r.subcategoria}";"${r.fecha}";"${r.detalle.replace(/"/g,'""')}";${r.importe}`
);
const csvContent = '\uFEFF' + header + '\n' + csvRows.join('\n');
fs.writeFileSync('C:\\Users\\Ulises\\Documents\\Proyectos\\control-gastos-ai\\Gastos_Consolidados_2025_2026.csv', csvContent, 'utf8');
console.log('💾 CSV guardado: Gastos_Consolidados_2025_2026.csv');

// ─── Resumen por mes ────────────────────────────────────────────────────────
const byMonth = {};
for (const r of unique) {
  const key = `${r.año}-${MONTH_NUM[r.mes] || '??'}`;
  if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
  byMonth[key].count++;
  byMonth[key].total += r.importe;
}
console.log('\n📊 Resumen por mes:');
for (const [mes, data] of Object.entries(byMonth).sort()) {
  const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  console.log(`   ${mes}: ${data.count} gastos | Total: ${fmt.format(data.total)}`);
}
