const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = [
  'C:\\Users\\Ulises\\Desktop\\Gastos 2025.xlsx',
  'C:\\Users\\Ulises\\Desktop\\Gastos 2026.xlsx',
];

// Analizar todas las hojas de todos los archivos
for (const filePath of files) {
  console.log('\n===================================================');
  console.log('ARCHIVO:', path.basename(filePath));
  console.log('===================================================');

  const wb = XLSX.readFile(filePath);
  console.log('Hojas:', wb.SheetNames);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log(`\n--- Hoja: "${sheetName}" ---`);
    console.log('Total filas:', data.length);
    if (data.length > 0) {
      console.log('Encabezados (fila 1):', JSON.stringify(data[0]));
    }
    if (data.length > 1) {
      console.log('Muestra fila 2:', JSON.stringify(data[1]));
    }
    if (data.length > 2) {
      console.log('Muestra fila 3:', JSON.stringify(data[2]));
    }
    if (data.length > 3) {
      console.log('Muestra fila 4:', JSON.stringify(data[3]));
    }
    // Mostrar última fila no vacía
    const lastRow = [...data].reverse().find(r => r.some(c => c !== ''));
    if (lastRow) {
      console.log('Última fila con datos:', JSON.stringify(lastRow));
    }
  }
}
