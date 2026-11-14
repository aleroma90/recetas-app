const path = require('path');
require('dotenv').config({ path: ['.env.local', '.env'] });
const express = require('express');
const { leerLink } = require('./lib/fuentes');
const { extraerReceta, buscarRecetas, crearReceta } = require('./lib/ia');
const sheets = require('./lib/sheets');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Extraer receta con IA ---
app.post('/api/extraer', async (req, res) => {
  const { url = '', texto = '', imagenes = [] } = req.body || {};
  if (!url && !texto.trim() && !imagenes.length) {
    return res.status(400).json({ error: 'Pegá un link, un texto o subí una captura.' });
  }

  let contenido = texto;
  let imagen = '';
  let fuente = '';
  let avisoLink = '';

  if (url) {
    try {
      const datos = await leerLink(url);
      imagen = datos.imagen;
      fuente = datos.fuente;
      contenido = [datos.texto, texto].filter(Boolean).join('\n\n---\nTexto agregado por el usuario:\n');
    } catch (err) {
      console.error('leerLink', err.message);
      avisoLink = 'No pude abrir el link.';
    }
  }

  if (!contenido.trim() && !imagenes.length) {
    return res.status(422).json({
      error: `${avisoLink || 'El link no trae la receta.'} Copiá el texto del posteo o subí una captura.`,
      necesitaTexto: true,
    });
  }

  try {
    const receta = await extraerReceta({ texto: contenido, imagenes, url });
    if (!receta.es_receta) {
      return res.status(422).json({
        error: 'No encontré una receta ahí. Si está en el video, copiá el texto o subí una captura.',
        necesitaTexto: true,
      });
    }
    delete receta.es_receta;
    res.json({
      receta: { ...receta, url_origen: url, fuente: fuente || (url ? '' : 'Texto pegado'), imagen },
    });
  } catch (err) {
    console.error('extraer', err);
    res.status(500).json({ error: 'No se pudo procesar la receta. Probá de nuevo en un rato.' });
  }
});

// --- Buscar recetas nuevas (web + ideas de IA) ---
app.post('/api/descubrir', async (req, res) => {
  const pedido = String(req.body?.pedido || '').trim().slice(0, 2000);
  if (!pedido) return res.status(400).json({ error: 'Contame qué tenés ganas de cocinar.' });
  try {
    const excluir = (Array.isArray(req.body?.excluir) ? req.body.excluir : []).map(String).slice(0, 60);
    const v = Number(req.body?.variedad);
    const variedad = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null;
    res.json({ resultados: await buscarRecetas(pedido, { excluir, variedad }) });
  } catch (err) {
    console.error('descubrir', err);
    res.status(500).json({ error: 'No pude buscar recetas ahora. Probá de nuevo en un rato.' });
  }
});

app.post('/api/crear', async (req, res) => {
  const { titulo = '', descripcion = '', pedido = '' } = req.body || {};
  if (!titulo) return res.status(400).json({ error: 'Falta la idea de receta.' });
  try {
    const receta = await crearReceta({ titulo, descripcion, pedido });
    delete receta.es_receta;
    res.json({ receta: { ...receta, url_origen: '', fuente: 'Creada por IA', imagen: '' } });
  } catch (err) {
    console.error('crear', err);
    res.status(500).json({ error: 'No pude armar la receta. Probá de nuevo.' });
  }
});

// --- Recetas (Google Sheet) ---
app.get('/api/recetas', async (_req, res) => {
  try {
    res.json({ recetas: await sheets.listar() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recetas', async (req, res) => {
  try {
    res.json({ receta: await sheets.guardar(req.body.receta) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recetas/:id', async (req, res) => {
  try {
    res.json({ ok: await sheets.borrar(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => console.log(`Recetas de Casa en http://localhost:${PORT}`));
}

module.exports = app;
