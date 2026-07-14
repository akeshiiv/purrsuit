import { SYSTEM_PROMPT, parseVerdict } from '../prompt.js';

// On-device Gemini Nano via Chrome's Prompt API. Image in -> text out. No Worker
// needed; inference runs in the browser's own process.
export function createPromptApiDetector({ onProgress } = {}) {
  let session = null;
  const ready = (async () => {
    session = await self.LanguageModel.create({
      expectedInputs: [{ type: 'image' }],
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => onProgress && onProgress(e.loaded));
      },
    });
  })();

  return {
    ready,
    async analyzeFrame(bitmap) {
      await ready;
      const text = await session.prompt([
        { role: 'user', content: [
          { type: 'text', value: SYSTEM_PROMPT },
          { type: 'image', value: bitmap },
        ] },
      ]);
      return parseVerdict(text);
    },
    dispose() { if (session) session.destroy?.(); },
  };
}
