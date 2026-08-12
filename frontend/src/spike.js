// Dev-only model spike harness (served by `vite` at /spike.html; not part of the
// production build, which only inputs index.html). It drives the REAL transformers.js
// WebGPU worker via createTransformersDetector, so it validates the full pipeline —
// model load, the BrainrotDoctor prompt, and verdict parsing — on real screenshots.
import { createTransformersDetector } from './brainrotDoctor/engines/transformers.js';
import { MODEL_REGISTRY } from './brainrotDoctor/registry.js';

// 'registry' measures exactly what production ships: the per-module dtype map from
// the registry entry for this model. The scalar options exist for comparison.
function resolveDtype(model, choice) {
  if (choice !== 'registry') return choice;
  const entry = Object.values(MODEL_REGISTRY).find((m) => m.modelId === model);
  return entry?.dtype;
}

const el = (id) => document.getElementById(id);
let detector = null;

function setStatus(msg) {
  el('status').textContent = msg;
}

el('load').addEventListener('click', async () => {
  const model = el('model').value;
  const dtype = resolveDtype(model, el('dtype').value);
  detector?.dispose?.();
  detector = null;
  setStatus(`loading ${model} (${JSON.stringify(dtype)})…`);
  const started = performance.now();
  const next = createTransformersDetector({
    model,
    dtype,
    onProgress: (p) => {
      if (p && p.status === 'progress' && p.file) {
        setStatus(`downloading ${p.file}: ${Math.round(p.progress || 0)}%`);
      } else if (p && p.status) {
        setStatus(`${p.status}${p.file ? ` ${p.file}` : ''}…`);
      }
    },
  });
  try {
    await next.ready;
    detector = next;
    setStatus(`ready in ${((performance.now() - started) / 1000).toFixed(1)}s — drop screenshots`);
  } catch (err) {
    setStatus(`load failed: ${err?.message || err}`);
    next.dispose?.();
  }
});

async function analyze(file) {
  if (!detector) {
    setStatus('load a model first');
    return;
  }
  const card = document.createElement('div');
  card.className = 'card';
  const url = URL.createObjectURL(file);
  card.innerHTML = `<img src="${url}" alt="" /><strong>${file.name}</strong> — analyzing…`;
  el('results').prepend(card);

  const bitmap = await createImageBitmap(file);
  const started = performance.now();
  try {
    const v = await detector.analyzeFrame(bitmap);
    const ms = Math.round(performance.now() - started);
    const verdict = v.distracted
      ? '<span class="yes">distracted</span>'
      : '<span class="no">focused</span>';
    card.innerHTML = `
      <img src="${url}" alt="" />
      <strong>${file.name}</strong> · ${ms}ms<br />
      verdict: ${verdict} · reason: <code>${v.reason}</code><br />
      summary: ${v.summary || '—'}<br />
      why: ${v.justification || '—'}`;
  } catch (err) {
    card.innerHTML = `<img src="${url}" alt="" /><strong>${file.name}</strong> — error: ${err?.message || err}`;
  }
  // No close() here: analyzeFrame transfers the bitmap to the worker, which owns
  // and releases it. Closing a transferred bitmap here only muddies the output.
}

el('file').addEventListener('change', (e) => {
  for (const f of e.target.files) analyze(f);
});
const drop = el('drop');
drop.addEventListener('click', () => el('file').click());
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hot'); });
drop.addEventListener('dragleave', () => drop.classList.remove('hot'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('hot');
  for (const f of e.dataTransfer.files) {
    if (f.type.startsWith('image/')) analyze(f);
  }
});
