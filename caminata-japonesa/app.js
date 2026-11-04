'use strict';

// ---------- Configuración ----------
const LIMITS = { minutes: [1, 15], cycles: [1, 20] };
const cfg = { minutes: 3, cycles: 5 };

try {
  const saved = JSON.parse(localStorage.getItem('caminata-cfg') || '{}');
  if (saved.minutes) cfg.minutes = saved.minutes;
  if (saved.cycles) cfg.cycles = saved.cycles;
} catch (e) {}

const $ = (id) => document.getElementById(id);

function saveCfg() {
  try { localStorage.setItem('caminata-cfg', JSON.stringify(cfg)); } catch (e) {}
}

function renderCfg() {
  $('minutes').textContent = cfg.minutes;
  $('cycles').textContent = cfg.cycles;
  $('total').textContent = `Total: ${cfg.minutes * 2 * cfg.cycles} minutos`;
}

document.querySelectorAll('.step').forEach((b) => {
  b.addEventListener('click', () => {
    const k = b.dataset.target;
    const [min, max] = LIMITS[k];
    cfg[k] = Math.min(max, Math.max(min, cfg[k] + Number(b.dataset.delta)));
    saveCfg();
    renderCfg();
  });
});

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

// ---------- Sonido ----------
let ctx;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.5, dest) {
  const a = audio();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest || a.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
  return o;
}

// Campana grave (lento): 2 toques. Pitido agudo (rápido): 3 toques.
function signal(phase) {
  const t = audio().currentTime + 0.05;
  if (phase === 'slow') {
    [0, 0.7].forEach((d) => { tone(523, t + d, 1.2, 'sine', 0.8); tone(784, t + d, 1.0, 'sine', 0.3); });
    vibrate([600, 300, 600]);
  } else {
    [0, 0.3, 0.6].forEach((d) => tone(1175, t + d, 0.22, 'square', 0.35));
    vibrate([200, 100, 200, 100, 200]);
  }
}

function finishSignal() {
  const t = audio().currentTime + 0.05;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.18, 0.6, 'triangle', 0.6));
  vibrate([300, 100, 300, 100, 800]);
}

function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

// ---------- Pantalla encendida ----------
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseAwake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.running) keepAwake();
});

// ---------- Cronómetro ----------
const state = { running: false, paused: false, cycle: 1, phase: 'slow', endAt: 0, remaining: 0, timer: null };

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function renderRun() {
  document.body.className = state.paused ? 'paused' : state.phase;
  $('phase').textContent = state.paused ? 'EN PAUSA' : (state.phase === 'slow' ? 'LENTO' : 'RÁPIDO');
  $('cycleInfo').textContent = `Ciclo ${state.cycle} de ${cfg.cycles}`;
  $('btnPause').textContent = state.paused ? 'SEGUIR' : 'PAUSA';
}

function startPhase(phase) {
  state.phase = phase;
  state.endAt = Date.now() + cfg.minutes * 60000;
  signal(phase);
  renderRun();
}

function tick() {
  if (!state.running || state.paused) return;
  const left = state.endAt - Date.now();
  $('clock').textContent = fmt(left);
  if (left > 0) return;
  if (state.phase === 'slow') {
    startPhase('fast');
  } else if (state.cycle < cfg.cycles) {
    state.cycle++;
    startPhase('slow');
  } else {
    finish(true);
  }
}

$('btnStart').addEventListener('click', () => {
  audio();
  Object.assign(state, { running: true, paused: false, cycle: 1 });
  show('run');
  keepAwake();
  startPhase('slow');
  $('clock').textContent = fmt(cfg.minutes * 60000);
  clearInterval(state.timer);
  state.timer = setInterval(tick, 250);
});

$('btnPause').addEventListener('click', () => {
  if (!state.paused) {
    state.paused = true;
    state.remaining = state.endAt - Date.now();
  } else {
    state.paused = false;
    state.endAt = Date.now() + state.remaining;
  }
  renderRun();
});

$('btnStop').addEventListener('click', () => {
  if (confirm('¿Terminar la caminata?')) finish(false);
});

function finish(completed) {
  state.running = false;
  clearInterval(state.timer);
  releaseAwake();
  document.body.className = '';
  if (completed) finishSignal();
  const mins = completed ? cfg.minutes * 2 * cfg.cycles : null;
  $('thanks').textContent = completed
    ? `Completaste ${cfg.cycles} ciclos y ${mins} minutos de caminata. ¡Gracias por cuidarte!`
    : '¡Gracias por salir a caminar hoy! Cada paso cuenta.';
  show('done');
  loadFact();
}

$('btnHome').addEventListener('click', () => { stopMusic(); renderCfg(); show('setup'); });

// ---------- Efeméride del día (Wikipedia en español) ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

async function loadFact() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  $('factTitle').textContent = `Un ${d.getDate()} de ${MESES[d.getMonth()]}…`;
  $('factText').textContent = 'Buscando un dato curioso…';
  try {
    const r = await fetch(`https://es.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    const events = (data.events || []).filter((e) => e.text && e.year);
    if (!events.length) throw new Error('vacío');
    const arg = events.filter((e) => /argentin|buenos aires/i.test(e.text));
    const pool = arg.length ? arg : events;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    $('factText').textContent = `…de ${ev.year}: ${ev.text}`;
  } catch (e) {
    $('factText').textContent = 'No hay conexión a internet para buscar el dato de hoy. ¡Mañana habrá otro!';
  }
}

// ---------- Música alegre del día (generada) ----------
// Notas en MIDI, [nota, tiempos]. Una melodía por día de la semana.
const MELODIES = [
  [[72,1],[76,1],[79,1],[76,1],[77,1],[81,1],[79,2],[76,1],[77,1],[79,1],[84,1],[83,1],[79,1],[84,2]],
  [[67,.5],[72,.5],[76,1],[76,.5],[74,.5],[72,1],[74,.5],[76,.5],[77,1],[76,1],[74,2],[72,.5],[74,.5],[76,1],[79,1],[77,.5],[76,.5],[74,1],[72,2]],
  [[72,.5],[72,.5],[79,1],[79,.5],[81,.5],[79,1],[77,.5],[76,.5],[74,1],[76,.5],[77,.5],[79,1],[72,1],[84,2]],
  [[76,.5],[79,.5],[84,1],[83,.5],[81,.5],[79,1],[81,.5],[79,.5],[76,1],[77,.5],[76,.5],[74,1],[79,.5],[76,.5],[72,2]],
  [[72,1],[74,.5],[76,.5],[79,1],[76,1],[81,.5],[79,.5],[77,.5],[76,.5],[74,2],[77,1],[76,.5],[74,.5],[72,1],[79,1],[84,2]],
  [[79,.5],[81,.5],[79,.5],[76,.5],[72,1],[74,1],[76,.5],[77,.5],[79,1],[79,1],[81,.5],[83,.5],[84,1],[79,1],[84,2]],
  [[72,.5],[76,.5],[79,.5],[84,.5],[83,1],[79,1],[81,.5],[77,.5],[74,.5],[77,.5],[76,1],[72,1],[74,.5],[76,.5],[77,.5],[79,.5],[84,2]],
];
const BASS = [48, 53, 55, 48]; // Do, Fa, Sol, Do

let musicOut = null;
let musicStopTimer = null;

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

function playMusic() {
  stopMusic();
  const a = audio();
  musicOut = a.createGain();
  musicOut.gain.value = 0.9;
  musicOut.connect(a.destination);
  const mel = MELODIES[new Date().getDay()];
  const beat = 0.32;
  const melLen = mel.reduce((s, n) => s + n[1], 0);
  let t = a.currentTime + 0.1;
  const repeats = 3;
  for (let r = 0; r < repeats; r++) {
    let tt = t;
    mel.forEach(([n, b]) => { tone(midi(n), tt, b * beat * 0.95, 'triangle', 0.35, musicOut); tt += b * beat; });
    // bajo y percusión suave a tiempo
    for (let i = 0; i < melLen; i++) {
      const bt = t + i * beat;
      if (i % 2 === 0) tone(midi(BASS[Math.floor(i / 4) % 4]), bt, beat * 1.6, 'sine', 0.4, musicOut);
      else tone(midi(BASS[Math.floor(i / 4) % 4] + 19), bt, 0.08, 'square', 0.06, musicOut);
    }
    t += melLen * beat;
  }
  tone(midi(72), t, 1.2, 'triangle', 0.4, musicOut);
  tone(midi(48), t, 1.2, 'sine', 0.4, musicOut);
  $('btnMusic').textContent = '⏹ PARAR MÚSICA';
  musicStopTimer = setTimeout(stopMusic, (t - a.currentTime + 1.5) * 1000);
}

function stopMusic() {
  clearTimeout(musicStopTimer);
  if (musicOut) { musicOut.disconnect(); musicOut = null; }
  $('btnMusic').textContent = '🎵 MÚSICA';
}

$('btnMusic').addEventListener('click', () => (musicOut ? stopMusic() : playMusic()));

// ---------- Inicio ----------
renderCfg();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
