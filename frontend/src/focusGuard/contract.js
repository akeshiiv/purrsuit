export const DISTRACTION_REASONS = [
  'social-media', 'entertainment', 'chat-nonacademic', 'gaming', 'shopping', 'other',
];
export const FOCUSED = 'focused';

// `parsed: false` marks "the model gave us nothing usable" as distinct from "the model
// looked and saw studying". Both are safe to continue on, but only the latter is
// evidence that monitoring actually works, so only the latter can earn credit.
export function emptyVerdict() {
  return { distracted: false, summary: '', justification: '', reason: FOCUSED, parsed: false };
}
