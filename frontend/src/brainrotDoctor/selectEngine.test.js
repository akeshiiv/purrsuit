import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectEngine } from './selectEngine.js';
import { pickModel } from './registry.js';

const promptApiEnv = {
  LanguageModel: { availability: async () => 'available' },
  gpu: {}, deviceMemory: 16,
};

test('selects prompt-api when LanguageModel image input is available', async () => {
  const r = await selectEngine(promptApiEnv);
  assert.equal(r.engine, 'prompt-api');
});

test('falls back to webgpu when LanguageModel is unavailable but gpu exists', async () => {
  const r = await selectEngine({
    LanguageModel: { availability: async () => 'unavailable' },
    gpu: { requestAdapter: async () => ({}) },
    deviceMemory: 16,
  });
  assert.equal(r.engine, 'webgpu');
  assert.equal(typeof r.model, 'string');
});

test('selects none when neither engine is present', async () => {
  const r = await selectEngine({ LanguageModel: undefined, gpu: undefined, deviceMemory: 4 });
  assert.equal(r.engine, 'none');
  assert.equal(r.model, null);
});

test('pickModel returns the validated model on a roomy device', () => {
  const capable = pickModel({ deviceMemory: 16 });
  assert.equal(typeof capable.modelId, 'string');
  assert.equal(typeof capable.dtype, 'object');
});

// The spike found no small model that can actually detect distractions: SmolVLM-256M
// caught 1 of 7. Shipping it would monitor a cheater and still credit them, so a device
// too small for the validated model gets no engine at all (tier 3 -> uncredited).
test('pickModel returns null on a device too small for the validated model', () => {
  assert.equal(pickModel({ deviceMemory: 4 }), null);
});

test('selects none when the gpu exists but the device is too small for any model', async () => {
  const r = await selectEngine({
    LanguageModel: undefined,
    gpu: { requestAdapter: async () => ({}) },
    deviceMemory: 4,
  });
  assert.equal(r.engine, 'none');
  assert.equal(r.model, null);
});

// Regression: this flag used to be read inside createDetector, but the hook
// bails on `engine: 'none'` before createDetector is ever reached — so on a
// machine with no WebGPU and no Prompt API, exactly the machine the flag exists
// to unblock, it had no effect at all.
test('the dev mock flag wins on a machine with no engine of its own', async () => {
  const bareEnv = { LanguageModel: undefined, gpu: undefined, deviceMemory: undefined };

  assert.equal((await selectEngine(bareEnv)).engine, 'none', 'without the flag: no engine');
  assert.equal(
    (await selectEngine({ ...bareEnv, useMock: true })).engine,
    'mock',
    'with the flag: the mock detector, even with no GPU and no Prompt API',
  );
});

test('the dev mock flag also overrides an engine that would otherwise be picked', async () => {
  const r = await selectEngine({ ...promptApiEnv, useMock: true });
  assert.equal(r.engine, 'mock');
});
