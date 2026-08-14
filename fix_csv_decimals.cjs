const XLSX = require('xlsx');
const fs = require('fs');

const MONTH_SHEETS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number' || serial < 40000) return null;
  const date = new Date(Math.floor(serial - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

function extractRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const rows = [];

  for (const sheetName of MONTH_SHEETS) {
    if (!wb.SheetNames.includes(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    let headerRow = -1;
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const rowStr = raw[i].join('|').toUpperCase();
      if (rowStr.includes('CATEGOR') && rowStr.includes('FECHA') && rowStr.includes('IMPORTE')) {
        headerRow = i; break;
      }
    }

    let catIdx=0, subcatIdx=1, fechaIdx=2, detalleIdx=3, importeIdx=4;
    if (headerRow >= 0) {
      const h = raw[headerRow].map(x => String(x).toUpperCase().trim());
      catIdx = h.findIndex(x => x.includes('CATEGOR') && !x.includes('SUBCAT'));
      subcatIdx = h.findIndex(x => x.includes('SUBCAT'));
      fechaIdx = h.findIndex(x => x.includes('FECHA'));
      detalleIdx = h.findIndex(x => x.includes('DETALLE') || x.includes('DESCRIP'));
      importeIdx = h.findIndex(x => x.includes('IMPORTE') || x.includes('MONTO'));
      if (catIdx<0) catIdx=0;
      if (subcatIdx<0) subcatIdx=1;
      if (fechaIdx<0) fechaIdx=2;
      if (detalleIdx<0) detalleIdx=3;
      if (importeIdx<0) importeIdx=4;
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

      rows.push({
        categoria: cat,
        subcategoria: String(row[subcatIdx] || '').trim(),
        fecha: fechaISO,
        detalle: String(row[detalleIdx] || '').trim(),
        // Mantener exactamente el número con decimales sin redondear
        importe: importe,
      });
    }
  }
  return rows;
}

console.log('📖 Leyendo archivos Excel...');
const rows2025 = extractRows('C:\\Users\\Ulises\\Desktop\\Gastos 2025.xlsx');
const rows2026 = extractRows('C:\\Users\\Ulises\\Desktop\\Gastos 2026.xlsx');
const allRows = [...rows2025, ...rows2026];

// Desduplicar
const seen = new Set();
const unique = allRows.filter(r => {
  const key = `${r.fecha}|${r.importe}|${r.detalle.toLowerCase().trim()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`✅ ${unique.length} registros únicos (${allRows.length - unique.length} duplicados eliminados)`);

// Verificar cuántos tienen decimales
const withDecimals = unique.filter(r => r.importe % 1 !== 0);
console.log(`💡 Registros con centavos: ${withDecimals.length}`);
console.log('Ejemplos con decimales:');
withDecimals.slice(0, 5).forEach(r => console.log(`   ${r.fecha} | ${r.detalle} | $${r.importe}`));

// ─── Generar CSV con COMA como decimal (formato español para Google Sheets)
// Usar TAB como separador de columnas para evitar conflictos con punto/coma
const header = 'Categoría\tSubcategoría\tFecha\tDetalle\tImporte';

const csvRowsES = unique.map(r => {
  // Importe con coma decimal (formato español/argentino)
  const importeStr = r.importe.toFixed(2).replace('.', ',');
  const detalle = r.detalle.replace(/\t/g, ' ').replace(/"/g, '""');
  return `${r.categoria}\t${r.subcategoria}\t${r.fecha}\t${detalle}\t${importeStr}`;
});

// También generar versión con separador coma y punto decimal (más compatible)
const csvPunto = [
  'Categoría,Subcategoría,Fecha,Detalle,Importe',
  ...unique.map(r => {
    const importeStr = r.importe.toFixed(2); // punto decimal
    const detalle = (r.detalle || '').replace(/,/g, ' ');
    return `"${r.categoria}","${r.subcategoria}","${r.fecha}","${detalle}",${importeStr}`;
  })
].join('\n');

// Versión TSV (tabs) — más segura con decimales y comas en texto
const tsvContent = '\uFEFF' + header + '\n' + csvRowsES.join('\n');

const outputDir = 'C:\\Users\\Ulises\\Documents\\Proyectos\\control-gastos-ai\\';

// Guardar TSV (abrir con Excel/Sheets: sin conflicto de decimales)
fs.writeFileSync(outputDir + 'Gastos_Consolidados_IMPORTAR.tsv', tsvContent, 'utf8');
console.log('\n✅ TSV guardado: Gastos_Consolidados_IMPORTAR.tsv');
console.log('   → Para importar en Google Sheets: Archivo > Importar > este archivo TSV');
console.log('   → En "Tipo de separador" seleccioná "Tabulaciones"');

// Guardar también CSV con punto decimal por si acaso
fs.writeFileSync(outputDir + 'Gastos_Consolidados_PuntoDecimal.csv', '\uFEFF' + csvPunto, 'utf8');
console.log('✅ CSV punto decimal guardado: Gastos_Consolidados_PuntoDecimal.csv');

// Mostrar 3 ejemplos del TSV para verificar
console.log('\n📋 Primeras 3 filas del TSV generado:');
tsvContent.split('\n').slice(1, 4).forEach(l => console.log('  ', l));
