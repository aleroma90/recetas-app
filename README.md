# Recetas IA

App simple para sugerir recetas según ingredientes disponibles, usando Claude (Anthropic).

## 1. Conseguir API key

1. Entrá a https://console.anthropic.com/
2. Creá una cuenta (o iniciá sesión) y cargá algo de crédito (con pocos dólares alcanza para uso personal).
3. Andá a "API Keys" y creá una nueva key.

## 2. Configurar

1. Copiá `.env.example` a `.env`:
   ```
   copy .env.example .env
   ```
2. Pegá tu API key en `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

## 3. Instalar y correr

```
npm install
npm start
```

La app queda en `http://localhost:3000`.

## 4. Abrir desde el celu (misma wifi)

1. En la PC, buscá tu IP local:
   ```
   ipconfig
   ```
   Buscá la línea "IPv4 Address" (algo como `192.168.0.15`).
2. En el celu (conectado a la misma wifi), abrí en el navegador:
   ```
   http://192.168.0.15:3000
   ```
3. Tip: agregá la página a la pantalla de inicio del celu para que se sienta como una app.
