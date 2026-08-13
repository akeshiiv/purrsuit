import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCaptureSize, createCaptureController } from './capture.js';

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

// Regression: start() assigned the live stream and then did three more things
// that can throw — video.play() rejects in browsers that treat the user gesture
// as spent once the async picker resolves. The rejection propagated with the
// stream still running, and the only caller publishes the controller handle
// AFTER start() resolves, so the hook's cleanup had nothing to stop: the browser
// kept sharing the screen until the tab was closed.
test('a failure after the picker stops the stream it already opened', async () => {
  const stopped = [];
  const track = { stop: () => stopped.push('video'), addEventListener() {} };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };

  const originalCreate = globalThis.document?.createElement;
  globalThis.document = {
    createElement: () => ({
      set srcObject(v) { this._src = v; },
      get srcObject() { return this._src; },
      play: () => Promise.reject(new Error('NotAllowedError')),
    }),
  };

  try {
    const capture = createCaptureController({ getDisplayMedia: () => Promise.resolve(stream) });
    await assert.rejects(() => capture.start(), /NotAllowedError/);
    assert.deepEqual(stopped, ['video'], 'the screen-share track is stopped, not left running');
  } finally {
    if (originalCreate) globalThis.document.createElement = originalCreate;
    else delete globalThis.document;
  }
});
