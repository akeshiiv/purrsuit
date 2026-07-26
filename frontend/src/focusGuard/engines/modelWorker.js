import { AutoProcessor, AutoModelForImageTextToText, RawImage } from '@huggingface/transformers';
import { SYSTEM_PROMPT, parseVerdict } from '../prompt.js';

// Conversational VLMs are NOT a `pipeline()` task in transformers.js v4 — there is
// no 'image-text-to-text' pipeline, so they load as AutoProcessor + a generative
// model. AutoModelForImageTextToText covers both architectures we ship:
// llava_qwen2 (FastVLM) and idefics3/smolvlm (SmolVLM).
let processor = null;
let model = null;
let currentId = null;

// The two families differ in how the processor is CALLED, not in which model class
// loads them — see buildInputs.
const isSmolVLM = (id) => /smolvlm|idefics/i.test(id);

// SmolVLM's chat template iterates `content` as typed parts and emits the <image>
// marker itself; FastVLM's (Qwen2 ChatML) interpolates `content` as a plain string,
// so the marker has to be inline for LlavaProcessor to expand it.
function buildPromptText(id) {
  const content = isSmolVLM(id)
    ? [{ type: 'image' }, { type: 'text', text: SYSTEM_PROMPT }]
    : `<image>\n${SYSTEM_PROMPT}`;
  return processor.apply_chat_template([{ role: 'user', content }], { add_generation_prompt: true });
}

// Idefics3Processor is _call(text, images, opts); LlavaProcessor is _call(images, text)
// — the argument order is reversed between the two families.
function buildInputs(id, text, image) {
  return isSmolVLM(id)
    ? processor(text, [image], { do_image_splitting: false })
    : processor(image, text);
}

function bitmapToImage(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return new RawImage(data, bitmap.width, bitmap.height, 4).rgb();
}

self.onmessage = async (e) => {
  const { type, id, modelId, dtype, bitmap } = e.data;
  try {
    if (type === 'init') {
      currentId = modelId;
      const progress_callback = (p) => self.postMessage({ type: 'progress', progress: p });
      processor = await AutoProcessor.from_pretrained(modelId, { progress_callback });
      model = await AutoModelForImageTextToText.from_pretrained(modelId, {
        // transformers.js accepts a scalar dtype or a per-module map; the registry
        // supplies the per-module map, so pass whatever the caller chose straight through.
        dtype: dtype || 'q4',
        device: 'webgpu',
        progress_callback,
      });
      self.postMessage({ type: 'ready' });
    } else if (type === 'analyze') {
      const image = bitmapToImage(bitmap);
      bitmap.close?.();
      const inputs = await buildInputs(currentId, buildPromptText(currentId), image);
      const generated = await model.generate({ ...inputs, max_new_tokens: 128, do_sample: false });
      // Drop the echoed prompt so only the model's own JSON reaches parseVerdict.
      const trimmed = generated.slice(null, [inputs.input_ids.dims.at(-1), null]);
      const decoded = processor.batch_decode(trimmed, { skip_special_tokens: true });
      self.postMessage({ type: 'result', id, verdict: parseVerdict(decoded[0] ?? '') });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message ?? 'inference failed' });
  }
};
