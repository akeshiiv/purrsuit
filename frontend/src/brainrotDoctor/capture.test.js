import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCaptureSize } from './capture.js';

test('downscales a 2560x1440 screen so the longest edge is maxEdge', () => {
  const { width, height } = computeCaptureSize(2560, 1440, 1024);
  assert.equal(width, 1024);
  assert.equal(height, 576);
});

test('never upscales a small source', () => {
  const { width, height } = computeCaptureSize(800, 600, 1024);
  assert.equal(width, 800);
  assert.equal(height, 600);
});
