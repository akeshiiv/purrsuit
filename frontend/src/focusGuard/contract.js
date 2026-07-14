export const DISTRACTION_REASONS = [
  'social-media', 'entertainment', 'chat-nonacademic', 'gaming', 'shopping', 'other',
];
export const FOCUSED = 'focused';

export function emptyVerdict() {
  return { distracted: false, summary: '', justification: '', reason: FOCUSED };
}
