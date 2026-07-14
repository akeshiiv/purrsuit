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

test('pickModel returns the constrained model on low memory', () => {
  const capable = pickModel({ deviceMemory: 16 });
  const constrained = pickModel({ deviceMemory: 4 });
  assert.notEqual(capable.modelId, constrained.modelId);
});
