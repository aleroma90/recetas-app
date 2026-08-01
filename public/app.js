const form = document.getElementById('form');
const estado = document.getElementById('estado');
const resultado = document.getElementById('resultado');

function mdToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
    .replace(/^[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ol>${m}</ol>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const ingredientes = document.getElementById('ingredientes').value.trim();
  const tipoComida = document.getElementById('tipoComida').value.trim();
  const contexto = document.getElementById('contexto').value.trim();

  if (!ingredientes) return;

  estado.textContent = 'Buscando recetas...';
  resultado.style.display = 'none';
  form.querySelector('button').disabled = true;

  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredientes, tipoComida, contexto }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    resultado.innerHTML = `<p>${mdToHtml(data.recetas)}</p>`;
    resultado.style.display = 'block';
    estado.textContent = '';
  } catch (err) {
    estado.textContent = err.message;
  } finally {
    form.querySelector('button').disabled = false;
  }
});
