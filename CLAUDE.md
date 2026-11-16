# Recetas de Casa — guía del proyecto

Usuario: Ale (no lee código). Español rioplatense en todo, explicaciones simples.

## Cómo trabajamos
- Mostrar el plan y esperar OK antes de cambios grandes.
- Al final de cada entrega: qué cambió, cómo lo pruebo, qué tengo que hacer yo.
- Secretos solo en variables de entorno (Vercel / `.env.local`), nunca en el repo.
- Mobile first, responsive siempre. Pocas dependencias.

## Estructura
- `server.js` — Express (Vercel lo detecta solo). Rutas `/api/*`, sin clave de acceso.
- `lib/fuentes.js` — lee links (JSON-LD schema.org/Recipe en webs; embed de Instagram).
- `lib/ia.js` — Claude con salida JSON estructurada (esquema de receta). `buscarRecetas`: web_search + paso de ordenado (web primero, ideas IA si hay < 2); acepta `excluir` (ya mostradas) y `variedad` 0-100 para "Buscar 5 más". `crearReceta`: receta completa desde una idea. `enriquecerReceta`: completa equivalencias y pasos en recetas viejas (se llama sola al abrirlas). `modificarReceta`: aplica un pedido en lenguaje natural (panel "Pedile cambios a la IA" en el editor, con Deshacer).
- `lib/sheets.js` — habla con el Apps Script; sin `SHEETS_URL` usa `datos-local.json`.
- `apps-script/Codigo.gs` — se pega en el Google Sheet (hoja "Recetas").
- `public/` — app web vanilla JS (PWA con share target).

## Datos (columnas del Sheet)
id, creada, actualizada, titulo, descripcion, url_origen, fuente, imagen, porciones,
tiempo_total_min, tiempo_activo_min, dificultad (facil|media|dificil), sabor (salado|dulce|agridulce),
tipo_plato, metodo, dietas, cocina, etiquetas (listas separadas por coma),
ingredientes (JSON: cantidad, unidad, nombre, base, nota, grupo, equiv_cantidad, equiv_unidad, pasos[] = números de paso donde se usa), pasos (uno por línea), tips, hecha, puntaje, cargada_por.
Si se agrega una columna: actualizar `COLUMNAS` en Codigo.gs y el esquema en lib/ia.js.

## Colores
Primario #c2562b (terracota), fondo #fbf7f2. Modo oscuro automático.

## Fuera de alcance (v1)
Lista de compras, favoritos/notas aparte del puntaje, transcripción de audio de videos, cuentas separadas.
