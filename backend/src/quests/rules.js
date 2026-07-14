import { randomInt } from 'node:crypto';

// The 100-coin bonus for finishing the day's quest.
export const REWARD_COINS = 100;

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore is UTC+8, no DST.

// Split a UTC instant into the Singapore calendar date and hour. We shift the
// epoch by +8h and then read UTC fields, which yields SGT wall-clock without
// depending on the host timezone.
export function sgtParts(now) {
  const shifted = new Date(now.getTime() + SGT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, hour: shifted.getUTCHours() };
}

// --- evaluate helpers (pure) ---
const distinctSet = (progress) => new Set(progress.types ?? []);

// The pool. `evaluate({ event, data, progress })` returns { completed, progress }
// and must be a pure function of its inputs. `data` carries the event fields
// plus any facts the service pre-fetched (sessionsToday, sgtHour, leaderMemberId).
export const QUESTS = [
  {
    key: 'study_exact_67',
    title: 'Precision Focus',
    description: 'Complete a study session exactly 67 minutes long',
    kind: 'instant',
    events: ['study.complete'],
    evaluate: ({ data, progress }) => ({ completed: data.durationMinutes === 67, progress }),
  },
  {
    key: 'capture_leader_cell',
    title: 'Regicide',
    description: "Take control of a territory belonging to the current leader",
    kind: 'instant',
    events: ['attack'],
    evaluate: ({ data, progress }) => ({
      completed: data.result === 'captured'
        && data.priorOwnerMemberId != null
        && data.priorOwnerMemberId === data.leaderMemberId,
      progress,
    }),
  },
  {
    key: 'strengthen_cell',
    title: 'Dig In',
    description: 'Strengthen troops in any one cell',
    kind: 'instant',
    events: ['defend'],
    evaluate: ({ progress }) => ({ completed: true, progress }),
  },
  {
    key: 'five_sessions_today',
    title: 'Grind Set',
    description: 'Log 5 study sessions today',
    kind: 'count',
    target: 5,
    events: ['study.complete'],
    evaluate: ({ data, progress }) => {
      const current = Number(data.sessionsToday ?? 0);
      return { completed: current >= 5, progress: { ...progress, current } };
    },
  },
  {
    key: 'study_morning',
    title: 'Early Bird',
    description: 'Complete a study session between 7–9am SGT',
    kind: 'instant',
    events: ['study.complete'],
    evaluate: ({ data, progress }) => ({ completed: data.sgtHour >= 7 && data.sgtHour < 9, progress }),
  },
  {
    key: 'buy_all_three',
    title: 'Cat Collector',
    description: 'Purchase all 3 cat unit types today',
    kind: 'set',
    target: 3,
    events: ['shop.buy'],
    evaluate: ({ data, progress }) => {
      const types = distinctSet(progress);
      if (data.unitType) types.add(data.unitType);
      const list = [...types];
      return { completed: list.length >= 3, progress: { ...progress, types: list } };
    },
  },
  {
    key: 'win_a_battle',
    title: 'First Blood',
    description: 'Win a battle (capture an enemy cell)',
    kind: 'instant',
    events: ['attack'],
    evaluate: ({ data, progress }) => ({ completed: data.result === 'captured', progress }),
  },
  {
    key: 'capture_three_today',
    title: 'Land Grab',
    description: 'Capture 3 territories today',
    kind: 'count',
    target: 3,
    events: ['attack'],
    evaluate: ({ data, progress }) => {
      const advanced = data.result === 'claimed' || data.result === 'captured';
      const current = Number(progress.current ?? 0) + (advanced ? 1 : 0);
      return { completed: current >= 3, progress: { ...progress, current } };
    },
  },
  {
    key: 'study_60_plus',
    title: 'Deep Work',
    description: 'Complete a single study session of 60 minutes or more',
    kind: 'instant',
    events: ['study.complete'],
    evaluate: ({ data, progress }) => ({ completed: Number(data.durationMinutes) >= 60, progress }),
  },
  {
    key: 'buy_three_units',
    title: 'Restock',
    description: 'Buy any 3 cat units today',
    kind: 'count',
    target: 3,
    events: ['shop.buy'],
    evaluate: ({ progress }) => {
      const current = Number(progress.current ?? 0) + 1;
      return { completed: current >= 3, progress: { ...progress, current } };
    },
  },
];

export const QUEST_BY_KEY = Object.fromEntries(QUESTS.map((q) => [q.key, q]));
export const QUEST_KEYS = QUESTS.map((q) => q.key);

// The { current, target } view for the dashboard, or null for instant quests.
export function progressView(def, progress = {}) {
  if (def.kind === 'count') {
    return { current: Number(progress.current ?? 0), target: def.target };
  }
  if (def.kind === 'set') {
    return { current: (progress.types ?? []).length, target: def.target };
  }
  return null;
}

// Pick a random quest key. randomFn(max) must return an int in [0, max).
export function chooseQuestKey(randomFn = randomInt) {
  return QUEST_KEYS[randomFn(QUEST_KEYS.length)];
}
