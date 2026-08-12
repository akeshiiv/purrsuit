import { AutoProcessor, AutoModelForImageTextToText, RawImage } from '@huggingface/transformers';
import {
  CATEGORY_PROMPT, SUMMARY_PROMPT, JUSTIFICATION_PROMPT,
  CATEGORY_MAX_TOKENS, PROSE_MAX_TOKENS,
  parseCategory, buildVerdict,
} from '../prompt.js';
import { FOCUSED } from '../contract.js';

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
function buildPromptText(id, prompt) {
  const content = isSmolVLM(id)
    ? [{ type: 'image' }, { type: 'text', text: prompt }]
    : `<image>\n${prompt}`;
  return processor.apply_chat_template([{ role: 'user', content }], { add_generation_prompt: true });
}

// Idefics3Processor is _call(text, images, opts); LlavaProcessor is _call(images, text)
// — the argument order is reversed between the two families.
function buildInputs(id, text, image) {
  return isSmolVLM(id)
    ? processor(text, [image], { do_image_splitting: false })
    : processor(image, text);
}

// One image+prompt round trip, returning just the model's own continuation.
async function ask(prompt, image, maxNewTokens) {
  const inputs = await buildInputs(currentId, buildPromptText(currentId, prompt), image);
  const generated = await model.generate({ ...inputs, max_new_tokens: maxNewTokens, do_sample: false });
  // Drop the echoed prompt so only the generated text is returned.
  const trimmed = generated.slice(null, [inputs.input_ids.dims.at(-1), null]);
  return (processor.batch_decode(trimmed, { skip_special_tokens: true })[0] ?? '').trim();
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
      // Step 1: the category alone. One word, tiny token budget — nothing to truncate
      // or escape, which is what made every JSON variant fail in the spike.
      const category = parseCategory(await ask(CATEGORY_PROMPT, image, CATEGORY_MAX_TOKENS));
      // Step 2: only a distraction needs prose, so the common path stays one call.
      let summary = '';
      let justification = '';
      if (category && category !== FOCUSED) {
        summary = await ask(SUMMARY_PROMPT, image, PROSE_MAX_TOKENS);
        justification = await ask(JUSTIFICATION_PROMPT, image, PROSE_MAX_TOKENS);
      }
      self.postMessage({ type: 'result', id, verdict: buildVerdict(category, summary, justification) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message ?? 'inference failed' });
  }
};
