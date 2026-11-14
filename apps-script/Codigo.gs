/**
 * Recetas de Casa — puente entre la app y el Google Sheet.
 *
 * Cómo instalarlo (una sola vez):
 * 1. Abrí tu Google Sheet → Extensiones → Apps Script.
 * 2. Borrá lo que haya y pegá TODO este archivo.
 * 3. Cambiá CLAVE_SECRETA por una frase larga inventada (la misma va en Vercel como SHEETS_SECRET).
 * 4. Implementar → Nueva implementación → Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier usuario
 * 5. Copiá la URL que termina en /exec (va en Vercel como SHEETS_URL).
 */

const CLAVE_SECRETA = 'CAMBIAR-POR-UNA-FRASE-LARGA';
const HOJA = 'Recetas';

const COLUMNAS = [
  'id', 'creada', 'actualizada', 'titulo', 'descripcion', 'url_origen', 'fuente', 'imagen',
  'porciones', 'tiempo_total_min', 'tiempo_activo_min', 'dificultad', 'sabor',
  'tipo_plato', 'metodo', 'dietas', 'cocina', 'etiquetas',
  'ingredientes', 'pasos', 'tips', 'hecha', 'puntaje', 'cargada_por'
];
// Columnas que guardan listas (se escriben como texto separado por comas).
const LISTAS = ['tipo_plato', 'metodo', 'dietas', 'etiquetas'];

function doGet() {
  return json_({ ok: true, mensaje: 'Recetas de Casa: el puente funciona.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.secret !== CLAVE_SECRETA) return json_({ ok: false, error: 'Clave secreta incorrecta' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (body.action === 'list') return json_({ ok: true, recetas: listar_() });
      if (body.action === 'save') return json_({ ok: true, receta: guardar_(body.receta) });
      if (body.action === 'delete') return json_({ ok: true, borrada: borrar_(body.id) });
      return json_({ ok: false, error: 'Acción desconocida' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) sh = ss.insertSheet(HOJA);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function listar_() {
  const sh = hoja_();
  const filas = sh.getLastRow() - 1;
  if (filas < 1) return [];
  const encabezado = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const datos = sh.getRange(2, 1, filas, encabezado.length).getValues();
  return datos
    .filter(function (f) { return f[0]; })
    .map(function (f) {
      const r = {};
      encabezado.forEach(function (col, i) { r[col] = desdeCelda_(col, f[i]); });
      return r;
    });
}

function guardar_(receta) {
  if (!receta) throw new Error('Falta la receta');
  const sh = hoja_();
  const ahora = new Date().toISOString();
  if (!receta.id) {
    receta.id = Utilities.getUuid();
    receta.creada = ahora;
  }
  receta.actualizada = ahora;

  const fila = COLUMNAS.map(function (col) { return aCelda_(col, receta[col]); });
  const n = buscarFila_(sh, receta.id);
  if (n) {
    sh.getRange(n, 1, 1, COLUMNAS.length).setValues([fila]);
  } else {
    sh.appendRow(fila);
  }
  return receta;
}

function borrar_(id) {
  const sh = hoja_();
  const n = buscarFila_(sh, id);
  if (n) sh.deleteRow(n);
  return !!n;
}

function buscarFila_(sh, id) {
  const filas = sh.getLastRow() - 1;
  if (filas < 1 || !id) return 0;
  const ids = sh.getRange(2, 1, filas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return 0;
}

function aCelda_(col, v) {
  if (v === undefined || v === null) return '';
  if (LISTAS.indexOf(col) >= 0) return (v || []).join(', ');
  if (col === 'ingredientes') return JSON.stringify(v || []);
  if (col === 'pasos') return (v || []).map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n');
  if (col === 'hecha') return v ? 'sí' : '';
  return v;
}

function desdeCelda_(col, v) {
  if (LISTAS.indexOf(col) >= 0) {
    return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  }
  if (col === 'ingredientes') {
    try { return JSON.parse(v || '[]'); } catch (e) { return []; }
  }
  if (col === 'pasos') {
    return String(v || '').split('\n')
      .map(function (s) { return s.replace(/^\s*\d+[.)]\s*/, '').trim(); })
      .filter(String);
  }
  if (col === 'hecha') return String(v).toLowerCase().indexOf('s') === 0;
  if (['porciones', 'tiempo_total_min', 'tiempo_activo_min', 'puntaje'].indexOf(col) >= 0) {
    return v === '' ? null : Number(v);
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
