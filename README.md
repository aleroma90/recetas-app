# Recetas de Casa

App para el celu donde guardan las recetas que encuentran (Instagram, webs de recetas, textos o capturas) y después las buscan por ingredientes que tienen, dificultad, duración, dulce/salado, tipo de plato, cómo se cocina, dieta y si ya la hicieron.

## Cómo funciona

- **Agregar**: pegás un link (o lo compartís desde Instagram), y si hace falta un texto o capturas. La IA arma la ficha (ingredientes, pasos, tiempos, dificultad…) traducida al español y en gramos/°C. La revisás y guardás.
- **Buscar**: texto libre + filtros, o el modo **"¿Qué cocino con lo que tengo?"**, que ordena las recetas por lo que te falta.
- **Buscar recetas nuevas**: describís lo que querés ("algo con pollo, rápido, sin horno"), o desde una receta tocás *Buscar parecidas*, o desde "lo que tengo" buscás afuera con esos ingredientes. Busca primero recetas reales en internet; si no encuentra suficientes, la IA propone ideas propias (marcadas "Creada por IA"). Tocás una, se arma la ficha y la guardás.
- **Receta**: ajustar porciones, modo cocina (la pantalla no se apaga), marcar "ya la hicimos" y puntaje.
- **Datos**: se guardan en un Google Sheet (una fila por receta); se puede ver y corregir a mano.
- **Acceso**: sin clave; cualquiera con el link puede usarla (no compartir el link fuera de casa).

## Puesta en marcha (una sola vez, ~15 min)

### 1. Google Sheet
1. Creá un Google Sheet vacío (ej.: "Recetas de Casa").
2. **Extensiones → Apps Script**. Borrá lo que haya y pegá todo el archivo `apps-script/Codigo.gs`.
3. En la línea `CLAVE_SECRETA`, reemplazá el texto por una frase larga inventada. Guardá (💾).
4. **Implementar → Nueva implementación** → engranaje → **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Autorizá los permisos (Google avisa "app no verificada": *Configuración avanzada → Ir a…*).
6. Copiá la **URL de la aplicación web** (termina en `/exec`).

> Si después cambiás el código del script: *Implementar → Administrar implementaciones → editar → Versión nueva*.

### 2. API key de Anthropic
En [console.anthropic.com](https://console.anthropic.com) → *API Keys* → crear una. Cargá algo de crédito (cada receta cuesta centavos de dólar; una búsqueda de recetas nuevas, algo más).
Para que funcione la búsqueda en internet: en la consola, **Settings → Privacy** (o *Features*), activá **Web search**.

### 3. Vercel
1. En Vercel: **Add New → Project** → importá este repositorio (`recetas-app`). Si ya estaba conectado, se actualiza solo.
2. En **Settings → Environment Variables** cargá:

| Variable | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | la key del paso 2 |
| `SHEETS_URL` | la URL `/exec` del paso 1 |
| `SHEETS_SECRET` | la misma frase que pusiste en `CLAVE_SECRETA` |

3. **Deployments → Redeploy** para que tome las variables.

### 4. Instalar en los celulares
- **Android (Chrome)**: abrí la app → menú ⋮ → **Agregar a pantalla principal / Instalar**. Desde ahí, en Instagram: *Compartir → Recetas* y la receta se arma sola.
- **iPhone (Safari)**: abrí la app → botón compartir → **Agregar a inicio**.
  - Para compartir desde Instagram, creá un Atajo una vez: app **Atajos** → **+** → en ⓘ activá **Mostrar en hoja de compartir** (recibe *URL* y *Texto*) → agregá la acción **Abrir URL** con:
    `https://TU-APP.vercel.app/?text=` + *Entrada del atajo* (usá la acción **Codificar URL** antes). Nombralo "Guardar receta".
  - Si no querés el Atajo: copiá el link en Instagram y en la app tocá **Pegar**.

## Límites conocidos
- Instagram a veces no deja leer el posteo, o la receta está solo en el audio del video. En ese caso la app avisa: copiá la descripción del posteo o subí capturas.
- La lista se guarda en el celu para verla sin conexión; para agregar o editar hace falta internet.

## Probar en la compu (opcional)
```bash
npm install
cp .env.example .env.local   # completar valores
npm start                    # http://localhost:3000
```
Sin `SHEETS_URL`, guarda en `datos-local.json` (solo para pruebas).
