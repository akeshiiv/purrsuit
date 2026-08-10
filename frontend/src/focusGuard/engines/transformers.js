import { emptyVerdict } from '../contract.js';

// Runs the VLM in a Web Worker (mandatory — heavy WebGPU/WASM off the main
// thread). The exact model-output message contract is validated in the spike.
export function createTransformersDetector({ model, dtype, onProgress } = {}) {
  const worker = new Worker(new URL('./modelWorker.js', import.meta.url), { type: 'module' });
  let seq = 0;
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  let settled = false;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  const settleReady = (fn, value) => { if (!settled) { settled = true; fn(value); } };

  // A worker that fails to load/parse must reject `ready` — otherwise the caller
  // awaits it forever and the session hangs in warming with the screen-share live.
  worker.onerror = (event) => {
    settleReady(rejectReady, new Error(event?.message || 'model worker failed to load'));
  };

  worker.onmessage = (e) => {
    const { type, id, verdict, progress, message } = e.data;
    if (type === 'ready') settleReady(resolveReady);
    else if (type === 'progress') onProgress && onProgress(progress);
    else if (type === 'result') pending.get(id)?.resolve(verdict);
    else if (type === 'error') {
      if (message) console.warn('[focus-guard] inference error:', message);
      // An init-time error (no request id) must reject `ready`; a per-frame
      // error fails safe to a focused verdict (never fabricate a distraction).
      if (id == null) settleReady(rejectReady, new Error(message || 'model init failed'));
      else pending.get(id)?.resolve(emptyVerdict());
    }
    if (id != null) pending.delete(id);
  };
  worker.postMessage({ type: 'init', modelId: model, dtype });

  return {
    ready,
    analyzeFrame(bitmap) {
      const id = ++seq;
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        worker.postMessage({ type: 'analyze', id, bitmap }, [bitmap]);
      });
    },
    dispose() {
      // Terminating mid-download or mid-inference means no reply is ever coming,
      // so settle whoever is waiting before pulling the worker out from under
      // them — an await on a promise that can never resolve pins the whole
      // capture closure (and the caller's abort check never runs).
      settleReady(rejectReady, new Error('focus guard disposed'));
      pending.forEach((entry) => entry.resolve(null));
      pending.clear();
      worker.terminate();
    },
  };
}
