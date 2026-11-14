'use strict';

/* ================= Etiquetas legibles ================= */
const NOMBRES = {
  dificultad: { facil: 'Fácil', media: 'Media', dificil: 'Difícil' },
  sabor: { salado: 'Salado', dulce: 'Dulce', agridulce: 'Agridulce' },
  tipo_plato: {
    desayuno: 'Desayuno', almuerzo_cena: 'Almuerzo / cena', entrada: 'Entrada', guarnicion: 'Guarnición',
    postre: 'Postre', merienda: 'Merienda', snack: 'Snack', bebida: 'Bebida', salsa: 'Salsa', panificado: 'Panificado',
  },
  metodo: {
    horno: 'Horno', sarten: 'Sartén', olla: 'Olla', airfryer: 'Airfryer', parrilla: 'Parrilla',
    microondas: 'Microondas', freidora: 'Fritura', licuadora: 'Licuadora / mixer', sin_coccion: 'Sin cocción',
  },
  dietas: {
    vegetariano: 'Vegetariano', vegano: 'Vegano', sin_tacc: 'Sin TACC', sin_lactosa: 'Sin lactosa',
    sin_azucar: 'Sin azúcar', saludable: 'Saludable',
  },
  tiempo: { t15: 'Hasta 15 min', t30: 'Hasta 30 min', t60: 'Hasta 1 h', tmas: 'Más de 1 h' },
  hecha: { si: 'Ya la hicimos', no: 'Por probar' },
  extra: { top: '4★ o más', pocos: 'Pocos ingredientes (≤ 6)' },
};
const EMOJI = { dulce: '🍰', salado: '🍲', agridulce: '🥢' };
const BASICOS = ['sal', 'aceite', 'agua', 'pimienta', 'azucar', 'hielo', 'aceite de oliva', 'sal gruesa', 'pimienta negra'];

/* ================= Estado ================= */
const estado = {
  recetas: [],
  texto: '',
  modoTengo: false,
  tengo: [],
  basicos: true,
  filtros: { sabor: [], dificultad: [], tiempo: [], tipo_plato: [], metodo: [], dietas: [], hecha: [], extra: [] },
  fotos: [], // {media_type, data, url}
  borrador: null,
  actual: null,
  porciones: null,
  cocinaPaso: 0,
  wakeLock: null,
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } }
function leerLocal(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }

/* ================= API ================= */
async function api(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(ruta, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Algo salió mal');
    e.datos = data;
    throw e;
  }
  return data;
}

function cargando(on, txt = 'Cargando…') {
  $('#cargando').classList.toggle('oculto', !on);
  $('#cargando-txt').textContent = txt;
}
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('oculto');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('oculto'), 2800);
}

/* ================= Navegación ================= */
const VISTAS = ['lista', 'agregar', 'descubrir', 'editar', 'detalle', 'cocina'];
function mostrarVista(v) {
  VISTAS.forEach((n) => $(`#v-${n}`).classList.toggle('oculto', n !== v));
  window.scrollTo(0, 0);
  if (v !== 'cocina') soltarPantalla();
}
function ir(hash) { estado.navegoEnApp = true; location.hash = hash; }

function enrutar() {
  const h = location.hash.replace(/^#\/?/, '');
  const [ruta, id] = h.split('/');
  // Después de guardar una receta nueva, "atrás" saltea las pantallas de carga y vuelve a la lista.
  if (estado.flujoCerrado) {
    if (['agregar', 'descubrir', 'editar'].includes(ruta)) return history.back();
    if (ruta !== 'receta' && ruta !== 'cocina') estado.flujoCerrado = false;
  }
  if (ruta === 'agregar') return mostrarVista('agregar');
  if (ruta === 'descubrir') return mostrarVista('descubrir');
  if (ruta === 'receta' && id) {
    const r = estado.recetas.find((x) => x.id === id);
    if (!r) return ir('#/');
    return abrirDetalle(r);
  }
  if (ruta === 'editar') {
    if (id) {
      const r = estado.recetas.find((x) => x.id === id);
      if (!r) return ir('#/');
      estado.borrador = structuredClone(r);
    }
    if (!estado.borrador) return ir('#/agregar');
    return abrirEditor();
  }
  if (ruta === 'cocina' && estado.actual) return abrirCocina();
  mostrarVista('lista');
  pintarLista();
}
window.addEventListener('hashchange', enrutar);
// "Volver": desde el editor vuelve a la pantalla anterior; desde el resto, a la lista.
document.querySelectorAll('.volver').forEach((b) => b.addEventListener('click', () => {
  if (b.closest('#v-editar')) {
    const id = estado.borrador?.id;
    estado.borrador = null;
    if (id && estado.editandoDesdeDetalle) { estado.editandoDesdeDetalle = false; return history.back(); }
    location.replace(id ? `#/receta/${id}` : estado.origen === 'descubrir' ? '#/descubrir' : '#/agregar');
  } else if (estado.navegoEnApp) {
    history.back();
  } else {
    location.replace('#/');
  }
}));

/* ================= Recetas ================= */
async function cargarRecetas(silencioso) {
  if (!silencioso) cargando(true, 'Trayendo recetas…');
  try {
    const { recetas } = await api('/api/recetas');
    estado.recetas = recetas || [];
    guardarLocal('recetas', estado.recetas);
  } catch (err) {
    toast('Sin conexión: muestro lo último guardado.');
  } finally {
    cargando(false);
  }
}
$('#b-recargar').addEventListener('click', async () => { await cargarRecetas(); pintarLista(); });

/* ================= Texto e ingredientes ================= */
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function singular(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ces')) return w.slice(0, -3) + 'z';
  if (w.endsWith('es') && !'aeiou'.includes(w.at(-3))) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}
const IGNORAR = new Set(['de', 'del', 'la', 'el', 'en', 'y', 'con', 'a', 'al', 'para']);
function palabras(s) { return norm(s).split(' ').filter((w) => w && !IGNORAR.has(w)).map(singular); }
function coincide(ingrediente, buscado) {
  const a = palabras(ingrediente.base || ingrediente.nombre);
  const b = palabras(buscado);
  return b.length > 0 && b.every((w) => a.some((x) => x === w || (w.length > 3 && x.startsWith(w))));
}
function esBasico(ing) {
  const b = norm(ing.base || ing.nombre);
  return BASICOS.some((x) => b === x || b.startsWith(x + ' '));
}
function faltantes(r) {
  const lista = (r.ingredientes || []).filter((i) => !(estado.basicos && esBasico(i)));
  const falta = lista.filter((i) => !estado.tengo.some((t) => coincide(i, t)));
  return { falta, total: lista.length, usa: lista.length - falta.length };
}

/* ================= Filtros ================= */
function pasaTiempo(r, claves) {
  if (!claves.length) return true;
  const t = r.tiempo_total_min;
  if (t == null) return false;
  return claves.some((k) => (k === 't15' && t <= 15) || (k === 't30' && t <= 30) || (k === 't60' && t <= 60) || (k === 'tmas' && t > 60));
}
function filtrar() {
  const f = estado.filtros;
  const q = norm(estado.texto);
  let res = estado.recetas.filter((r) => {
    if (q) {
      const pajar = norm([r.titulo, r.descripcion, r.cocina, ...(r.etiquetas || []), ...(r.ingredientes || []).map((i) => i.nombre)].join(' '));
      if (!palabras(q).every((w) => pajar.includes(w) || pajar.includes(w.slice(0, -1)))) return false;
    }
    if (f.sabor.length && !f.sabor.includes(r.sabor)) return false;
    if (f.dificultad.length && !f.dificultad.includes(r.dificultad)) return false;
    if (!pasaTiempo(r, f.tiempo)) return false;
    if (f.tipo_plato.length && !f.tipo_plato.some((x) => (r.tipo_plato || []).includes(x))) return false;
    if (f.metodo.length && !f.metodo.some((x) => (r.metodo || []).includes(x))) return false;
    if (f.dietas.length && !f.dietas.every((x) => (r.dietas || []).includes(x))) return false;
    if (f.hecha.length === 1 && (f.hecha[0] === 'si') !== !!r.hecha) return false;
    if (f.extra.includes('top') && !(r.puntaje >= 4)) return false;
    if (f.extra.includes('pocos') && (r.ingredientes || []).filter((i) => !esBasico(i)).length > 6) return false;
    return true;
  });

  if (estado.modoTengo && estado.tengo.length) {
    res = res
      .map((r) => ({ r, ...faltantes(r) }))
      .filter((x) => x.usa > 0)
      .sort((a, b) => a.falta.length - b.falta.length || b.usa - a.usa)
      .map((x) => x.r);
  } else {
    res.sort((a, b) => String(b.creada || '').localeCompare(String(a.creada || '')));
  }
  return res;
}

function pintarFiltros() {
  const grupos = [
    ['sabor', 'Dulce o salado'], ['dificultad', 'Dificultad'], ['tiempo', 'Duración'], ['tipo_plato', 'Tipo de plato'],
    ['metodo', 'Cómo se cocina'], ['dietas', 'Dieta'], ['hecha', 'Historial'], ['extra', 'Más'],
  ];
  $('#panel-filtros').innerHTML =
    grupos.map(([g, titulo]) => `
      <div class="filtro-grupo"><h3>${titulo}</h3><div class="chips">
        ${Object.entries(NOMBRES[g]).map(([k, v]) =>
          `<button class="chip ${estado.filtros[g].includes(k) ? 'activo' : ''}" data-g="${g}" data-k="${k}">${v}</button>`).join('')}
      </div></div>`).join('') +
    `<button id="b-limpiar" class="btn link">Limpiar filtros</button>`;
  const n = Object.values(estado.filtros).reduce((a, x) => a + x.length, 0);
  $('#n-filtros').textContent = n;
  $('#n-filtros').classList.toggle('oculto', !n);
}
$('#panel-filtros').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'b-limpiar') Object.keys(estado.filtros).forEach((k) => (estado.filtros[k] = []));
  else {
    const arr = estado.filtros[b.dataset.g];
    const i = arr.indexOf(b.dataset.k);
    i >= 0 ? arr.splice(i, 1) : arr.push(b.dataset.k);
  }
  guardarLocal('filtros', estado.filtros);
  pintarFiltros();
  pintarLista();
});
$('#b-filtros').addEventListener('click', () => {
  const p = $('#panel-filtros');
  p.classList.toggle('oculto');
  $('#b-filtros').setAttribute('aria-expanded', String(!p.classList.contains('oculto')));
  pintarFiltros();
});
$('#i-buscar').addEventListener('input', (e) => { estado.texto = e.target.value; pintarLista(); });

/* Modo "lo que tengo" */
function setModo(tengo) {
  estado.modoTengo = tengo;
  $('#b-modo-tengo').classList.toggle('activo', tengo);
  $('#b-modo-todas').classList.toggle('activo', !tengo);
  $('#panel-tengo').classList.toggle('oculto', !tengo);
  if (tengo) setTimeout(() => $('#i-tengo').focus(), 50);
  pintarLista();
}
$('#b-modo-todas').addEventListener('click', () => setModo(false));
$('#b-modo-tengo').addEventListener('click', () => setModo(true));
function pintarTengo() {
  $('#tengo-chips').innerHTML = estado.tengo.map((t, i) => `<button class="chip activo quitable" data-i="${i}">${esc(t)}</button>`).join('');
  guardarLocal('tengo', estado.tengo);
}
function agregarTengo(valor) {
  valor.split(',').map((s) => s.trim()).filter(Boolean).forEach((v) => {
    if (!estado.tengo.some((t) => norm(t) === norm(v))) estado.tengo.push(v);
  });
  pintarTengo();
  pintarLista();
}
$('#i-tengo').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    agregarTengo(e.target.value);
    e.target.value = '';
  }
});
$('#i-tengo').addEventListener('blur', (e) => { if (e.target.value.trim()) { agregarTengo(e.target.value); e.target.value = ''; } });
$('#tengo-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  estado.tengo.splice(Number(b.dataset.i), 1);
  pintarTengo();
  pintarLista();
});
$('#c-basicos').addEventListener('change', (e) => { estado.basicos = e.target.checked; pintarLista(); });

function duracion(min) {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function pintarLista() {
  const res = filtrar();
  const total = estado.recetas.length;
  $('#vacio').classList.toggle('oculto', total > 0);
  $('#resumen').textContent = total ? (res.length === total ? `${total} recetas` : `${res.length} de ${total} recetas`) : '';
  if (estado.modoTengo && !estado.tengo.length) $('#resumen').textContent = 'Agregá lo que tenés y te ordeno las recetas por lo que te falta.';

  $('#lista').innerHTML = res.map((r) => {
    let falta = '';
    if (estado.modoTengo && estado.tengo.length) {
      const f = faltantes(r);
      falta = f.falta.length
        ? `<div class="falta">Te falta: ${esc(f.falta.slice(0, 4).map((i) => i.base || i.nombre).join(', '))}${f.falta.length > 4 ? '…' : ''}</div>`
        : '<div class="falta ok">✓ Tenés todo</div>';
    }
    const foto = r.imagen ? `style="background-image:url('${esc(r.imagen)}')"` : '';
    return `<button class="tarjeta" data-id="${esc(r.id)}">
      <div class="foto" ${foto}>${r.imagen ? '' : EMOJI[r.sabor] || '🍽️'}</div>
      <div class="info">
        <h2>${esc(r.titulo)}</h2>
        <div class="datos">
          ${r.tiempo_total_min != null ? `<span>⏱ ${duracion(r.tiempo_total_min)}</span>` : ''}
          ${r.dificultad ? `<span>${NOMBRES.dificultad[r.dificultad] || ''}</span>` : ''}
          ${r.puntaje ? `<span>${'★'.repeat(r.puntaje)}</span>` : ''}
          ${r.hecha ? '<span>✓ Hecha</span>' : ''}
        </div>
        ${falta}
      </div>
    </button>`;
  }).join('');
}
$('#lista').addEventListener('click', (e) => {
  const t = e.target.closest('.tarjeta');
  if (t) ir(`#/receta/${t.dataset.id}`);
});
$('#b-agregar').addEventListener('click', () => { limpiarAgregar(); estado.origen = 'agregar'; ir('#/agregar'); });

/* ================= Agregar ================= */
function limpiarAgregar() {
  $('#i-url').value = '';
  $('#i-texto').value = '';
  $('#agregar-error').textContent = '';
  estado.fotos = [];
  pintarMiniaturas();
}
$('#b-pegar').addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    const url = (t.match(/https?:\/\/\S+/) || [t])[0];
    $('#i-url').value = url.trim();
  } catch {
    toast('Mantené apretado el campo y elegí "Pegar".');
  }
});

function achicarImagen(file) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.72);
      URL.revokeObjectURL(img.src);
      ok({ media_type: 'image/jpeg', data: url.split(',')[1], url });
    };
    img.onerror = () => mal(new Error('No pude leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}
async function sumarFotos(e) {
  const archivos = [...e.target.files];
  if (estado.fotos.length + archivos.length > 10) toast('Hasta 10 fotos por receta.');
  for (const f of archivos.slice(0, 10 - estado.fotos.length)) {
    try { estado.fotos.push(await achicarImagen(f)); } catch (err) { toast(err.message); }
  }
  e.target.value = '';
  pintarMiniaturas();
}
$('#i-fotos').addEventListener('change', sumarFotos);
$('#i-camara').addEventListener('change', sumarFotos);
function pintarMiniaturas() {
  $('#miniaturas').innerHTML = estado.fotos.map((f, i) => `<div><img src="${f.url}" alt=""><button data-i="${i}" aria-label="Quitar">✕</button></div>`).join('');
}
$('#miniaturas').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { estado.fotos.splice(Number(b.dataset.i), 1); pintarMiniaturas(); }
});

async function extraer() {
  const url = $('#i-url').value.trim();
  const texto = $('#i-texto').value.trim();
  $('#agregar-error').textContent = '';
  if (!url && !texto && !estado.fotos.length) {
    $('#agregar-error').textContent = 'Pegá un link, un texto o elegí una captura.';
    return;
  }
  cargando(true, 'Leyendo la receta… (puede tardar unos segundos)');
  try {
    const { receta } = await api('/api/extraer', {
      method: 'POST',
      body: { url, texto, imagenes: estado.fotos.map(({ media_type, data }) => ({ media_type, data })) },
    });
    estado.borrador = receta;
    ir('#/editar');
  } catch (err) {
    $('#agregar-error').textContent = err.message;
    if (err.datos?.necesitaTexto) $('#i-texto').focus();
  } finally {
    cargando(false);
  }
}
$('#b-extraer').addEventListener('click', extraer);
$('#b-manual').addEventListener('click', () => {
  estado.borrador = {
    titulo: '', descripcion: '', url_origen: $('#i-url').value.trim(), fuente: '', imagen: '', porciones: 4,
    tiempo_total_min: null, tiempo_activo_min: null, dificultad: 'facil', sabor: 'salado', tipo_plato: [], metodo: [],
    dietas: [], cocina: '', etiquetas: [], ingredientes: [{ cantidad: null, unidad: '', nombre: '', base: '', nota: '', grupo: '' }],
    pasos: [''], tips: '', falta_info: '',
  };
  ir('#/editar');
});

/* Compartir desde otra app (Android: share target / iPhone: Atajo) */
function procesarCompartido() {
  const p = new URLSearchParams(location.search);
  const junto = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
  if (!junto) return;
  history.replaceState(null, '', '/' + location.hash);
  const url = (junto.match(/https?:\/\/\S+/) || [''])[0];
  limpiarAgregar();
  $('#i-url').value = url;
  const resto = junto.replace(url, '').trim();
  if (resto && resto.length > 40) $('#i-texto').value = resto;
  location.hash = '#/agregar';
  if (url || resto) setTimeout(extraer, 300);
}

/* ================= Buscar recetas nuevas ================= */
estado.descubrir = { contexto: '', resultados: [] };

function abrirDescubrir(contexto = '', textoContexto = '') {
  estado.descubrir = { contexto, resultados: [] };
  $('#desc-contexto').textContent = textoContexto;
  $('#desc-contexto').classList.toggle('oculto', !textoContexto);
  $('#i-pedido').value = '';
  $('#i-pedido').placeholder = contexto ? 'Opcional: algo más (ej: sin horno, para 2, más liviana)' : 'Ej: algo con pollo, rápido, sin horno, para 4';
  $('#desc-error').textContent = '';
  $('#desc-resumen').textContent = '';
  $('#desc-lista').innerHTML = '';
  $('#desc-mas').classList.add('oculto');
  estado.origen = 'descubrir';
  ir('#/descubrir');
  if (contexto) setTimeout(buscarNuevas, 100);
}

$('#b-descubrir').addEventListener('click', () => abrirDescubrir());
$('#b-descubrir-tengo').addEventListener('click', () => {
  if (!estado.tengo.length) return toast('Primero agregá los ingredientes que tenés.');
  const lista = estado.tengo.join(', ');
  abrirDescubrir(
    `Recetas que se puedan hacer principalmente con estos ingredientes que tengo: ${lista}. Que falten la menor cantidad posible de otros ingredientes${estado.basicos ? ' (sal, aceite, agua, pimienta y azúcar los tengo)' : ''}.`,
    `Con lo que tenés: ${lista}`
  );
});

function contextoSimilar(r) {
  const ings = (r.ingredientes || []).map((i) => i.base || i.nombre).slice(0, 12).join(', ');
  const tipo = [...(r.tipo_plato || []).map((x) => NOMBRES.tipo_plato[x]), NOMBRES.sabor[r.sabor], r.cocina].filter(Boolean).join(', ');
  return `Recetas parecidas a "${r.titulo}" (${tipo}; ingredientes principales: ${ings}). Que no sean la misma receta.`;
}

async function buscarNuevas() {
  const extra = $('#i-pedido').value.trim();
  const ctx = estado.descubrir.contexto;
  if (!ctx && !extra) {
    $('#desc-error').textContent = 'Contame qué tenés ganas de cocinar.';
    return;
  }
  const pedido = ctx ? [ctx, extra && `Además: ${extra}`].filter(Boolean).join('\n') : extra;
  $('#desc-error').textContent = '';
  cargando(true, 'Buscando recetas en internet… (puede tardar hasta un minuto)');
  try {
    const { resultados } = await api('/api/descubrir', { method: 'POST', body: { pedido } });
    estado.descubrir.resultados = resultados;
    estado.descubrir.pedido = pedido;
    pintarResultados();
  } catch (err) {
    $('#desc-error').textContent = err.message;
  } finally {
    cargando(false);
  }
}
$('#b-buscar-nuevas').addEventListener('click', buscarNuevas);

/* Buscar 5 más, eligiendo cuánto alejarse del pedido */
const VARIEDAD_TXT = [
  [20, 'Muy parecidas: mismo plato con pequeños cambios.'],
  [40, 'Parecidas: la misma idea con alguna variación.'],
  [60, 'Intermedio: mismo estilo, puede cambiar el ingrediente principal o la técnica.'],
  [80, 'Variadas: inspiradas en la búsqueda, pero claramente distintas.'],
  [100, 'Muy variadas: opciones sorpresa que solo respetan lo indispensable.'],
];
function pintarVariedad() {
  const v = Number($('#r-variedad').value);
  $('#variedad-txt').textContent = VARIEDAD_TXT.find(([max]) => v <= max)[1];
}
$('#r-variedad').value = leerLocal('variedad', 30);
pintarVariedad();
$('#r-variedad').addEventListener('input', () => { pintarVariedad(); guardarLocal('variedad', Number($('#r-variedad').value)); });

$('#b-mas').addEventListener('click', async () => {
  const d = estado.descubrir;
  const antes = d.resultados.length;
  const excluir = d.resultados.map((r) => [r.titulo, r.fuente].filter(Boolean).join(' — '));
  cargando(true, 'Buscando 5 recetas más… (puede tardar hasta un minuto)');
  try {
    const { resultados } = await api('/api/descubrir', {
      method: 'POST',
      body: { pedido: d.pedido, excluir, variedad: Number($('#r-variedad').value) },
    });
    const vistos = new Set(d.resultados.map((r) => r.url || norm(r.titulo)));
    const nuevos = resultados.filter((r) => !vistos.has(r.url || norm(r.titulo)));
    if (!nuevos.length) return toast('No encontré otras distintas. Probá moviendo la barra hacia "Más variedad".');
    d.resultados.push(...nuevos);
    pintarResultados();
    document.querySelector(`.resultado[data-i="${antes}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    toast(err.message);
  } finally {
    cargando(false);
  }
});

function pintarResultados() {
  const res = estado.descubrir.resultados;
  const web = res.filter((r) => r.origen === 'web').length;
  $('#desc-resumen').textContent = !res.length ? 'No encontré nada. Probá describirlo distinto.'
    : web ? `Encontré ${web} en internet${res.length > web ? ' y te propongo ideas propias' : ''}. Tocá una para verla completa y guardarla.`
    : 'No encontré recetas en internet que encajen, así que te armé estas ideas. Tocá una para verla completa.';
  $('#desc-mas').classList.toggle('oculto', !res.length);
  $('#desc-lista').innerHTML = res.map((r, i) => `
    <button class="tarjeta resultado" data-i="${i}">
      <span class="badge ${r.origen === 'ia' ? 'ia' : ''}">${r.origen === 'ia' ? '✨ Idea creada por IA' : '🌐 ' + esc(r.fuente || 'Web')}</span>
      <h2>${esc(r.titulo)}</h2>
      <p class="sutil">${esc(r.descripcion)}</p>
      <div class="datos">
        ${r.tiempo_total_min != null ? `<span>⏱ ${duracion(r.tiempo_total_min)}</span>` : ''}
        <span>${NOMBRES.dificultad[r.dificultad] || ''}</span>
        <span>${NOMBRES.sabor[r.sabor] || ''}</span>
      </div>
      ${r.por_que ? `<p class="porque">✓ ${esc(r.por_que)}</p>` : ''}
    </button>`).join('');
}

async function crearConIa(r) {
  const { receta } = await api('/api/crear', {
    method: 'POST',
    body: { titulo: r.titulo, descripcion: r.descripcion, pedido: estado.descubrir.pedido },
  });
  return receta;
}

$('#desc-lista').addEventListener('click', async (e) => {
  const t = e.target.closest('.resultado');
  if (!t) return;
  const r = estado.descubrir.resultados[Number(t.dataset.i)];
  try {
    if (r.origen === 'web' && r.url) {
      cargando(true, `Leyendo la receta de ${r.fuente || 'la web'}…`);
      try {
        estado.borrador = (await api('/api/extraer', { method: 'POST', body: { url: r.url } })).receta;
      } catch (err) {
        cargando(false);
        if (!confirm('No pude leer esa página. ¿Querés que la IA arme una receta parecida?')) return;
        cargando(true, 'Armando la receta…');
        estado.borrador = { ...(await crearConIa(r)), url_origen: r.url };
      }
    } else {
      cargando(true, 'Armando la receta…');
      estado.borrador = await crearConIa(r);
    }
    estado.origen = 'descubrir';
    ir('#/editar');
  } catch (err) {
    toast(err.message);
  } finally {
    cargando(false);
  }
});

/* ================= Editor ================= */
function chipsToggle(nombre, valores) {
  return `<div class="chips" data-campo="${nombre}">${Object.entries(NOMBRES[nombre]).map(([k, v]) =>
    `<button type="button" class="chip ${valores.includes(k) ? 'activo' : ''}" data-k="${k}">${v}</button>`).join('')}</div>`;
}
function filaIng(i, idx) {
  return `<div class="ing-fila" data-idx="${idx}">
    <input name="cantidad" inputmode="decimal" placeholder="Cant." value="${i.cantidad ?? ''}">
    <input name="unidad" placeholder="Unidad" value="${esc(i.unidad)}">
    <input name="nombre" placeholder="Ingrediente" value="${esc(i.nombre)}">
    <button type="button" class="quitar" data-quitar="ing" aria-label="Quitar">✕</button>
    <input name="nota" placeholder="Nota (picada, a gusto…)" value="${esc(i.nota)}" style="grid-column:1/4">
  </div>`;
}
function filaPaso(p) {
  return `<div class="paso-fila"><textarea name="paso" rows="2">${esc(p)}</textarea><button type="button" class="quitar" data-quitar="paso" aria-label="Quitar">✕</button></div>`;
}
function opciones(nombre, valor) {
  return Object.entries(NOMBRES[nombre]).map(([k, v]) => `<option value="${k}" ${k === valor ? 'selected' : ''}>${v}</option>`).join('');
}

function abrirEditor() {
  const r = estado.borrador;
  $('#editar-titulo').textContent = r.id ? 'Editar receta' : 'Revisá la receta';
  $('#f-editar').innerHTML = `
    ${r.falta_info ? `<div class="aviso">⚠️ ${esc(r.falta_info)}</div>` : ''}
    ${r.imagen ? `<img class="foto-prev" src="${esc(r.imagen)}" alt="">` : ''}
    <label class="etq">Nombre</label><input name="titulo" value="${esc(r.titulo)}" required>
    <label class="etq">Descripción</label><textarea name="descripcion" rows="2">${esc(r.descripcion)}</textarea>
    <div class="tres">
      <div><label class="etq">Porciones</label><input name="porciones" type="number" min="1" value="${r.porciones ?? ''}"></div>
      <div><label class="etq">Total (min)</label><input name="tiempo_total_min" type="number" min="0" value="${r.tiempo_total_min ?? ''}"></div>
      <div><label class="etq">Activo (min)</label><input name="tiempo_activo_min" type="number" min="0" value="${r.tiempo_activo_min ?? ''}"></div>
    </div>
    <div class="dos">
      <div><label class="etq">Dificultad</label><select name="dificultad">${opciones('dificultad', r.dificultad)}</select></div>
      <div><label class="etq">Sabor</label><select name="sabor">${opciones('sabor', r.sabor)}</select></div>
    </div>
    <label class="etq">Tipo de plato</label>${chipsToggle('tipo_plato', r.tipo_plato || [])}
    <label class="etq">Cómo se cocina</label>${chipsToggle('metodo', r.metodo || [])}
    <label class="etq">Dieta</label>${chipsToggle('dietas', r.dietas || [])}
    <div class="dos">
      <div><label class="etq">Cocina</label><input name="cocina" placeholder="argentina, italiana…" value="${esc(r.cocina)}"></div>
      <div><label class="etq">Etiquetas</label><input name="etiquetas" placeholder="rápida, económica" value="${esc((r.etiquetas || []).join(', '))}"></div>
    </div>

    <label class="etq">Ingredientes</label>
    <div id="ed-ings">${(r.ingredientes || []).map(filaIng).join('')}</div>
    <button type="button" id="b-add-ing" class="btn secundario chico">+ Ingrediente</button>

    <label class="etq">Pasos</label>
    <div id="ed-pasos">${(r.pasos || []).map(filaPaso).join('')}</div>
    <button type="button" id="b-add-paso" class="btn secundario chico">+ Paso</button>

    <label class="etq">Tips</label><textarea name="tips" rows="2">${esc(r.tips)}</textarea>
    <label class="etq">Foto (link)</label><input name="imagen" type="url" value="${esc(r.imagen)}">
    <label class="etq">Link original</label><input name="url_origen" type="url" value="${esc(r.url_origen)}">

    <button type="submit" class="btn primario grande">💾 Guardar</button>
    ${r.id ? '<button type="button" id="b-borrar" class="btn peligro">Borrar receta</button>' : ''}
  `;
  mostrarVista('editar');
}

$('#f-editar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.classList.contains('chip')) b.classList.toggle('activo');
  else if (b.id === 'b-add-ing') { $('#ed-ings').insertAdjacentHTML('beforeend', filaIng({ cantidad: null, unidad: '', nombre: '', nota: '' }, -1)); $('#ed-ings').lastElementChild.querySelector('[name=nombre]').focus(); }
  else if (b.id === 'b-add-paso') { $('#ed-pasos').insertAdjacentHTML('beforeend', filaPaso('')); $('#ed-pasos').lastElementChild.querySelector('textarea').focus(); }
  else if (b.dataset.quitar) b.parentElement.remove();
  else if (b.id === 'b-borrar') borrarReceta();
});

function leerEditor() {
  const f = $('#f-editar');
  const v = (n) => f.querySelector(`[name=${n}]`).value.trim();
  const num = (n) => (v(n) === '' ? null : Number(v(n)));
  const chips = (c) => [...f.querySelectorAll(`[data-campo=${c}] .chip.activo`)].map((b) => b.dataset.k);
  const orig = estado.borrador.ingredientes || [];
  const ingredientes = [...f.querySelectorAll('.ing-fila')].map((fila) => {
    const g = (n) => fila.querySelector(`[name=${n}]`).value.trim();
    const o = orig[Number(fila.dataset.idx)] || {};
    const nombre = g('nombre');
    const cant = g('cantidad').replace(',', '.');
    return {
      cantidad: cant === '' || isNaN(Number(cant)) ? null : Number(cant),
      unidad: g('unidad'),
      nombre,
      base: o.nombre === nombre && o.base ? o.base : nombre.toLowerCase(),
      nota: g('nota'),
      grupo: o.grupo || '',
    };
  }).filter((i) => i.nombre);
  return {
    ...estado.borrador,
    titulo: v('titulo'), descripcion: v('descripcion'), porciones: num('porciones'),
    tiempo_total_min: num('tiempo_total_min'), tiempo_activo_min: num('tiempo_activo_min'),
    dificultad: v('dificultad'), sabor: v('sabor'),
    tipo_plato: chips('tipo_plato'), metodo: chips('metodo'), dietas: chips('dietas'),
    cocina: v('cocina'), etiquetas: v('etiquetas').split(',').map((s) => s.trim()).filter(Boolean),
    ingredientes, pasos: [...f.querySelectorAll('[name=paso]')].map((t) => t.value.trim()).filter(Boolean),
    tips: v('tips'), imagen: v('imagen'), url_origen: v('url_origen'),
  };
}

$('#f-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const receta = leerEditor();
  delete receta.falta_info;
  cargando(true, 'Guardando…');
  try {
    const { receta: guardada } = await api('/api/recetas', { method: 'POST', body: { receta } });
    const i = estado.recetas.findIndex((r) => r.id === guardada.id);
    i >= 0 ? (estado.recetas[i] = guardada) : estado.recetas.push(guardada);
    guardarLocal('recetas', estado.recetas);
    estado.borrador = null;
    toast('Receta guardada ✓');
    if (receta.id && estado.editandoDesdeDetalle) {
      estado.editandoDesdeDetalle = false;
      history.back(); // vuelve a la receta, ya actualizada
    } else {
      estado.flujoCerrado = !receta.id;
      location.replace(`#/receta/${guardada.id}`);
    }
  } catch (err) {
    toast(err.message);
  } finally {
    cargando(false);
  }
});

async function borrarReceta() {
  const r = estado.borrador;
  if (!confirm(`¿Borrar "${r.titulo}"? No se puede deshacer.`)) return;
  cargando(true, 'Borrando…');
  try {
    await api(`/api/recetas/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    estado.recetas = estado.recetas.filter((x) => x.id !== r.id);
    guardarLocal('recetas', estado.recetas);
    estado.borrador = null;
    toast('Receta borrada');
    location.replace('#/');
  } catch (err) {
    toast(err.message);
  } finally {
    cargando(false);
  }
}

/* ================= Detalle ================= */
const FRACC = [[0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.5, '½'], [0.666, '⅔'], [0.75, '¾']];
function formatoCant(n, unidad) {
  if (n == null) return '';
  const u = norm(unidad);
  if (['g', 'gr', 'ml', 'cc'].includes(u)) {
    if (n >= 100) return String(Math.round(n / 5) * 5);
    if (n >= 10) return String(Math.round(n));
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }
  if (['kg', 'l', 'litro', 'litros'].includes(u)) return String(Math.round(n * 100) / 100).replace('.', ',');
  const ent = Math.floor(n);
  const dec = n - ent;
  if (dec < 0.07) return String(ent || (n > 0 ? '¼' : '0'));
  if (dec > 0.93) return String(ent + 1);
  const [, sim] = FRACC.reduce((a, b) => (Math.abs(b[0] - dec) < Math.abs(a[0] - dec) ? b : a));
  return ent ? `${ent} ${sim}` : sim;
}
function textoIng(i, factor) {
  const cant = i.cantidad != null ? formatoCant(i.cantidad * factor, i.unidad) : '';
  const unidad = /^unidad(es)?$/i.test(i.unidad || '') ? '' : i.unidad;
  return { cant: [cant, unidad].filter(Boolean).join(' '), resto: i.nombre + (i.nota ? `, ${i.nota}` : '') };
}
function listaIngredientes(r, factor) {
  let grupo = '';
  return (r.ingredientes || []).map((i) => {
    let h = '';
    if (i.grupo && i.grupo !== grupo) { grupo = i.grupo; h += `<li class="grupo">${esc(grupo)}</li>`; }
    const t = textoIng(i, factor);
    const tengo = estado.modoTengo && estado.tengo.some((x) => coincide(i, x));
    return h + `<li class="${tengo ? 'tengo' : ''}"><span class="cant">${esc(t.cant)}</span><span>${esc(t.resto)}</span></li>`;
  }).join('');
}

function abrirDetalle(r) {
  estado.actual = r;
  if (estado.porciones == null || estado.porcionesDe !== r.id) {
    estado.porciones = r.porciones || null;
    estado.porcionesDe = r.id;
  }
  const factor = r.porciones && estado.porciones ? estado.porciones / r.porciones : 1;
  const chips = [
    r.sabor && NOMBRES.sabor[r.sabor],
    ...(r.tipo_plato || []).map((x) => NOMBRES.tipo_plato[x]),
    ...(r.metodo || []).map((x) => NOMBRES.metodo[x]),
    r.cocina,
    ...(r.etiquetas || []),
  ].filter(Boolean);
  const dietas = (r.dietas || []).map((x) => NOMBRES.dietas[x]).filter(Boolean);

  $('#detalle').innerHTML = `
    <div class="hero" ${r.imagen ? `style="background-image:url('${esc(r.imagen)}')"` : ''}>${r.imagen ? '' : EMOJI[r.sabor] || '🍽️'}</div>
    <div class="det">
      <h1>${esc(r.titulo)}</h1>
      ${r.descripcion ? `<p class="sutil" style="margin:0">${esc(r.descripcion)}</p>` : ''}
      <div class="etiquetas">
        ${dietas.map((d) => `<span class="etiqueta verde">${esc(d)}</span>`).join('')}
        ${r.fuente === 'Creada por IA' ? '<span class="etiqueta verde">✨ Creada por IA</span>' : ''}
        ${chips.map((c) => `<span class="etiqueta">${esc(c)}</span>`).join('')}
      </div>
      <div class="stats">
        <div class="stat"><b>${r.tiempo_total_min != null ? duracion(r.tiempo_total_min) : '—'}</b><span>Total${r.tiempo_activo_min ? ` · ${r.tiempo_activo_min} activo` : ''}</span></div>
        <div class="stat"><b>${NOMBRES.dificultad[r.dificultad] || '—'}</b><span>Dificultad</span></div>
        <div class="stat"><b>${(r.ingredientes || []).length}</b><span>Ingredientes</span></div>
      </div>

      <button id="b-cocinar" class="btn primario grande">👩‍🍳 Modo cocina</button>

      <div class="seccion">
        <h2>Ingredientes
          ${r.porciones ? `<span class="porciones"><button data-p="-1" aria-label="Menos">−</button><span>${estado.porciones} porc.</span><button data-p="1" aria-label="Más">+</button></span>` : ''}
        </h2>
        <ul class="ingredientes">${listaIngredientes(r, factor)}</ul>
      </div>

      <div class="seccion"><h2>Preparación</h2><ol class="pasos">${(r.pasos || []).map((p) => `<li><span>${esc(p)}</span></li>`).join('')}</ol></div>

      ${r.tips ? `<div class="tips"><b>💡 Tips:</b> ${esc(r.tips)}</div>` : ''}

      <div class="seccion">
        <h2>¿Cómo salió?</h2>
        <label class="check"><input id="c-hecha" type="checkbox" ${r.hecha ? 'checked' : ''}> Ya la hicimos</label>
        <div class="estrellas" id="estrellas">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="${r.puntaje >= n ? 'on' : ''}" aria-label="${n} estrellas">★</button>`).join('')}</div>
      </div>

      <div class="acciones">
        ${r.url_origen ? `<a class="btn secundario" href="${esc(r.url_origen)}" target="_blank" rel="noopener">Ver original${r.fuente ? ` en ${esc(r.fuente)}` : ''} ↗</a>` : ''}
        <button id="b-similares" class="btn secundario">🔎 Buscar recetas parecidas</button>
        <button id="b-compartir" class="btn secundario">Compartir receta</button>
      </div>
    </div>`;
  mostrarVista('detalle');
}

$('#detalle').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const r = estado.actual;
  if (b.dataset.p) {
    estado.porciones = Math.max(1, estado.porciones + Number(b.dataset.p));
    const y = window.scrollY;
    abrirDetalle(r);
    window.scrollTo(0, y);
  } else if (b.dataset.n) {
    const n = Number(b.dataset.n);
    actualizarRapido({ puntaje: r.puntaje === n ? null : n, hecha: true });
  } else if (b.id === 'b-cocinar') {
    estado.cocinaPaso = 0;
    ir('#/cocina');
  } else if (b.id === 'b-similares') {
    abrirDescubrir(contextoSimilar(r), `Parecidas a: ${r.titulo}`);
  } else if (b.id === 'b-compartir') {
    compartir(r);
  }
});
$('#detalle').addEventListener('change', (e) => {
  if (e.target.id === 'c-hecha') actualizarRapido({ hecha: e.target.checked });
});
$('#b-editar').addEventListener('click', () => { estado.editandoDesdeDetalle = true; ir(`#/editar/${estado.actual.id}`); });

async function actualizarRapido(cambios) {
  const r = Object.assign(estado.actual, cambios);
  const y = window.scrollY;
  abrirDetalle(r);
  window.scrollTo(0, y);
  try {
    await api('/api/recetas', { method: 'POST', body: { receta: r } });
    guardarLocal('recetas', estado.recetas);
  } catch (err) {
    toast('No se pudo guardar: ' + err.message);
  }
}

async function compartir(r) {
  const factor = 1;
  const txt = `${r.titulo}\n\nIngredientes:\n${(r.ingredientes || []).map((i) => { const t = textoIng(i, factor); return `• ${[t.cant, t.resto].filter(Boolean).join(' ')}`; }).join('\n')}\n\nPreparación:\n${(r.pasos || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}${r.url_origen ? `\n\n${r.url_origen}` : ''}`;
  try {
    if (navigator.share) await navigator.share({ title: r.titulo, text: txt });
    else { await navigator.clipboard.writeText(txt); toast('Receta copiada'); }
  } catch { /* cancelado */ }
}

/* ================= Modo cocina ================= */
async function mantenerPantalla() {
  try {
    if ('wakeLock' in navigator && !estado.wakeLock) {
      estado.wakeLock = await navigator.wakeLock.request('screen');
      estado.wakeLock.addEventListener('release', () => (estado.wakeLock = null));
    }
  } catch { /* no soportado */ }
}
function soltarPantalla() {
  if (estado.wakeLock) { estado.wakeLock.release(); estado.wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#v-cocina').classList.contains('oculto')) mantenerPantalla();
});

function abrirCocina() {
  mostrarVista('cocina');
  mantenerPantalla();
  pintarCocina();
}
function pintarCocina() {
  const r = estado.actual;
  const pasos = r.pasos || [];
  const total = pasos.length + 1;
  const i = estado.cocinaPaso;
  const factor = r.porciones && estado.porciones ? estado.porciones / r.porciones : 1;
  $('#cocina-titulo').textContent = r.titulo;
  $('#cocina-paso-n').textContent = `${i + 1}/${total}`;
  $('#cocina-cuerpo').innerHTML = i === 0
    ? `<b>Prepará todo${estado.porciones ? ` (${estado.porciones} porc.)` : ''}:</b><ul>${(r.ingredientes || []).map((x) => { const t = textoIng(x, factor); return `<li>${esc([t.cant, t.resto].filter(Boolean).join(' '))}</li>`; }).join('')}</ul>`
    : `<p class="sutil" style="font-size:18px;margin:0 0 8px">Paso ${i}</p>${esc(pasos[i - 1])}`;
  $('#b-ant').disabled = i === 0;
  $('#b-sig').textContent = i === total - 1 ? '¡Listo! ✓' : 'Siguiente →';
}
$('#b-ant').addEventListener('click', () => { if (estado.cocinaPaso > 0) { estado.cocinaPaso--; pintarCocina(); } });
$('#b-sig').addEventListener('click', () => {
  const total = (estado.actual.pasos || []).length + 1;
  if (estado.cocinaPaso < total - 1) { estado.cocinaPaso++; pintarCocina(); }
  else history.back();
});
$('#b-salir-cocina').addEventListener('click', () => history.back());

/* ================= Inicio ================= */
(async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  estado.recetas = leerLocal('recetas', []);
  estado.tengo = leerLocal('tengo', []);
  estado.filtros = { ...estado.filtros, ...leerLocal('filtros', {}) };
  pintarTengo();
  enrutar();
  await cargarRecetas(estado.recetas.length > 0);
  procesarCompartido();
  enrutar();
})();
