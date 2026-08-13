import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mockRealm from './realm.js';
import { state } from './state.js';

beforeEach(() => {
  state.realm = null;
});

const VALID = {
  name: 'Study Squad',
  mapPreset: 'open_plains',
  maxPlayers: 4,
  seasonLengthDays: 7,
  antiCheat: false,
};

// Contract parity with normalizeRealmSettings (backend/src/realms/rules.js).
// The mock used to accept anything, so RealmCreate could be built entirely
// against settings the deployed API answers with 400 INVALID_REALM_SETTINGS.
test('mock create rejects the settings the real validator rejects', async () => {
  const bad = [
    { ...VALID, name: '   ' },
    { ...VALID, name: 'x'.repeat(65) },
    { ...VALID, mapPreset: 'tundra' },
    { ...VALID, maxPlayers: 1 },
    { ...VALID, maxPlayers: 11 },
    { ...VALID, maxPlayers: 4.5 },
    { ...VALID, seasonLengthDays: 6 },
    { ...VALID, seasonLengthDays: 367 },
    { ...VALID, antiCheat: 'false' },
  ];

  for (const settings of bad) {
    await assert.rejects(
      () => mockRealm.create(settings),
      error => error.code === 'INVALID_REALM_SETTINGS' && error.status === 400,
      `should reject ${JSON.stringify(settings)}`,
    );
  }
});

test('mock create still accepts valid settings', async () => {
  const created = await mockRealm.create(VALID);
  assert.equal(created.realm.name, 'Study Squad');
});

// Boolean('false') is true, so the string form used to turn anti-cheat ON — and
// an omitted field read as a deliberate OFF, silently disarming the realm.
test('mock updateSettings demands a real boolean for antiCheat', async () => {
  await mockRealm.create(VALID);
  for (const value of ['false', 'true', 0, 1, null, undefined]) {
    await assert.rejects(
      () => mockRealm.updateSettings(state.realm.id, { antiCheat: value }),
      error => error.code === 'INVALID_REALM_SETTINGS',
      `should reject ${JSON.stringify(value)}`,
    );
  }
  const updated = await mockRealm.updateSettings(state.realm.id, { antiCheat: true });
  assert.equal(updated.realm.antiCheatEnabled, true);
});
