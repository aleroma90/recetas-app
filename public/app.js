const form = document.getElementById('form');
const consultaInput = document.getElementById('consulta');
const micBtn = document.getElementById('micBtn');
const estado = document.getElementById('estado');
const resultado = document.getElementById('resultado');
const masBtn = document.getElementById('masBtn');
const submitBtn = document.getElementById('submitBtn');

let recetasVistas = [];

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

function extraerTitulos(md) {
  return [...md.matchAll(/^#\s+(.*)$/gm)].map((m) => m[1].trim());
}

// Dictado por voz (Web Speech API, soportado en Chrome/Android)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.interimResults = false;

  micBtn.addEventListener('click', () => {
    micBtn.classList.add('listening');
    micBtn.textContent = '🔴';
    recognition.start();
  });

  recognition.addEventListener('result', (e) => {
    const texto = e.results[0][0].transcript;
    consultaInput.value = consultaInput.value
      ? `${consultaInput.value} ${texto}`
      : texto;
  });

  const resetMic = () => {
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
  };
  recognition.addEventListener('end', resetMic);
  recognition.addEventListener('error', resetMic);
} else {
  micBtn.style.display = 'none';
}

async function pedirRecetas({ nueva }) {
  const consulta = consultaInput.value.trim();
  if (!consulta) return;

  estado.textContent = 'Buscando recetas...';
  submitBtn.disabled = true;
  masBtn.disabled = true;

  if (nueva) {
    recetasVistas = [];
    resultado.innerHTML = '';
    resultado.style.display = 'none';
  }

  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consulta, excluir: recetasVistas }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    recetasVistas = recetasVistas.concat(extraerTitulos(data.recetas));
    resultado.innerHTML += `<div class="tanda"><p>${mdToHtml(data.recetas)}</p></div>`;
    resultado.style.display = 'block';
    masBtn.style.display = 'block';
    estado.textContent = '';
  } catch (err) {
    estado.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    masBtn.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  pedirRecetas({ nueva: true });
});

masBtn.addEventListener('click', () => {
  pedirRecetas({ nueva: false });
});
