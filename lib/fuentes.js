// Trae el contenido útil de un link (web de recetas o posteo de Instagram).
// Devuelve { texto, imagen, fuente, titulo } o lanza error.

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function bajar(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function decodificar(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function meta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodificar(m[1] || m[2]) : '';
}

function textoPlano(html) {
  return decodificar(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Busca datos estructurados schema.org/Recipe (casi todas las webs de recetas los tienen).
function recetaJsonLd(html) {
  const bloques = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of bloques) {
    try {
      const data = JSON.parse(b[1].trim());
      const encontrada = buscarRecipe(data);
      if (encontrada) return encontrada;
    } catch {
      /* JSON inválido, seguimos */
    }
  }
  return null;
}

function buscarRecipe(nodo) {
  if (!nodo || typeof nodo !== 'object') return null;
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const r = buscarRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const tipo = [].concat(nodo['@type'] || []);
  if (tipo.includes('Recipe')) return nodo;
  if (nodo['@graph']) return buscarRecipe(nodo['@graph']);
  return null;
}

function imagenDe(recipe) {
  const img = recipe && recipe.image;
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return typeof img[0] === 'string' ? img[0] : img[0]?.url || '';
  return img.url || '';
}

function esInstagram(url) {
  return /instagram\.com/i.test(url);
}

async function desdeInstagram(url) {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  let texto = '';
  let imagen = '';
  let titulo = '';

  // 1) La versión "embed" suele traer el texto del posteo sin pedir login.
  if (m) {
    try {
      const html = await bajar(`https://www.instagram.com/p/${m[2]}/embed/captioned/`);
      const cap = html.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments/i);
      if (cap) texto = textoPlano(cap[1]);
      const im = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/i);
      if (im) imagen = decodificar(im[1]);
    } catch {
      /* seguimos con el plan 2 */
    }
  }

  // 2) Las etiquetas "og" de la página normal.
  if (!texto) {
    try {
      const html = await bajar(url);
      texto = meta(html, 'og:description') || meta(html, 'description');
      titulo = meta(html, 'og:title');
      imagen = imagen || meta(html, 'og:image');
    } catch {
      /* nada */
    }
  }

  return { texto: [titulo, texto].filter(Boolean).join('\n\n'), imagen, fuente: 'Instagram' };
}

async function desdeWeb(url) {
  const html = await bajar(url);
  const fuente = meta(html, 'og:site_name') || new URL(url).hostname.replace(/^www\./, '');
  const recipe = recetaJsonLd(html);
  if (recipe) {
    return {
      texto: 'Datos estructurados de la receta (schema.org):\n' + JSON.stringify(recipe).slice(0, 30000),
      imagen: imagenDe(recipe) || meta(html, 'og:image'),
      fuente,
    };
  }
  return {
    texto:
      `Título: ${meta(html, 'og:title') || ''}\nDescripción: ${meta(html, 'og:description') || ''}\n\n` +
      textoPlano(html).slice(0, 40000),
    imagen: meta(html, 'og:image'),
    fuente,
  };
}

async function leerLink(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('El link no es válido');
  return esInstagram(url) ? desdeInstagram(url) : desdeWeb(url);
}

module.exports = { leerLink };
