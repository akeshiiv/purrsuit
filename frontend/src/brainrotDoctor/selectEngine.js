import { pickModel } from './registry.js';

function defaultEnv() {
  const g = typeof self !== 'undefined' ? self : globalThis;
  return {
    LanguageModel: g.LanguageModel,
    gpu: (typeof navigator !== 'undefined' && navigator.gpu) || undefined,
    deviceMemory: (typeof navigator !== 'undefined' && navigator.deviceMemory) || undefined,
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

export async function selectEngine(env = defaultEnv()) {
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
