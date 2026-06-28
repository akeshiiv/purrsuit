import test from 'node:test';
import assert from 'node:assert/strict';
import { archipelago, crossroads, openPlains } from './presets.js';
import {
  generateSeasonCells,
  homeSlotsForSeason,
  mapSizeForPlayerCount,
} from './generate.js';

function byCoord(cells, x, y) {
  return cells.find((cell) => cell.x === x && cell.y === y);
}

function neighbours(cell, cells) {
  return cells.filter((candidate) => (
    Math.abs(candidate.x - cell.x) + Math.abs(candidate.y - cell.y) === 1
  ));
}

test('generates deterministic maps for the same realm and season seed', () => {
  const first = generateSeasonCells({
    realmId: 42,
    seasonNumber: 3,
    maxPlayers: 6,
    mapPreset: 'crossroads',
  });
  const second = generateSeasonCells({
    realmId: 42,
    seasonNumber: 3,
    maxPlayers: 6,
    mapPreset: 'crossroads',
  });

  assert.deepEqual(second, first);
});

test('uses the documented map-size buckets by max player count', () => {
  assert.equal(mapSizeForPlayerCount(2), 8);
  assert.equal(mapSizeForPlayerCount(4), 8);
  assert.equal(mapSizeForPlayerCount(5), 12);
  assert.equal(mapSizeForPlayerCount(7), 12);
  assert.equal(mapSizeForPlayerCount(8), 16);
  assert.equal(mapSizeForPlayerCount(10), 16);
});

test('places one land home per maximum player with adjacent regular land', () => {
  const cells = generateSeasonCells({
    realmId: 7,
    seasonNumber: 1,
    maxPlayers: 10,
    mapPreset: 'archipelago',
  });
  const homes = cells.filter((cell) => cell.type === 'home');

  assert.equal(homes.length, 10);
  for (const home of homes) {
    assert.notEqual(home.type, 'water');
    assert.ok(
      neighbours(home, cells).some((cell) => cell.type === 'regular'),
      `home at ${home.x},${home.y} should touch regular land`,
    );
  }
});

test('home slot ordering is deterministic for realm joins', () => {
  const first = homeSlotsForSeason({ realmId: 7, seasonNumber: 1, maxPlayers: 4 });
  const second = homeSlotsForSeason({ realmId: 7, seasonNumber: 1, maxPlayers: 4 });

  assert.deepEqual(second, first);
  assert.equal(first.length, 4);
});

test('open_plains preset creates only regular land', () => {
  const cells = openPlains(8);

  assert.equal(cells.length, 64);
  assert.ok(cells.every((cell) => cell.type === 'regular'));
});

test('crossroads preset creates a water plus through the middle', () => {
  const cells = crossroads(8);

  for (let i = 0; i < 8; i += 1) {
    assert.equal(byCoord(cells, 4, i).type, 'water');
    assert.equal(byCoord(cells, i, 4).type, 'water');
  }
  assert.equal(byCoord(cells, 0, 0).type, 'regular');
});

test('archipelago preset creates a water ring', () => {
  const cells = archipelago(8);

  for (let i = 2; i <= 5; i += 1) {
    assert.equal(byCoord(cells, i, 2).type, 'water');
    assert.equal(byCoord(cells, i, 5).type, 'water');
    assert.equal(byCoord(cells, 2, i).type, 'water');
    assert.equal(byCoord(cells, 5, i).type, 'water');
  }
  assert.equal(byCoord(cells, 3, 3).type, 'regular');
  assert.equal(byCoord(cells, 1, 1).type, 'regular');
});
