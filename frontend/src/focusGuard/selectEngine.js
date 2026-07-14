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
  if (env.gpu) {
    return { engine: 'webgpu', model: pickModel(env).modelId };
  }
  return { engine: 'none', model: null };
}
