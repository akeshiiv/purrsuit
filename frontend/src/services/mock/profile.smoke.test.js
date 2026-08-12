import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mockProfile from './profile.js';
import { state } from './state.js';

beforeEach(() => {
  state.profile.timeZone = 'America/Los_Angeles';
  state.profile.name = 'Tung Tung';
  state.profile.colour = '#3b82f6';
});

test('the seeded profile carries a timeZone that is neither UTC nor the local zone', async () => {
  const profile = await mockProfile.get();
  assert.equal(profile.timeZone, 'America/Los_Angeles');
  assert.notEqual(profile.timeZone, 'UTC');
  assert.notEqual(profile.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('update stores a valid IANA zone and returns the full Profile shape', async () => {
  const profile = await mockProfile.update({ timeZone: 'Europe/Berlin' });
  assert.equal(profile.timeZone, 'Europe/Berlin');
  assert.deepEqual(
    Object.keys(profile).sort(),
    ['avatarUrl', 'colour', 'email', 'hasOnboarded', 'id', 'name', 'realm', 'timeZone'],
  );
});

test('update rejects a bogus zone with INVALID_TIMEZONE and leaves the stored one alone', async () => {
  await assert.rejects(
    () => mockProfile.update({ timeZone: 'Mars/Olympus_Mons' }),
    error => {
      assert.equal(error.code, 'INVALID_TIMEZONE');
      assert.equal(error.status, 400);
      return true;
    },
  );
  assert.equal((await mockProfile.get()).timeZone, 'America/Los_Angeles');
});

test('update rejects a non-string zone rather than silently falling back to UTC', async () => {
  for (const bad of [null, '', 42, {}]) {
    await assert.rejects(
      () => mockProfile.update({ timeZone: bad }),
      error => error.code === 'INVALID_TIMEZONE',
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }
});

test('a patch that omits timeZone leaves the stored zone untouched', async () => {
  const profile = await mockProfile.update({ name: 'Tung Tung Sahur' });
  assert.equal(profile.name, 'Tung Tung Sahur');
  assert.equal(profile.timeZone, 'America/Los_Angeles');
});
