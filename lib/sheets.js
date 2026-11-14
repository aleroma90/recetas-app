// Habla con el Apps Script publicado sobre el Google Sheet.
// Si no hay SHEETS_URL configurada, guarda en un archivo local (solo para pruebas en la compu).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARCHIVO_LOCAL = path.join(__dirname, '..', 'datos-local.json');

async function llamar(action, extra = {}) {
  const url = process.env.SHEETS_URL;
  if (!url) return local(action, extra);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: process.env.SHEETS_SECRET, action, ...extra }),
    redirect: 'follow',
  });
  const texto = await res.text();
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error('El Google Sheet no respondió bien. Revisá que el Apps Script esté publicado como "Cualquier usuario".');
  }
  if (!data.ok) throw new Error(data.error || 'Error del Google Sheet');
  return data;
}

function local(action, { receta, id }) {
  const todas = fs.existsSync(ARCHIVO_LOCAL) ? JSON.parse(fs.readFileSync(ARCHIVO_LOCAL, 'utf8')) : [];
  const ahora = new Date().toISOString();
  if (action === 'list') return { recetas: todas };
  if (action === 'save') {
    if (!receta.id) Object.assign(receta, { id: crypto.randomUUID(), creada: ahora });
    receta.actualizada = ahora;
    const i = todas.findIndex((r) => r.id === receta.id);
    if (i >= 0) todas[i] = receta;
    else todas.push(receta);
    fs.writeFileSync(ARCHIVO_LOCAL, JSON.stringify(todas, null, 2));
    return { receta };
  }
  if (action === 'delete') {
    fs.writeFileSync(ARCHIVO_LOCAL, JSON.stringify(todas.filter((r) => r.id !== id), null, 2));
    return { borrada: true };
  }
  throw new Error('Acción desconocida');
}

module.exports = {
  listar: async () => (await llamar('list')).recetas,
  guardar: async (receta) => (await llamar('save', { receta })).receta,
  borrar: async (id) => (await llamar('delete', { id })).borrada,
};
