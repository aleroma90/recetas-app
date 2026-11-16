// Usa Claude para convertir texto/capturas en una receta ordenada.
const Anthropic = require('@anthropic-ai/sdk');

const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const TIPOS_PLATO = ['desayuno', 'almuerzo_cena', 'entrada', 'guarnicion', 'postre', 'merienda', 'snack', 'bebida', 'salsa', 'panificado'];
const METODOS = ['horno', 'sarten', 'olla', 'airfryer', 'parrilla', 'microondas', 'freidora', 'licuadora', 'sin_coccion'];
const DIETAS = ['vegetariano', 'vegano', 'sin_tacc', 'sin_lactosa', 'sin_azucar', 'saludable'];

const nulo = (type) => ({ type: [type, 'null'] });

// Equivalencia de medida y pasos donde se usa cada ingrediente.
const CAMPOS_EXTRA_INGREDIENTE = {
  equiv_cantidad: {
    type: ['number', 'null'],
    description: 'Cantidad equivalente en otra medida casera (ver reglas). null si no aporta.',
  },
  equiv_unidad: { type: 'string', description: 'Unidad de la equivalencia: taza, cda, cdita, g, ml. Vacío si no hay.' },
  pasos: {
    type: 'array',
    items: { type: 'integer' },
    description: 'Números de paso (empezando en 1) donde se usa este ingrediente.',
  },
};

const REGLAS_EXTRA = `- Equivalencias (equiv_cantidad + equiv_unidad), aproximadas y redondeadas a medidas caseras:
  · g o ml → tazas, cdas o cditas (ej: 250 g harina → 2 taza; 15 ml aceite → 1 cda; 5 g sal → 1 cdita).
  · tazas, cdas o cditas → g o ml (ej: 1 taza azúcar → 200 g).
  · unidades de verduras, frutas, etc. → g aproximados (ej: 1 cebolla → 150 g).
  · Dejá null cuando no aporta: "a gusto", pizcas, huevos, latas o paquetes, cantidades enormes (más de 2 kg).
- pasos: en qué pasos se usa cada ingrediente (números desde 1, según el orden de "pasos"). Todo ingrediente debería figurar en al menos un paso.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'es_receta', 'falta_info', 'titulo', 'descripcion', 'porciones', 'tiempo_total_min', 'tiempo_activo_min',
    'dificultad', 'sabor', 'tipo_plato', 'metodo', 'dietas', 'cocina', 'etiquetas', 'ingredientes', 'pasos', 'tips',
  ],
  properties: {
    es_receta: { type: 'boolean', description: 'true si el contenido tiene una receta reconocible' },
    falta_info: {
      type: 'string',
      description: 'Vacío si está completa. Si faltan ingredientes o pasos, explicá en una frase qué falta.',
    },
    titulo: { type: 'string' },
    descripcion: { type: 'string', description: 'Una o dos frases apetitosas' },
    porciones: nulo('integer'),
    tiempo_total_min: nulo('integer'),
    tiempo_activo_min: nulo('integer'),
    dificultad: { type: 'string', enum: ['facil', 'media', 'dificil'] },
    sabor: { type: 'string', enum: ['salado', 'dulce', 'agridulce'] },
    tipo_plato: { type: 'array', items: { type: 'string', enum: TIPOS_PLATO } },
    metodo: { type: 'array', items: { type: 'string', enum: METODOS } },
    dietas: { type: 'array', items: { type: 'string', enum: DIETAS } },
    cocina: { type: 'string', description: 'Ej: argentina, italiana, mexicana, asiática. Vacío si no aplica.' },
    etiquetas: {
      type: 'array',
      items: { type: 'string' },
      description: 'Hasta 5 etiquetas cortas útiles: económica, para chicos, rápida, sin horno, para freezar, etc.',
    },
    ingredientes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cantidad', 'unidad', 'nombre', 'base', 'nota', 'grupo', 'equiv_cantidad', 'equiv_unidad', 'pasos'],
        properties: {
          cantidad: nulo('number'),
          unidad: { type: 'string', description: 'g, kg, ml, l, unidad, cda, cdita, taza, pizca, diente, etc. Vacío si no aplica.' },
          nombre: { type: 'string', description: 'Como se muestra: "cebolla morada"' },
          base: { type: 'string', description: 'Ingrediente genérico en singular y minúscula para buscar: "cebolla"' },
          nota: { type: 'string', description: 'Ej: "picada", "a gusto". Vacío si no hay.' },
          grupo: { type: 'string', description: 'Sección si la receta las tiene ("Masa", "Relleno"). Vacío si no.' },
          ...CAMPOS_EXTRA_INGREDIENTE,
        },
      },
    },
    pasos: { type: 'array', items: { type: 'string' } },
    tips: { type: 'string', description: 'Consejos o variantes mencionados. Vacío si no hay.' },
  },
};

const SISTEMA = `Sos un asistente que ordena recetas de cocina para una familia argentina.
Te van a pasar el contenido de un link (web o posteo de Instagram), un texto pegado y/o capturas de pantalla.
Extraé la receta y devolvela con el esquema pedido.

Reglas:
- Todo en español rioplatense neutro (ej: "manteca", "crema", "zapallo", "frutilla"). Si viene en otro idioma, traducí.
- Pasá medidas al sistema métrico: cups/oz/lb → g o ml (aproximá razonablemente), °F → °C. Cucharadas → "cda", cucharaditas → "cdita".
- No inventes ingredientes ni pasos. Si el contenido no los trae, dejá la lista vacía y explicá en falta_info.
- Si falta el tiempo o las porciones, estimalos solo si es razonable; si no, null.
- Dificultad: "facil" = pocos pasos y técnicas simples; "media" = varias preparaciones o algo de técnica; "dificil" = técnica avanzada o muchos pasos.
- Pasos: frases claras, uno por acción principal, sin numerar.
- Ignorá textos de publicidad, hashtags, "seguime", etc.
${REGLAS_EXTRA}
- Si no hay ninguna receta, es_receta = false.`;

let cliente;
function claude() {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

/**
 * @param {{texto?: string, imagenes?: {media_type: string, data: string}[], url?: string}} entrada
 */
async function extraerReceta({ texto = '', imagenes = [], url = '' }) {
  const contenido = [];
  for (const img of imagenes.slice(0, 10)) {
    contenido.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  contenido.push({
    type: 'text',
    text: `${url ? `Link de origen: ${url}\n\n` : ''}Contenido:\n${texto || '(ver capturas)'}`,
  });

  return pedirJson(SISTEMA, contenido, ESQUEMA);
}

// Llamada con salida JSON estructurada. Si el modelo rechaza, el servidor reintenta con otro.
async function pedirJson(system, contenido, schema, effort = 'low') {
  const pedido = {
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: contenido }],
  };

  let respuesta;
  try {
    respuesta = await claude().beta.messages.create({
      ...pedido,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    console.warn('Reintento sin fallbacks:', err.message);
    respuesta = await claude().messages.create(pedido);
  }

  if (respuesta.stop_reason === 'refusal') throw new Error('La IA no pudo procesar este pedido.');
  if (respuesta.stop_reason === 'max_tokens') throw new Error('La respuesta salió demasiado larga.');

  const bloque = respuesta.content.find((b) => b.type === 'text');
  if (!bloque) throw new Error('La IA no devolvió resultado.');
  return JSON.parse(bloque.text);
}

/* ---------------- Descubrir recetas nuevas ---------------- */

const ESQUEMA_RESULTADOS = {
  type: 'object',
  additionalProperties: false,
  required: ['resultados'],
  properties: {
    resultados: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['origen', 'titulo', 'descripcion', 'url', 'fuente', 'tiempo_total_min', 'dificultad', 'sabor', 'por_que'],
        properties: {
          origen: { type: 'string', enum: ['web', 'ia'] },
          titulo: { type: 'string' },
          descripcion: { type: 'string', description: 'Una frase: qué es y qué lleva' },
          url: { type: 'string', description: 'Link exacto a la receta (vacío si origen = ia)' },
          fuente: { type: 'string', description: 'Nombre del sitio (vacío si origen = ia)' },
          tiempo_total_min: { type: ['integer', 'null'] },
          dificultad: { type: 'string', enum: ['facil', 'media', 'dificil'] },
          sabor: { type: 'string', enum: ['salado', 'dulce', 'agridulce'] },
          por_que: { type: 'string', description: 'Por qué encaja con el pedido, en pocas palabras' },
        },
      },
    },
  },
};

const SISTEMA_BUSCAR = `Sos un buscador de recetas para una familia argentina.
Buscá en la web recetas reales que encajen con el pedido. Preferí sitios de recetas en español
(Paulina Cocina, Cookpad, Recetas Gratis, Directo al Paladar, Cocineros Argentinos, Kiwilimón, etc.)
y también en inglés si hay buenas. Solo páginas que tengan la receta completa (ingredientes y pasos),
no listados ni videos sin texto. Respetá estrictamente las restricciones del pedido (dieta, tiempo, método, ingredientes).
Al final escribí un resumen con hasta 5 recetas: título, link exacto, sitio, tiempo aproximado, dificultad y por qué encaja.`;

const SISTEMA_ORDENAR = `Convertí los hallazgos de una búsqueda de recetas al formato pedido, en español rioplatense.
- Incluí como origen "web" solo recetas con link real que aparezca en los hallazgos (nunca inventes links), hasta 5.
- Si hay menos de 2 recetas web que encajen bien con el pedido, agregá ideas con origen "ia"
  (recetas originales que cumplan el pedido) hasta completar 3 resultados en total. Si hay 2 o más web, no agregues ideas "ia".`;

// Cuánto pueden alejarse los resultados del pedido (0 = muy parecidas, 100 = muy variadas).
function textoVariedad(v) {
  if (v == null) return '';
  if (v <= 20) return 'Muy parecidas: mismo tipo de plato, técnica e ingredientes principales; solo variaciones mínimas.';
  if (v <= 40) return 'Parecidas: la misma idea con alguna variación de ingredientes o de técnica.';
  if (v <= 60) return 'Intermedio: misma ocasión y estilo, pero puede cambiar el ingrediente principal o la técnica.';
  if (v <= 80) return 'Variadas: inspiradas en el pedido pero claramente distintas (otra cocina, otra proteína u otra técnica).';
  return 'Muy variadas: sorprendé con opciones distintas; respetá solo las restricciones explícitas (dieta, tiempo, ingredientes disponibles).';
}

/**
 * Busca recetas nuevas en la web (y propone ideas propias si no encuentra).
 * @param {string} pedido descripción de lo que se busca
 * @param {{excluir?: string[], variedad?: number|null}} opciones
 */
async function buscarRecetas(pedidoBase, { excluir = [], variedad = null } = {}) {
  const pedido = [
    pedidoBase,
    variedad != null && `Grado de variedad buscado: ${textoVariedad(variedad)}`,
    excluir.length && `Ya me mostraste estas, no las repitas (ni versiones casi iguales):\n- ${excluir.join('\n- ')}`,
  ].filter(Boolean).join('\n\n');
  const messages = [{ role: 'user', content: `Pedido: ${pedido}` }];
  const params = {
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    system: SISTEMA_BUSCAR,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
  };

  let hallazgos = '';
  try {
    let respuesta;
    for (let i = 0; i < 4; i++) {
      respuesta = await claude().messages.create({ ...params, messages });
      if (respuesta.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: respuesta.content });
    }
    // Texto final + links que devolvió el buscador (para que no se inventen URLs).
    const textos = respuesta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const links = [];
    for (const b of respuesta.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r.url) links.push(`- ${r.title || ''} — ${r.url}`);
      }
    }
    hallazgos = `${textos}\n\nLinks encontrados por el buscador:\n${links.join('\n')}`;
  } catch (err) {
    console.error('web_search', err.message);
    hallazgos = '(La búsqueda web no estuvo disponible: proponé ideas propias.)';
  }

  const { resultados } = await pedirJson(
    SISTEMA_ORDENAR,
    `Pedido: ${pedido}\n\nHallazgos de la búsqueda:\n${hallazgos}`,
    ESQUEMA_RESULTADOS
  );
  return resultados;
}

const SISTEMA_CREAR = `Sos un cocinero que escribe recetas caseras para una familia argentina.
Creá una receta completa, realista y probada en la práctica, que cumpla el pedido.
Español rioplatense, medidas métricas, °C. Cantidades concretas para cada ingrediente.
Pasos claros, uno por acción principal, sin numerar. es_receta = true y falta_info vacío.
${REGLAS_EXTRA}`;

/** Escribe una receta completa a partir de una idea. */
async function crearReceta({ titulo, descripcion, pedido }) {
  return pedirJson(
    SISTEMA_CREAR,
    `Receta: ${titulo}\nIdea: ${descripcion}\nPedido original: ${pedido || '-'}`,
    ESQUEMA
  );
}

/* ---------------- Modificar una receta con un pedido ---------------- */

const ESQUEMA_MODIFICAR = {
  ...ESQUEMA,
  required: [...ESQUEMA.required, 'resumen_cambios'],
  properties: {
    ...ESQUEMA.properties,
    resumen_cambios: { type: 'string', description: 'Qué cambiaste, en una o dos frases cortas' },
  },
};

const SISTEMA_MODIFICAR = `Sos un cocinero que ajusta recetas caseras para una familia argentina.
Te paso una receta en JSON y un pedido de cambio. Devolvé la receta COMPLETA con el cambio aplicado.
- Cambiá solo lo necesario para cumplir el pedido; el resto queda igual (mismas palabras, cantidades y orden).
- Si el pedido es cambiar una palabra (ej: "zapallo" en vez de "calabaza"), reemplazala en todos lados: título, descripción, ingredientes (nombre y base), pasos y tips.
- Si agregás o cambiás un ingrediente, ajustá cantidades, pasos, tiempos y dietas para que la receta siga siendo coherente y realizable.
- Español rioplatense, medidas métricas, °C. es_receta = true, falta_info vacío.
- En resumen_cambios contá qué cambiaste. Si el pedido no se puede aplicar, dejá la receta igual y explicalo ahí.
- Mantené y recalculá equivalencias y pasos de cada ingrediente:
${REGLAS_EXTRA}`;

/** Aplica a una receta un cambio pedido en lenguaje natural. */
async function modificarReceta(receta, pedido) {
  const campos = Object.keys(ESQUEMA.properties).filter((k) => !['es_receta', 'falta_info'].includes(k));
  const base = Object.fromEntries(campos.map((k) => [k, receta[k] ?? null]));
  return pedirJson(
    SISTEMA_MODIFICAR,
    `Receta actual:\n${JSON.stringify(base)}\n\nPedido de cambio: ${pedido}`,
    ESQUEMA_MODIFICAR
  );
}

/* ---------------- Completar recetas viejas (equivalencias y pasos) ---------------- */

const ESQUEMA_ENRIQUECER = {
  type: 'object',
  additionalProperties: false,
  required: ['ingredientes'],
  properties: {
    ingredientes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['equiv_cantidad', 'equiv_unidad', 'pasos'],
        properties: CAMPOS_EXTRA_INGREDIENTE,
      },
    },
  },
};

/** Devuelve, para cada ingrediente y en el mismo orden, su equivalencia y en qué pasos se usa. */
async function enriquecerReceta(receta) {
  const ingredientes = (receta.ingredientes || []).map((i, n) => ({ n: n + 1, cantidad: i.cantidad, unidad: i.unidad, nombre: i.nombre, nota: i.nota }));
  const pasos = (receta.pasos || []).map((p, n) => `${n + 1}. ${p}`).join('\n');
  const { ingredientes: extra } = await pedirJson(
    `Completá datos de los ingredientes de una receta. Devolvé exactamente un elemento por ingrediente, en el mismo orden.\n${REGLAS_EXTRA}`,
    `Ingredientes:\n${JSON.stringify(ingredientes)}\n\nPasos:\n${pasos}`,
    ESQUEMA_ENRIQUECER
  );
  if (extra.length !== ingredientes.length) throw new Error('La IA devolvió una cantidad distinta de ingredientes.');
  return extra;
}

module.exports = { extraerReceta, buscarRecetas, crearReceta, modificarReceta, enriquecerReceta, TIPOS_PLATO, METODOS, DIETAS };
