require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static('public'));

app.post('/api/suggest', async (req, res) => {
  const { consulta, excluir } = req.body;

  if (!consulta || !consulta.trim()) {
    return res.status(400).json({ error: 'Falta indicar qué querés cocinar.' });
  }

  const exclusion = Array.isArray(excluir) && excluir.length
    ? `\n\nYa se sugirieron estas recetas, no las repitas: ${excluir.join(', ')}.`
    : '';

  const prompt = `Sos un asistente de cocina. El usuario te va a describir en lenguaje libre qué quiere cocinar (puede mencionar ingredientes que tiene, tipo de comida, para quién es, o cualquier combinación). Sugerí 3 recetas posibles.

Pedido del usuario: ${consulta}${exclusion}

Para cada receta indicá:
- Nombre del plato (como encabezado, ej: "# Nombre")
- Ingredientes que se usan (priorizando los que el usuario ya tiene, marcando cuáles faltarían si son imprescindibles)
- Pasos breves y claros, numerados
- Tiempo estimado de preparación

Respondé en español, en formato Markdown, sin agregar comentarios extra antes o después de las recetas.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const texto = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({ recetas: texto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo generar la sugerencia. Revisá la API key y probá de nuevo.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Recetas app corriendo en http://localhost:${PORT}`);
});
