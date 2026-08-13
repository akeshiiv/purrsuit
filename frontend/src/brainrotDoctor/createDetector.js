import { createMockDetector } from './engines/mock.js';
import { createPromptApiDetector } from './engines/promptApi.js';
import { createTransformersDetector } from './engines/transformers.js';

// Builds the detector for a resolved engine. The dev mock is now one of those
// engines rather than a flag read again here — selectEngine owns that decision,
// because it runs first and the caller bails on 'none' before reaching this.
export function createDetector({ engine, model, dtype, onProgress } = {}) {
  if (engine === 'mock') {
    const d = createMockDetector();
    return { ready: Promise.resolve(), analyzeFrame: d.analyzeFrame, dispose() {} };
  }
  if (engine === 'prompt-api') return createPromptApiDetector({ onProgress });
  if (engine === 'webgpu') return createTransformersDetector({ model, dtype, onProgress });
  return { ready: Promise.reject(new Error('no engine')), analyzeFrame: async () => null, dispose() {} };
}
