// PROVISIONAL model ids/dtypes — finalized by Task 12 (model spike) on real
// screenshots. Everything downstream builds against these regardless.
export const MODEL_REGISTRY = {
  capable: { modelId: 'onnx-community/FastVLM-0.5B-ONNX', dtype: 'q4' },
  constrained: { modelId: 'HuggingFaceTB/SmolVLM-256M-Instruct', dtype: 'q4' },
};

// Capable tier requires roomy memory; deviceMemory is coarse but the only
// portable signal. Missing deviceMemory is treated as capable (desktop default).
export function pickModel({ deviceMemory } = {}) {
  const mem = typeof deviceMemory === 'number' ? deviceMemory : 8;
  return mem >= 8 ? MODEL_REGISTRY.capable : MODEL_REGISTRY.constrained;
}
