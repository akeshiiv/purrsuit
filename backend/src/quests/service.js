import {
  sgtParts,
  QUEST_BY_KEY,
  progressView,
  chooseQuestKey,
  REWARD_COINS,
} from './rules.js';

// Lazily assign today's quest (idempotent) and return the row. `query` is the
// module `sql` on the read path or a transaction `tx` on the hook path; both
// support tagged-template calls. The INSERT ... ON CONFLICT DO NOTHING is a
// single atomic statement, so this is safe without an interactive transaction.
export async function ensureTodayQuest(query, userId, sgtDate) {
  const questKey = chooseQuestKey();
  await query`
    INSERT INTO daily_quests (user_id, quest_date, quest_key)
    VALUES (${userId}, ${sgtDate}::date, ${questKey})
    ON CONFLICT (user_id, quest_date) DO NOTHING
  `;
  const rows = await query`
    SELECT id, quest_key, progress, completed_at
    FROM daily_quests
    WHERE user_id = ${userId} AND quest_date = ${sgtDate}::date
  `;
  return rows[0];
}

// Read path: the DailyQuest payload for GET /api/realms/current, or null once
// today's quest is completed (so the dashboard card removes itself).
export async function getTodayQuest(query, userId, now = new Date()) {
  const { date } = sgtParts(now);
  const quest = await ensureTodayQuest(query, userId, date);
  if (!quest || quest.completed_at) return null;
  const def = QUEST_BY_KEY[quest.quest_key];
  if (!def) return null;
  return {
    key: def.key,
    title: def.title,
    description: def.description,
    reward: REWARD_COINS,
    progress: progressView(def, quest.progress),
    questDate: date,
  };
}

// Count this member's sessions that fall on the given SGT date. `created_at` is
// TIMESTAMPTZ (migration 012), so one conversion takes the instant straight to
// the Singapore calendar day the quest is keyed on.
async function countSessionsToday(query, memberId, sgtDate) {
  const rows = await query`
    SELECT COUNT(*)::int AS c
    FROM sessions
    WHERE realm_member_id = ${memberId}
      AND (created_at AT TIME ZONE 'Asia/Singapore')::date = ${sgtDate}::date
  `;
  return rows[0]?.c ?? 0;
}

// The territory leader as of just BEFORE this capture. We read current cell
// counts (after the attack already flipped the target) and undo that one move:
// the prior owner had +1, the attacker had -1. Ties break to the lowest member id.
async function preCaptureLeader(query, seasonId, attackerMemberId, priorOwnerMemberId) {
  const rows = await query`
    SELECT owner_member_id, COUNT(*)::int AS c
    FROM cells
    WHERE season_id = ${seasonId} AND owner_member_id IS NOT NULL
    GROUP BY owner_member_id
  `;
  const counts = new Map(rows.map((r) => [Number(r.owner_member_id), Number(r.c)]));
  if (priorOwnerMemberId != null) {
    counts.set(priorOwnerMemberId, (counts.get(priorOwnerMemberId) ?? 0) + 1);
  }
  counts.set(attackerMemberId, (counts.get(attackerMemberId) ?? 0) - 1);
  let leader = null;
  let best = -Infinity;
  for (const [memberId, c] of counts) {
    if (c > best || (c === best && (leader === null || memberId < leader))) {
      best = c;
      leader = memberId;
    }
  }
  return leader;
}

// Hook path: advance the day's quest for one event, awarding 100 coins to
// realm_members on a fresh completion. Runs inside the caller's transaction as a
// single call. Returns the completion (for the toast) and the coin delta (which
// the caller folds into any coins it reports).
export async function evaluateQuest(query, { userId, realmId, seasonId, memberId, event, data, now = new Date() }) {
  const none = { questCompleted: null, coinsAwarded: 0 };
  const { date, hour } = sgtParts(now);
  const quest = await ensureTodayQuest(query, userId, date);
  if (!quest || quest.completed_at) return none;
  const def = QUEST_BY_KEY[quest.quest_key];
  if (!def || !def.events.includes(event)) return none;

  const facts = { ...data, sgtHour: hour };
  if (def.key === 'five_sessions_today') {
    facts.sessionsToday = await countSessionsToday(query, memberId, date);
  }
  if (def.key === 'capture_leader_cell' && data.result === 'captured') {
    facts.leaderMemberId = await preCaptureLeader(query, seasonId, memberId, data.priorOwnerMemberId);
  }

  const { completed, progress } = def.evaluate({ event, data: facts, progress: quest.progress ?? {} });

  await query`
    UPDATE daily_quests SET progress = ${JSON.stringify(progress)}::jsonb WHERE id = ${quest.id}
  `;
  if (!completed) return none;

  const awarded = await query`
    UPDATE daily_quests SET completed_at = now()
    WHERE id = ${quest.id} AND completed_at IS NULL
    RETURNING id
  `;
  if (awarded.length === 0) return none; // lost the award-once race

  await query`
    UPDATE realm_members SET coins = coins + ${REWARD_COINS}
    WHERE realm_id = ${realmId} AND user_id = ${userId}
  `;
  await query`
    UPDATE seasons SET state_version = state_version + 1 WHERE id = ${seasonId}
  `;
  return { questCompleted: { key: def.key, title: def.title, reward: REWARD_COINS }, coinsAwarded: REWARD_COINS };
}
