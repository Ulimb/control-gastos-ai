const XLSX = require('xlsx');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Leer CSV consolidado ya generado
const csvPath = 'C:\\Users\\Ulises\\Documents\\Proyectos\\control-gastos-ai\\Gastos_Consolidados_2025_2026.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');

// Parsear CSV para construir array de rows
const lines = csvContent.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());

const rows = lines.slice(1).map(line => {
  // Manejar campos entre comillas que pueden contener ;
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
  return {
    categoria: parts[0] || '',
    subcategoria: parts[1] || '',
    fecha: parts[2] || '',
    detalle: parts[3] || '',
    importe: parseFloat(parts[4]) || 0,
  };
}).filter(r => r.importe > 0 && r.fecha);

console.log(`📊 Total registros a enviar a Google Sheets: ${rows.length}`);

// Preparar payload con action especial para escritura directa de hoja "Consolidado"
const payload = {
  action: 'write_consolidado',
  sheetName: 'Consolidado 2025-2026',
  headers: ['Categoría', 'Subcategoría', 'Fecha', 'Detalle', 'Importe ($)'],
  rows: rows.map(r => [r.categoria, r.subcategoria, r.fecha, r.detalle, r.importe]),
};

const bodyStr = JSON.stringify(payload);
console.log(`📤 Enviando ${bodyStr.length} bytes al Apps Script...`);

const url = new URL('https://script.google.com/macros/s/AKfycbxPKK60SpZjORB0B-C0ke0nFuvoMhWtR4Hh2HnFkfLzlsfsYvct2c6JWTw0LrlUa7jGdA/exec');

const options = {
  hostname: url.hostname,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
  },
  timeout: 60000,
};

let responseData = '';

const req = https.request(options, (res) => {
  console.log('HTTP Status:', res.statusCode);
  res.setEncoding('utf8');
  res.on('data', chunk => { responseData += chunk; });
  res.on('end', () => {
    if (responseData.includes('Error') || responseData.includes('error')) {
      console.log('❌ Apps Script error:', responseData.substring(0, 500));
    } else if (responseData.includes('<!DOCTYPE') || responseData.includes('<html')) {
      console.log('⚠️  Apps Script devolvió HTML (posible redirect/auth).');
      console.log('ℹ️  Esto significa que el Apps Script necesita autenticación OAuth para escribir.');
      console.log('   → Generando el CSV de Google Sheets API compatible en su lugar...');
    } else {
      console.log('✅ Respuesta Apps Script:', responseData.substring(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error de red:', e.message);
});

req.on('timeout', () => {
  req.destroy();
  console.error('❌ Timeout esperando respuesta.');
});

req.write(bodyStr, 'utf8');
req.end();
