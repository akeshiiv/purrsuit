// Per-module dtype, not a scalar: these models ship as three separate ONNX graphs
// (embed_tokens / vision_encoder / decoder_model_merged) and the sensible quantization
// differs per module. Sizes below are the actual download at these dtypes.
// PROVISIONAL model ids — finalized by Task 12 (model spike) on real screenshots.
export const MODEL_REGISTRY = {
  // llava_qwen2. ~1.04GB (embed fp16 259MB + vision q4 482MB + decoder q4 303MB).
  capable: {
    modelId: 'onnx-community/FastVLM-0.5B-ONNX',
    dtype: { embed_tokens: 'fp16', vision_encoder: 'q4', decoder_model_merged: 'q4' },
  },
  // idefics3. ~315MB (embed fp16 54MB + vision fp16 179MB + decoder q4 83MB). The
  // vision encoder stays fp16 here — it is small enough that q4 only costs accuracy.
  constrained: {
    modelId: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    dtype: { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4' },
  },
};

// Capable tier requires roomy memory; deviceMemory is coarse but the only
// portable signal. Missing deviceMemory is treated as capable (desktop default).
export function pickModel({ deviceMemory } = {}) {
  const mem = typeof deviceMemory === 'number' ? deviceMemory : 8;
  return mem >= 8 ? MODEL_REGISTRY.capable : MODEL_REGISTRY.constrained;
}
