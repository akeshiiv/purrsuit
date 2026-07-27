// Validated by the Task 12 model spike on 2026-07-27 against 11 real screenshots
// (results: docs/superpowers/2026-07-27-focus-guard-spike-results.md).
//
// Per-module dtype, not a scalar: these models ship as three separate ONNX graphs
// (embed_tokens / vision_encoder / decoder_model_merged) and the sensible quantization
// differs per module. ~1.04GB total at these dtypes, cached to IndexedDB after first load.
//
// There is deliberately no smaller "constrained" entry. SmolVLM-256M was measured at
// 1 of 7 distractions caught and SmolVLM-Instruct-2.2B at 0 of 7 — a model that monitors
// but never detects is worse than no monitoring, because it credits the cheater. Devices
// too small for this model get no engine and run uncredited instead.
export const MODEL_REGISTRY = {
  capable: {
    modelId: 'onnx-community/FastVLM-0.5B-ONNX', // llava_qwen2
    dtype: { embed_tokens: 'fp16', vision_encoder: 'q4', decoder_model_merged: 'q4' },
  },
};

// deviceMemory is coarse but the only portable signal. Missing deviceMemory is treated
// as capable (desktop default). Returns null when the device cannot run the validated
// model, which selectEngine maps to tier 3.
export function pickModel({ deviceMemory } = {}) {
  const mem = typeof deviceMemory === 'number' ? deviceMemory : 8;
  return mem >= 8 ? MODEL_REGISTRY.capable : null;
}
