import { pipeline } from '@huggingface/transformers';
import { SYSTEM_PROMPT, parseVerdict } from '../prompt.js';

let captioner = null;

self.onmessage = async (e) => {
  const { type, id, modelId, dtype, bitmap } = e.data;
  try {
    if (type === 'init') {
      captioner = await pipeline('image-text-to-text', modelId, {
        device: 'webgpu', dtype,
        progress_callback: (p) => self.postMessage({ type: 'progress', progress: p }),
      });
      self.postMessage({ type: 'ready' });
    } else if (type === 'analyze') {
      const messages = [{ role: 'user', content: [
        { type: 'image', image: bitmap },
        { type: 'text', text: SYSTEM_PROMPT },
      ] }];
      const out = await captioner(messages, { max_new_tokens: 128 });
      const text = Array.isArray(out) ? (out[0]?.generated_text ?? '') : String(out);
      self.postMessage({ type: 'result', id, verdict: parseVerdict(text) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message ?? 'inference failed' });
  }
};
