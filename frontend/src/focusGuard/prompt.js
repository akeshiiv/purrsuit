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
