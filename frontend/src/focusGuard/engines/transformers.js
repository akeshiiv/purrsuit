import { emptyVerdict } from '../contract.js';

// Runs the VLM in a Web Worker (mandatory — heavy WebGPU/WASM off the main
// thread). The exact model-output message contract is validated in the spike.
export function createTransformersDetector({ model, dtype = 'q4', onProgress } = {}) {
  const worker = new Worker(new URL('./modelWorker.js', import.meta.url), { type: 'module' });
  let seq = 0;
  const pending = new Map();
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });

  worker.onmessage = (e) => {
    const { type, id, verdict, progress, message } = e.data;
    if (type === 'ready') resolveReady();
    else if (type === 'progress') onProgress && onProgress(progress);
    else if (type === 'result') pending.get(id)?.resolve(verdict);
    else if (type === 'error') pending.get(id)?.resolve(emptyVerdict()); // fail safe: never fabricate distraction
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
    dispose() { worker.terminate(); },
  };
}
