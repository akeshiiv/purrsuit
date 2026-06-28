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

The map and leaderboard are kept current by polling (no websockets). Each active season carries an integer `stateVersion` that increments on every state mutation. Poll endpoints accept `?since=<version>`:

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
  "realm": RealmSummary | null }

// RealmSummary
{ "id": 7, "name": "Study Squad", "joinCode": "W7F6G7", "role": "admin",
  "mapPreset": "open_plains", "maxPlayers": 4, "mapSize": 8, "antiCheatEnabled": false }

// Season
{ "id": 12, "status": "active", "endsAt": "2026-07-05T00:00:00Z",
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
  "battlesWon": 12, "secondsStudied": 126000, "cellsA": 30, "cellsB": 20, "cellsC": 17 }
```

---

## Profile

### `GET /api/profile`
The current user's profile and their realm summary (or `null`).

**Response 200**
```json
{ "id": 1, "name": "Tung Tung", "email": "triplet@gmail.com",
  "avatarUrl": "https://…/photo.jpg", "colour": "#3b82f6", "realm": null }
```

### `PATCH /api/profile`
Edit display name, avatar, and personal colour (used to colour owned cells).

**Request**
```json
{ "name": "Tung Tung Sahur", "avatarUrl": "https://…/new.jpg", "colour": "#a855f7" }
```
All fields optional; send only what changes.

**Response 200** — the updated `Profile`.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_NAME` | name not 1–32 characters |
| 400 | `INVALID_COLOUR` | colour not `#rrggbb` |
| 400 | `INVALID_AVATAR` | avatarUrl not an http(s) URL |

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

### `GET /api/realms/current`  *(poll 3–5 s)*
Everything the realm dashboard needs. If the user is in no realm, returns `{ "realm": null }` with status 200.

**Response 200**
```json
{
  "realm": { "...": "RealmSummary" },
  "season": { "...": "Season" },
  "me": { "...": "Member", "actions": { "canStudy": true, "canBuy": false, "mustBuy": false, "canDeploy": true } },
  "members": [ { "...": "Member (public fields only for others)" } ],
  "miniLeaderboard": [ { "...": "LeaderboardRow" } ]
}
```

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

---

## Study

### `POST /api/study/complete`
Credit coins for a fully completed study session. The client calls this **only** when the focus countdown naturally reaches zero — cancelling forfeits the reward and must not call this.

**Request**
```json
{ "durationMinutes": 25 }
```
`durationMinutes` 5–120.

**Response 200**
```json
{ "coins": 167, "secondsStudied": 3600,
  "actions": { "canStudy": false, "canBuy": true, "mustBuy": true, "canDeploy": false } }
```
Award = `durationMinutes × 4`, applied atomically to the member's balance and study stats.

| Status | Code | When |
|---|---|---|
| 409 | `NOT_IN_ACTIVE_SEASON` | user is not in a realm with an active season |
| 400 | `INVALID_DURATION` | durationMinutes not an integer in 5–120 |

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

### `GET /api/realm/season-status`
Whether the season has ended and whether this player still needs to see the end screen.

**Response 200**
```json
{ "status": "ended", "endsAt": "2026-07-05T00:00:00Z", "winnerName": "player1", "needsAck": true }
```
`needsAck` is true when the season has ended and this player has not yet dismissed the victory/defeat screen.

### `POST /api/realm/season-ack`
Mark the just-ended season's end screen as seen (idempotent). After acking, the client routes the player back to realm selection.

**Response 200** — `{ "ok": true }`.
