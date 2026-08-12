# Purrsuit API Contract

Single source of truth for the REST API. The backend **implements** these endpoints; the temporary frontend and its in-repo mock (`frontend/src/services/mock/`) **conform** to them. Change this document first, then update the backend and the mock together.

All game logic is server-authoritative: coin awards, purchases, attack/defend resolution, and season rollover are computed and validated on the server. The client sends intent only.

---

## Conventions

- **Base path:** every endpoint is under `/api` and returns JSON.
- **Auth:** unless marked *public*, a request must carry the JWT in the httpOnly `token` cookie (set at Google OAuth login). Missing/invalid → `401 UNAUTHENTICATED`.
- **CSRF:** mutating requests (`POST`, `PATCH`) must send the CSRF token in the `x-csrf-token` header. The frontend `apiFetch` wrapper already does this. Missing/invalid → `403 CSRF_INVALID`.
- **Error envelope:** every failure returns

  ```json
  { "error": "MACHINE_CODE", "message": "Human readable explanation" }
  ```

  with an appropriate HTTP status. Each endpoint below lists its `error` codes.
- **`actions` object:** many responses embed server-computed UI gates so the temporary UI never decides rules itself:

  ```json
  { "canStudy": true, "canBuy": false, "mustBuy": false, "canDeploy": true }
  ```

  - `canBuy` / `mustBuy` = `coins >= 100 && totalUnits < 6`
  - `canStudy` = `coins < 100`
  - `canDeploy` = `totalUnits >= 1`

## Polling & `state_version`

The map and leaderboard are kept current by polling (no websockets). Each active season carries an integer `stateVersion` that increments on every state mutation. A rollover carries the counter forward — the new season resumes from the ended season's value rather than restarting — so a client's cached `since` can never accidentally match a *different* season's version and miss the reset board. Poll endpoints accept `?since=<version>`:

- If `since === stateVersion`, the response is the cheap short-circuit `{ "version": N, "changed": false }`.
- Otherwise the full payload is returned with `"changed": true` and the current `version`.

Suggested intervals: map 2–3 s, leaderboard & dashboard 3–5 s. Clients should pause polling while the tab is hidden.

---

## Schemas

Referenced by the endpoints below.

- **Unit types:** `"A"` (MasterGooner), `"B"` (AlphaSigma67), `"C"` (Mr.Chonk). Rock-paper-scissors: **A beats B, B beats C, C beats A.** Each unit costs **100 coins**. Inventory holds at most **6** units total.
- **Economy:** coins earned = studied minutes × 4 (5 min → 20, 25 min → 100, 120 min → 480).

```jsonc
// Profile
{ "id": 1, "name": "Tung Tung", "email": "triplet@gmail.com",
  "avatarUrl": "https://…/photo.jpg", "colour": "#3b82f6",
  "timeZone": "Asia/Singapore" | null,   // IANA zone; null = never told us
  "realm": RealmSummary | null }

// RealmSummary
{ "id": 7, "name": "Study Squad", "joinCode": "W7F6G7", "role": "admin",
  "mapPreset": "open_plains", "maxPlayers": 4, "mapSize": 8, "antiCheatEnabled": false,
  "seasonLengthDays": 7 }

// Season
{ "id": 42, "seasonNumber": 12, "status": "active",
  "startedAt": "2026-06-28T00:00:00Z", "endsAt": "2026-07-05T00:00:00Z",
  "stateVersion": 134, "winnerName": null }

// Member  (coins/units present ONLY for the requesting user; others' inventories are private)
{ "id": 3, "userId": 1, "name": "Tung Tung", "colour": "#3b82f6", "role": "admin",
  "coins": 67, "units": { "a": 2, "b": 0, "c": 1 }, "secondsStudied": 2100, "battlesWon": 12 }

// Cell
{ "x": 4, "y": 2, "type": "regular", "ownerMemberId": 3, "colour": "#3b82f6",
  "unitType": "A", "troopCount": 5 }
// type ∈ "regular" | "obstacle" | "water" | "home"; neutral → ownerMemberId/colour/unitType null, troopCount 0

// LeaderboardRow
{ "userId": 1, "name": "player1", "colour": "#3b82f6", "territories": 67,
  "battlesWon": 12, "secondsStudied": 126000, "cellsA": 30, "cellsB": 20, "cellsC": 17,
  "streakCurrent": 4, "streakLongest": 11 }

// DailyQuest  (embedded in GET /api/realms/current; null when today's quest is done)
{ "key": "buy_all_three", "title": "Cat Collector",
  "description": "Purchase all 3 cat unit types today",
  "reward": 100,
  "progress": { "current": 2, "target": 3 },   // null for instant quests
  "questDate": "2026-07-14" }
```

```jsonc
// StudyStats  (GET /api/study/stats)
{ "streak": { "current": 5, "longest": 12 },
  "allTime": StatBlock,
  "season": StatBlock | null,
  "last7Days": [ { "date": "2026-07-08", "minutes": 45 }, "…7 entries, oldest → newest" ] }

// StatBlock
{ "totalSeconds": 126000, "sessionCount": 42, "totalCoins": 8400,
  "avgSessionSeconds": 3000, "activeDays": 18, "avgSecondsPerActiveDay": 7000 }
```

**`Season.id` vs `Season.seasonNumber`.** `id` is the global `seasons` row id; `seasonNumber` is the realm's own 1-based counter and is what the UI means by "season 12". They coincide only while a single realm exists, so anything user-facing reads `seasonNumber`.

**`Season.startedAt`** (`seasons.started_at`) with **`RealmSummary.seasonLengthDays`** (`realms.season_length_days`, the 7–366 chosen at creation) is what lets a client render "day 4 of 7". The convention is that the first day of a season is **day 1**, i.e. `floor((now − startedAt) / 24h) + 1`, clamped into `1…seasonLengthDays`.

**`Profile.timeZone`** is the player's IANA time zone as last reported by their browser, and it is what every *server-side* per-player day boundary is resolved in. `null` means the player has never synced one — nothing backfills it — and every read site coalesces `null` to `UTC`. It is deliberately nullable rather than defaulting to `"UTC"`, so "we were never told" stays distinguishable from "genuinely in UTC". The client keeps it current: after login it compares `Intl.DateTimeFormat().resolvedOptions().timeZone` against the stored value and `PATCH`es only on a difference, at most once per session, silently.

**`LeaderboardRow.streakCurrent` / `streakLongest`** are the member's study streak in days, counted in **that member's own local days** — their stored `timeZone`, not the viewer's and not UTC. Each row therefore means the same thing to everyone looking at the board (it does not change value depending on who is reading it) *and* it agrees with what that player sees on their own Stats page. "Today" is per member too: a run that ended yesterday-in-Tokyo is not the same run as yesterday-in-Chicago. A member whose `timeZone` is still `null` is counted in `UTC`; a member with no sessions is `0` / `0`. Both fields appear on every row, including the snapshot rows returned by `GET /api/realm/season-status`.

---

## Profile

### `GET /api/profile`
The current user's profile and their realm summary (or `null`).

**Response 200**
```json
{ "id": 1, "name": "Tung Tung", "email": "triplet@gmail.com",
  "avatarUrl": "https://…/photo.jpg", "colour": "#3b82f6",
  "timeZone": "Asia/Singapore", "realm": null }
```

### `PATCH /api/profile`
Edit display name, avatar, personal colour (used to colour owned cells), and stored time zone.

**Request**
```json
{ "name": "Tung Tung Sahur", "avatarUrl": "https://…/new.jpg", "colour": "#a855f7",
  "timeZone": "Asia/Singapore" }
```
All fields optional and independent; send only what changes. Omitting `timeZone` leaves the stored zone untouched.

`timeZone` must be a real IANA zone name — one `Intl.DateTimeFormat` accepts. Unlike the tolerant read path (an unknown *stored* zone reads as `UTC`), an explicit write is **rejected** rather than quietly falling back: a typo'd zone would otherwise be accepted and silently re-count the player's streak in the wrong calendar. `null` is not a valid write, so a synced zone cannot be cleared back to "never told us".

The client sends this on its own, once per session after login, whenever the browser's zone differs from the stored one — see `Profile.timeZone` above. A user editing their profile never has to think about it.

**Response 200** — the updated `Profile`.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_NAME` | name not 1–32 characters |
| 400 | `INVALID_COLOUR` | colour not `#rrggbb` |
| 400 | `INVALID_AVATAR` | avatarUrl not an http(s) URL |
| 400 | `INVALID_TIMEZONE` | timeZone not a valid IANA zone |

---

## Realms

### `POST /api/realms`
Create a realm; the creator becomes admin and is placed at a home base in a freshly generated season-1 map.

**Request**
```json
{ "name": "Study Squad", "mapPreset": "open_plains",
  "maxPlayers": 4, "seasonLengthDays": 7, "antiCheat": false }
```
`mapPreset ∈ "open_plains" | "crossroads" | "archipelago"`; `maxPlayers` 2–10; `seasonLengthDays` 7–366.

**Response 201**
```json
{ "realm": { "...": "RealmSummary" }, "joinCode": "W7F6G7", "season": { "...": "Season" } }
```

| Status | Code | When |
|---|---|---|
| 409 | `ALREADY_IN_REALM` | user is already a member of a realm |
| 400 | `INVALID_REALM_SETTINGS` | a setting is out of range |

### `POST /api/realms/join`
Join an existing realm by its 6-character code.

**Request**
```json
{ "joinCode": "W7F6G7" }
```

**Response 200**
```json
{ "realm": { "...": "RealmSummary" }, "season": { "...": "Season" } }
```

| Status | Code | When |
|---|---|---|
| 404 | `REALM_NOT_FOUND` | no realm with that code |
| 409 | `ALREADY_IN_REALM` | user is already in a realm |
| 409 | `REALM_FULL` | member count == maxPlayers |
| 409 | `SEASON_ENDED` | the realm's current season has ended |

A season whose `endsAt` has passed is rolled over as part of the join, so the new member lands on the season that replaces it. `SEASON_ENDED` is returned only when the realm is genuinely between seasons.

### `GET /api/realms/current`  *(poll 3–5 s)*
Everything the realm dashboard needs. If the user is in no realm, returns `{ "realm": null }` with status 200.

**Response 200**
```json
{
  "realm": { "...": "RealmSummary" },
  "season": { "...": "Season" },
  "me": { "...": "Member", "actions": { "canStudy": true, "canBuy": false, "mustBuy": false, "canDeploy": true } },
  "members": [ { "...": "Member (public fields only for others)" } ],
  "miniLeaderboard": [ { "...": "LeaderboardRow" } ],
  "dailyQuest": { "...": "DailyQuest" }
}
```

`dailyQuest` is the player's quest for the current SGT day (a `DailyQuest`), or `null` once today's quest is completed (the dashboard card removes itself). Assignment is lazy: the first read on a new SGT day assigns a fresh random quest. Completing a quest awards **100 coins** to the member's season balance.

### `POST /api/realms/leave`
Leave the current realm. Forfeits all owned territory for the season. If the admin leaves, the earliest-joined member is promoted; if the last member leaves, the realm is deleted.

**Response 200** — `{ "ok": true }`.

### `POST /api/realms/:id/kick`
Admin removes a member; their territory is released.

**Request** — `{ "userId": 9 }`

**Response 200** — `{ "ok": true }`.

| Status | Code | When |
|---|---|---|
| 403 | `NOT_ADMIN` | caller is not the realm admin |
| 400 | `CANNOT_KICK_SELF` | userId is the caller |
| 404 | `MEMBER_NOT_FOUND` | userId is not a member |

### `POST /api/realms/:id/end-season`
Admin ends the season immediately; the player in the lead becomes the winner and a rollover into a fresh season occurs.

**Response 200** — `{ "season": { "...": "Season", "status": "ended", "winnerName": "player1" } }`.

| Status | Code | When |
|---|---|---|
| 403 | `NOT_ADMIN` | caller is not the realm admin |

### `PATCH /api/realms/:id/settings`
Admin toggles anti-cheat. *(Anti-cheat behaviour is a deferred extension; this stores the flag only.)*

**Request** — `{ "antiCheat": true }`

**Response 200** — `{ "realm": { "...": "RealmSummary" } }`.

| Status | Code | When |
|---|---|---|
| 403 | `NOT_ADMIN` | caller is not the realm admin |
| 400 | `INVALID_REALM_SETTINGS` | `antiCheat` is absent or not a JSON boolean |

`antiCheat` must be a real boolean — `true`/`false`, not `"true"`/`"false"`, and never omitted. It is a security setting, so a request that does not state it is rejected rather than read as "off".

---

## Study

Study sessions are **server-owned**. The client opens one before the countdown
starts and claims it after: the reward is settled against the server's own row
and clock, so a duration reported by the client buys nothing on its own.

### `POST /api/study/start`
Open a session and start the server-side clock. Call this as the focus countdown
begins; the `sessionKey` it returns is the only handle to the session.

**Request**
```json
{ "durationMinutes": 25 }
```
`durationMinutes` 5–120.

**Response 200**
```json
{ "sessionKey": "3f1c9d2e-4b7a-4c11-9d38-6a2e5c7b8091", "durationMinutes": 25,
  "startedAt": "2026-07-31T10:00:00.000Z",
  "eligibleAt": "2026-07-31T10:24:00.000Z",
  "expiresAt":  "2026-07-31T10:39:00.000Z" }
```
- `eligibleAt` = `startedAt` + duration − 60 s of grace (client clock skew and
  countdown rounding). Claiming before it fails.
- `expiresAt` = `eligibleAt` + a 15-minute claim window. Claiming after it fails.

A user has **one** live session at a time: starting a session abandons whatever
was still pending, so overlapping timers cannot be stacked and claimed together.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_DURATION` | durationMinutes not an integer in 5–120 |
| 409 | `NOT_IN_ACTIVE_SEASON` | user is not in a realm with an active season |

### `POST /api/study/complete`
Claim a session opened by `/api/study/start`. Cancelling forfeits the reward, but
that is now enforced rather than assumed: the server checks that its own clock
has advanced past `eligibleAt`, that the session was never terminated, and that
it has not already been paid.

**Request**
```json
{ "sessionKey": "3f1c9d2e-4b7a-4c11-9d38-6a2e5c7b8091" }
```
`durationMinutes` is **not** read from the request — the award comes from the
duration recorded when the session was opened.

**Response 200**
```json
{ "coins": 167, "secondsStudied": 3600,
  "actions": { "canStudy": false, "canBuy": true, "mustBuy": true, "canDeploy": false } }
```
Award = stored `durationMinutes × 4`, applied atomically to the member's balance
and study stats.

**Optional `alreadyCredited: true`** — present only when the session had already
been claimed. Retrying a request whose response was lost is safe: it returns the
balance the first claim banked and credits nothing further. Absent on a first
claim, so branch on its presence.

**Optional `questCompleted`** — present only when this action completed the day's quest: `{ "key": "study_exact_67", "title": "Precision Focus", "reward": 100 }`. When present on `/study/complete` and `/shop/buy`, the response `coins` and `actions` already include the +100 bonus. Never present on an `alreadyCredited` replay.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_SESSION` | sessionKey missing or not a uuid |
| 409 | `STALE_CLIENT` | body carries the pre-session `durationMinutes` shape — the tab predates this deploy and must be reloaded |
| 404 | `SESSION_NOT_FOUND` | no such session, or it belongs to another user |
| 409 | `SESSION_TOO_EARLY` | claimed before `eligibleAt` — the time was not actually spent |
| 409 | `SESSION_EXPIRED` | claimed after `expiresAt` |
| 409 | `SESSION_NOT_CLAIMABLE` | session was terminated, or abandoned by a later start |
| 409 | `NOT_IN_ACTIVE_SEASON` | user is not in a realm with an active season |
| 400 | `INVALID_DURATION` | stored duration is outside 5–120 (should be impossible) |

### `POST /api/study/terminate`
Log a session ended by distraction and close it. Fire-and-forget: an unknown or
already-closed `sessionKey` still logs.

**Request**
```json
{ "sessionKey": "3f1c9d2e-4b7a-4c11-9d38-6a2e5c7b8091", "reason": "social-media",
  "summary": "...", "justification": "..." }
```
- `sessionKey` optional. When it names a pending session owned by the caller,
  that session is marked terminated — it can never be completed afterwards — and
  the attempted duration is taken from the row.
- `durationMinutes` (5–120) still accepted, and still required when no
  `sessionKey` is sent.
- `reason` one of `social-media`, `entertainment`, `chat-nonacademic`, `gaming`,
  `shopping`, `other`. `summary`/`justification` optional, capped at 2000 chars.

**Response 200** — `{ "logged": true }`

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_DURATION` | durationMinutes sent, or required, and not an integer in 5–120 |
| 400 | `INVALID_REASON` | unknown distraction reason |

### `GET /api/study/stats?tz=<IANA>`
Aggregated study statistics for the current user, over two fixed scopes.

- `tz` (optional): IANA time zone (e.g. `America/Los_Angeles`) used to bucket
  sessions into local calendar days for the streak and per-day metrics. Missing
  or invalid → `UTC`. The frontend sends `Intl.DateTimeFormat().resolvedOptions().timeZone`.

This endpoint takes the zone from the request rather than reading the caller's stored `Profile.timeZone`, and the two can legitimately disagree for a moment: the live browser value is the more current one for the player's *own* page, while the stored copy exists so that *other* people's leaderboard rows can be counted in that player's calendar. The stored copy catches up on the next login sync.

Read-only: no side effects (does not roll seasons over).

**Response 200** — `StudyStats`
```json
{ "streak": { "current": 5, "longest": 12 },
  "allTime": { "totalSeconds": 126000, "sessionCount": 42, "totalCoins": 8400,
               "avgSessionSeconds": 3000, "activeDays": 18, "avgSecondsPerActiveDay": 7000 },
  "season":  { "totalSeconds": 9000, "sessionCount": 3, "totalCoins": 600,
               "avgSessionSeconds": 3000, "activeDays": 2, "avgSecondsPerActiveDay": 4500 },
  "last7Days": [ { "date": "2026-07-08", "minutes": 45 },
                 { "date": "2026-07-09", "minutes": 30 },
                 { "date": "2026-07-10", "minutes": 0 },
                 { "date": "2026-07-11", "minutes": 90 },
                 { "date": "2026-07-12", "minutes": 25 },
                 { "date": "2026-07-13", "minutes": 50 },
                 { "date": "2026-07-14", "minutes": 65 } ] }
```

- `allTime` covers every session the user ever logged (all realms/seasons).
- `season` covers only the user's current active season; `null` when the user is
  not in a realm with an active season.
- `streak` is global/lifetime (survives season resets); `current` stays alive
  while the last study day is today or yesterday.
- `last7Days` is **exactly 7 entries, oldest first**, index 6 being today in
  `tz` — never sparse and never short. A day with no sessions is present with
  `minutes: 0`, so the chart can draw the gap instead of shifting the bars.
  `minutes` is whole minutes, `Math.round`ed from the summed session seconds,
  and `date` is the local calendar date in the same `tz` used for `streak` and
  `activeDays`, so the client labels bars from the dates rather than counting
  offsets off its own clock. Scope is all-time sessions (the last 7 calendar
  days regardless of season), on both positions of the screen's scope toggle.

---

## Shop & Inventory

### `POST /api/shop/buy`
Buy one Cat Unit for 100 coins. Atomic and guarded by both funds and the 6-unit cap.

**Request** — `{ "unitType": "A" }`

**Response 200**
```json
{ "coins": 67, "units": { "a": 3, "b": 0, "c": 1 },
  "actions": { "canStudy": true, "canBuy": false, "mustBuy": false, "canDeploy": true } }
```

**Optional `questCompleted`** — present only when this action completed the day's quest: `{ "key": "study_exact_67", "title": "Precision Focus", "reward": 100 }`. When present on `/study/complete` and `/shop/buy`, the response `coins` and `actions` already include the +100 bonus.

| Status | Code | When |
|---|---|---|
| 409 | `INSUFFICIENT_FUNDS` | balance < 100 |
| 409 | `INVENTORY_FULL` | total units already == 6 |
| 400 | `INVALID_UNIT_TYPE` | unitType not A/B/C |

### `GET /api/shop/inventory`
Current balance and held units.

**Response 200**
```json
{ "coins": 67, "units": { "a": 2, "b": 0, "c": 1 }, "total": 3,
  "actions": { "canStudy": true, "canBuy": false, "mustBuy": false, "canDeploy": true } }
```

---

## Map & Territory

### `GET /api/realm/map?since=<v>`  *(poll 2–3 s)*
The current season's grid.

**Response 200 — unchanged**
```json
{ "version": 134, "changed": false }
```

**Response 200 — changed**
```json
{
  "version": 135, "changed": true, "size": 8,
  "cells": [ { "...": "Cell" } ],
  "members": [ { "id": 3, "name": "player1", "colour": "#3b82f6" } ],
  "me": { "...": "Member", "actions": { "...": "actions" } }
}
```

### `POST /api/realm/attack`
Deploy units from inventory to a neutral or enemy cell adjacent to a cell you own. Resolved server-side in a transaction with a row lock on the target cell.

**Request**
```json
{ "x": 4, "y": 2, "unitType": "A", "quantity": 3 }
```

**Resolution**
- Target must be a `regular` cell, adjacent (4-neighbour) to a cell the attacker owns (home counts as owned), and the attacker must hold `quantity` of `unitType`.
- **Neutral target** → claimed: owner = attacker, `unitType` set, `troopCount = quantity`.
- **Enemy target** → **captured** iff `quantity >= defender.troopCount` **AND** `unitType` beats the defender's `unitType` (RPS). On capture: owner flips, `troopCount = max(1, quantity − defender.troopCount)`, attacker `battlesWon += 1`. Otherwise **repelled**: defender `troopCount = max(1, troopCount − quantity)`.
- Units (`quantity`) are consumed from inventory in all cases.

**Response 200**
```json
{ "ok": true, "result": "captured", "cell": { "...": "Cell" }, "units": { "a": 0, "b": 0, "c": 1 } }
```
`result ∈ "claimed" | "captured" | "repelled"`.

**Optional `questCompleted`** — present only when this action completed the day's quest: `{ "key": "study_exact_67", "title": "Precision Focus", "reward": 100 }`. When present on `/study/complete` and `/shop/buy`, the response `coins` and `actions` already include the +100 bonus.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_TARGET` | target is not a regular cell |
| 400 | `NOT_ADJACENT` | no owned cell adjacent to target |
| 409 | `INSUFFICIENT_UNITS` | inventory lacks `quantity` of `unitType` |

### `POST /api/realm/defend`
Reinforce a cell you own by one troop, consuming one matching unit.

**Request** — `{ "x": 4, "y": 2, "unitType": "A" }`

**Response 200**
```json
{ "ok": true, "cell": { "...": "Cell", "troopCount": 6 }, "units": { "a": 1, "b": 0, "c": 1 } }
```

**Optional `questCompleted`** — present only when this action completed the day's quest: `{ "key": "study_exact_67", "title": "Precision Focus", "reward": 100 }`. When present on `/study/complete` and `/shop/buy`, the response `coins` and `actions` already include the +100 bonus.

| Status | Code | When |
|---|---|---|
| 403 | `NOT_OWNER` | the cell is not owned by the caller |
| 400 | `UNIT_TYPE_MISMATCH` | unitType ≠ the cell's garrison unitType |
| 409 | `INSUFFICIENT_UNITS` | inventory has none of that unit |

---

## Leaderboard & Season

### `GET /api/realm/leaderboard?since=<v>`  *(poll 3–5 s)*
Full standings for the current season, sorted by territories held (descending).

**Response 200**
```json
{ "version": 135, "rows": [ { "...": "LeaderboardRow" } ], "season": { "...": "Season" } }
```

Each row carries that player's `streakCurrent` / `streakLongest` (see LeaderboardRow above), so the standings screen can reduce its "Longest streak" award straight out of the rows it already polls. Each row's streak is counted in **that player's own local days** (their stored `timeZone`), never the viewer's — so the board reads identically to everyone and matches each player's own Stats page. Territory, battles and study time stay the ordering and the table's columns.

### `GET /api/realm/season-status`
Whether the season has ended and whether this player still needs to see the end screen.

**Response 200**
```json
{ "status": "ended", "endsAt": "2026-07-05T00:00:00Z", "winnerName": "player1", "needsAck": true,
  "rows": [ { "...": "LeaderboardRow" } ] }
```
`needsAck` is true when the season has ended and this player has not yet dismissed the victory/defeat screen.

`rows` are the **final standings of the ended season**, snapshotted at rollover and ordered by rank. A rollover resets territory and the member economy immediately, so `GET /api/realm/leaderboard` already reflects the *new* season — the end screen must read its standings from here. `rows` is `[]` whenever `needsAck` is false.

### `POST /api/realm/season-ack`
Mark the just-ended season's end screen as seen (idempotent). After acking, the client routes the player back to realm selection.

**Response 200** — `{ "ok": true }`.
