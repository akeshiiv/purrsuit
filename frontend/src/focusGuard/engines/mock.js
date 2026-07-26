import { emptyVerdict } from '../contract.js';

// Deterministic detector for building/testing the whole flow without a model.
// `verdicts` is an optional queue; once drained the last one repeats. With no
// queue it always returns a focused verdict.
export function createMockDetector({ verdicts = [] } = {}) {
  const queue = [...verdicts];
  let last = null;
  return {
    async analyzeFrame() {
      const next = queue.shift() ?? last ?? null;
      last = next;
      if (!next) return emptyVerdict();
      return {
        distracted: Boolean(next.distracted),
        summary: next.summary ?? '',
        justification: next.justification ?? '',
        reason: next.reason ?? (next.distracted ? 'other' : 'focused'),
        parsed: true,
      };
    },
  };
}
