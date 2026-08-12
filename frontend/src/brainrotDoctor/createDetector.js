import { createMockDetector } from './engines/mock.js';
import { createPromptApiDetector } from './engines/promptApi.js';
import { createTransformersDetector } from './engines/transformers.js';

const USE_MOCK = import.meta.env.VITE_BRAINROT_DOCTOR_MOCK === 'true';

// Builds the detector for a resolved engine. Mock overrides everything for dev.
export function createDetector({ engine, model, dtype, onProgress } = {}) {
  if (USE_MOCK) {
    const d = createMockDetector();
    return { ready: Promise.resolve(), analyzeFrame: d.analyzeFrame, dispose() {} };
  }
  if (engine === 'prompt-api') return createPromptApiDetector({ onProgress });
  if (engine === 'webgpu') return createTransformersDetector({ model, dtype, onProgress });
  return { ready: Promise.reject(new Error('no engine')), analyzeFrame: async () => null, dispose() {} };
}
