// Usa Claude para convertir texto/capturas en una receta ordenada.
const Anthropic = require('@anthropic-ai/sdk');

const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const TIPOS_PLATO = ['desayuno', 'almuerzo_cena', 'entrada', 'guarnicion', 'postre', 'merienda', 'snack', 'bebida', 'salsa', 'panificado'];
const METODOS = ['horno', 'sarten', 'olla', 'airfryer', 'parrilla', 'microondas', 'freidora', 'licuadora', 'sin_coccion'];
const DIETAS = ['vegetariano', 'vegano', 'sin_tacc', 'sin_lactosa', 'sin_azucar', 'saludable'];

const nulo = (type) => ({ type: [type, 'null'] });

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
        required: ['cantidad', 'unidad', 'nombre', 'base', 'nota', 'grupo'],
        properties: {
          cantidad: nulo('number'),
          unidad: { type: 'string', description: 'g, kg, ml, l, unidad, cda, cdita, taza, pizca, diente, etc. Vacío si no aplica.' },
          nombre: { type: 'string', description: 'Como se muestra: "cebolla morada"' },
          base: { type: 'string', description: 'Ingrediente genérico en singular y minúscula para buscar: "cebolla"' },
          nota: { type: 'string', description: 'Ej: "picada", "a gusto". Vacío si no hay.' },
          grupo: { type: 'string', description: 'Sección si la receta las tiene ("Masa", "Relleno"). Vacío si no.' },
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
  for (const img of imagenes.slice(0, 6)) {
    contenido.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  contenido.push({
    type: 'text',
    text: `${url ? `Link de origen: ${url}\n\n` : ''}Contenido:\n${texto || '(ver capturas)'}`,
  });

  const pedido = {
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SISTEMA,
    messages: [{ role: 'user', content: contenido }],
  };

  let respuesta;
  try {
    // Si el modelo rechaza el contenido, el servidor reintenta solo con otro modelo.
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

  if (respuesta.stop_reason === 'refusal') throw new Error('La IA no pudo procesar este contenido.');
  if (respuesta.stop_reason === 'max_tokens') throw new Error('La receta es demasiado larga para procesarla.');

  const bloque = respuesta.content.find((b) => b.type === 'text');
  if (!bloque) throw new Error('La IA no devolvió resultado.');
  return JSON.parse(bloque.text);
}

module.exports = { extraerReceta, TIPOS_PLATO, METODOS, DIETAS };
