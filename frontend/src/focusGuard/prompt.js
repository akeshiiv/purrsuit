import { DISTRACTION_REASONS, FOCUSED, emptyVerdict } from './contract.js';

const ALLOWED = new Set([...DISTRACTION_REASONS, FOCUSED]);

export const SYSTEM_PROMPT = [
  'You judge whether a screenshot of a student’s screen shows focused studying or a distraction.',
  'Choose exactly one category:',
  '- focused: coursework, docs, code, notes, research, academic reading/writing.',
  '- social-media, entertainment, chat-nonacademic, gaming, shopping, other: clearly non-academic content.',
  'Only pick a distraction category when the screen is CLEARLY non-academic. When unsure, choose focused.',
  'Reply with ONLY a JSON object: {"category": "<one>", "summary": "<what is on screen>", "justification": "<why it fits that category>"}.',
].join('\n');

// --- tier-2 flow -------------------------------------------------------------------
// The model spike (2026-07-27) measured that 0.5B–2.2B VLMs cannot reliably emit the
// JSON above: they invent wrappers, leave quotes unescaped, truncate mid-string, or
// copy the schema back. Asking for a single word instead flagged 7/7 distractions.
// So tier 2 asks for the category alone, then — only when that says distracted —
// asks two plain-prose questions, which these models answer well. Tier 1 keeps the
// JSON path above, where the Prompt API can enforce a schema with responseConstraint.

// The two "answer focused" lines are not redundant padding: measured against FastVLM,
// study screens came back as invented words ("code", "tech", "photonsynthesis") rather
// than "focused". Those fail safe but count as unreadable, which would leave an honest
// student uncredited — so the prompt maps the observed failure words onto focused.
export const CATEGORY_PROMPT = [
  "This is a screenshot of a student's screen.",
  'Which ONE of these words best describes it?',
  [...[FOCUSED], ...DISTRACTION_REASONS].join(', '),
  'Use focused for coursework, docs, code, notes, research, or academic reading and writing.',
  'If the screen shows code, an editor, a terminal, documentation, a paper, an article,',
  'a reference page, notes or research, answer focused.',
  'Your answer must be copied exactly from that list of words.',
  'Reply with only that one word.',
].join('\n');

export const SUMMARY_PROMPT = 'Describe in one sentence what is on this screen.';
export const JUSTIFICATION_PROMPT =
  'In one sentence, explain why this screen is not academic studying.';

export const CATEGORY_MAX_TOKENS = 10;
export const PROSE_MAX_TOKENS = 64;

// Returns the single allowed category named by `text`, or null when the answer names
// none or more than one. Null means "no observation" — the caller must treat it as an
// unparsed verdict rather than coercing it into a distraction.
export function parseCategory(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const lower = text.toLowerCase();
  // Hyphens count as word characters here so "mother" never matches "other" and
  // "unfocused" never matches "focused".
  const named = [...ALLOWED].filter((c) => new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(lower));
  return named.length === 1 ? named[0] : null;
}

// Builds the verdict from a category plus the two prose answers. A null category is a
// missing sample, so it degrades to the unparsed verdict and cannot earn credit.
export function buildVerdict(category, summary = '', justification = '') {
  if (!category) return emptyVerdict();
  const distracted = category !== FOCUSED;
  return {
    distracted,
    reason: category,
    summary: distracted ? String(summary).trim() : '',
    justification: distracted ? String(justification).trim() : '',
    parsed: true,
  };
}

function extractJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseVerdict(text) {
  const obj = extractJson(text);
  if (!obj || typeof obj.category !== 'string' || !ALLOWED.has(obj.category)) {
    return emptyVerdict();
  }
  const distracted = obj.category !== FOCUSED;
  return {
    distracted,
    reason: obj.category,
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    justification: typeof obj.justification === 'string' ? obj.justification : '',
    parsed: true,
  };
}
