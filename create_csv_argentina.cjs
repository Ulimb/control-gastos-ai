const fs = require('fs');

const tsvPath = 'C:\\Users\\Ulises\\Documents\\Proyectos\\control-gastos-ai\\Gastos_Consolidados_IMPORTAR.tsv';
const tsvContent = fs.readFileSync(tsvPath, 'utf8');

const lines = tsvContent.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());

// Convertir de TSV a CSV formato argentino con punto y coma (;)
const csvLines = lines.map(line => {
  const parts = line.split('\t');
  const cat = `"${(parts[0] || '').replace(/"/g, '""')}"`;
  const subcat = `"${(parts[1] || '').replace(/"/g, '""')}"`;
  const fecha = `"${(parts[2] || '').replace(/"/g, '""')}"`;
  const detalle = `"${(parts[3] || '').replace(/"/g, '""')}"`;
  const importe = parts[4] || '0,00';
  return `${cat};${subcat};${fecha};${detalle};${importe}`;
});

const finalCsv = '\uFEFF' + csvLines.join('\n');

const outPath1 = 'C:\\Users\\Ulises\\Documents\\Proyectos\\control-gastos-ai\\Gastos_Consolidados_IMPORTAR_SHEETS.csv';
const outPath2 = 'C:\\Users\\Ulises\\Documents\\Proyectos\\mis-finanzas-web\\public\\Gastos_Consolidados_IMPORTAR_SHEETS.csv';

fs.writeFileSync(outPath1, finalCsv, 'utf8');
fs.writeFileSync(outPath2, finalCsv, 'utf8');

console.log('✅ Archivo CSV formato argentino creado con éxito: Gastos_Consolidados_IMPORTAR_SHEETS.csv');
