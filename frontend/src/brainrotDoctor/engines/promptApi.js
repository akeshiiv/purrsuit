import { SYSTEM_PROMPT, parseVerdict } from '../prompt.js';

// On-device Gemini Nano via Chrome's Prompt API. Image in -> text out. No Worker
// needed; inference runs in the browser's own process.
export function createPromptApiDetector({ onProgress } = {}) {
  let session = null;
  let disposed = false;
  // Model creation can sit on a multi-hundred-megabyte download. If the user
  // leaves the page while that is running, the signal cancels it instead of
  // letting it finish for a session that no longer exists.
  const controller = new AbortController();

  const ready = (async () => {
    const created = await self.LanguageModel.create({
      expectedInputs: [{ type: 'image' }],
      signal: controller.signal,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => onProgress && onProgress(e.loaded));
      },
    });
    // Disposed while the download was in flight: destroy what we were handed
    // rather than leaving a model session resident.
    if (disposed) {
      created.destroy?.();
      return;
    }
    session = created;
  })();

  return {
    ready,
    async analyzeFrame(bitmap) {
      await ready;
      if (disposed || !session) return null;
      const text = await session.prompt([
        { role: 'user', content: [
          { type: 'text', value: SYSTEM_PROMPT },
          { type: 'image', value: bitmap },
        ] },
      ]);
      return parseVerdict(text);
    },
    dispose() {
      disposed = true;
      controller.abort();
      if (session) { session.destroy?.(); session = null; }
    },
  };
}
