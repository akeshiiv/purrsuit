import { pickModel } from './registry.js';

function defaultEnv() {
  const g = typeof self !== 'undefined' ? self : globalThis;
  return {
    LanguageModel: g.LanguageModel,
    gpu: (typeof navigator !== 'undefined' && navigator.gpu) || undefined,
    deviceMemory: (typeof navigator !== 'undefined' && navigator.deviceMemory) || undefined,
    // Optional-chained: this module is unit-tested under plain `node --test`,
    // where Vite never runs and `import.meta.env` is undefined.
    useMock: import.meta.env?.VITE_BRAINROT_DOCTOR_MOCK === 'true',
  };
}

async function promptApiUsable(LanguageModel) {
  if (!LanguageModel || typeof LanguageModel.availability !== 'function') return false;
  try {
    const status = await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] });
    return status !== 'unavailable';
  } catch {
    return false;
  }
}

// The dev override is resolved here rather than in createDetector, which is where
// it used to be checked. Engine selection runs first, and the hook bails on
// `engine: 'none'` before createDetector is ever called — so on a machine with no
// WebGPU and no Prompt API, which is precisely the machine the flag exists for,
// setting VITE_BRAINROT_DOCTOR_MOCK=true did nothing at all. It only worked where
// a real engine was already available. Deciding it here keeps "which engine" one
// question answered in one place.
export async function selectEngine(env = defaultEnv()) {
  if (env.useMock) {
    return { engine: 'mock', model: null };
  }
  if (await promptApiUsable(env.LanguageModel)) {
    return { engine: 'prompt-api', model: null };
  }
  // A WebGPU device still needs to be big enough for the one model measured to work;
  // pickModel returns null otherwise, which falls through to tier 3.
  const picked = env.gpu ? pickModel(env) : null;
  if (picked) {
    return { engine: 'webgpu', model: picked.modelId, dtype: picked.dtype };
  }
  return { engine: 'none', model: null };
}
