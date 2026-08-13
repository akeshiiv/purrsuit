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

test('every seeded home slot is land with adjacent regular land', () => {
  const cells = generateSeasonCells({
    realmId: 7,
    seasonNumber: 1,
    maxPlayers: 10,
    mapPreset: 'archipelago',
  });
  const slots = homeSlotsForSeason({ realmId: 7, seasonNumber: 1, maxPlayers: 10 });

  assert.equal(slots.length, 10);
  for (const slot of slots) {
    const cell = byCoord(cells, slot.x, slot.y);
    assert.equal(cell.type, 'regular', `slot at ${slot.x},${slot.y} must be habitable land`);
    assert.ok(
      neighbours(cell, cells).some((candidate) => candidate.type === 'regular'),
      `slot at ${slot.x},${slot.y} should touch regular land`,
    );
  }
});

// A slot only becomes a home when a player takes it. Pre-marking all of them
// left every unclaimed slot as an unowned 'home', which attack() refuses — so
// they were cells nobody could ever claim for the whole season.
test('generation marks no cell as home before a player takes a slot', () => {
  for (const mapPreset of ['open_plains', 'crossroads', 'archipelago']) {
    const cells = generateSeasonCells({
      realmId: 7, seasonNumber: 1, maxPlayers: 10, mapPreset,
    });
    assert.equal(
      cells.filter((cell) => cell.type === 'home').length,
      0,
      `${mapPreset} should seed no pre-owned home cells`,
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

test('crossroads preset creates a water plus with a bridge on each arm', () => {
  const cells = crossroads(8);
  const bridges = new Set([2, 5]); // size/4 and size-1-size/4

  for (let i = 0; i < 8; i += 1) {
    const expectVertical = bridges.has(i) ? 'regular' : 'water';
    const expectHorizontal = bridges.has(i) ? 'regular' : 'water';
    assert.equal(byCoord(cells, 4, i).type, expectVertical, `(4,${i}) on the vertical arm`);
    assert.equal(byCoord(cells, i, 4).type, expectHorizontal, `(${i},4) on the horizontal arm`);
  }
  assert.equal(byCoord(cells, 4, 4).type, 'water', 'the centre stays water');
  assert.equal(byCoord(cells, 0, 0).type, 'regular');
});

test('archipelago preset creates a water ring with a channel through each side', () => {
  const cells = archipelago(8);
  const channel = 3; // floor((inset + far) / 2) for inset 2, far 5

  for (let i = 2; i <= 5; i += 1) {
    const expected = i === channel ? 'regular' : 'water';
    assert.equal(byCoord(cells, i, 2).type, expected, `(${i},2) on the top edge`);
    assert.equal(byCoord(cells, i, 5).type, expected, `(${i},5) on the bottom edge`);
    assert.equal(byCoord(cells, 2, i).type, expected, `(2,${i}) on the left edge`);
    assert.equal(byCoord(cells, 5, i).type, expected, `(5,${i}) on the right edge`);
  }
  assert.equal(byCoord(cells, 3, 3).type, 'regular');
  assert.equal(byCoord(cells, 1, 1).type, 'regular');
});

// The invariant the presets exist to satisfy, and the one that was broken: water
// is impassable (attack() takes only 'regular' cells, and only next to one you
// already own), so any land cut off by water is land no player can ever reach.
// An unbroken crossroads sealed the board into four quadrants — PvP was
// structurally impossible — and an unbroken archipelago ring stranded up to 36
// cells. Assert reachability directly rather than trusting the drawing.
test('every preset leaves all land in one connected component', () => {
  for (const mapPreset of ['open_plains', 'crossroads', 'archipelago']) {
    for (const maxPlayers of [2, 4, 5, 7, 8, 10]) {
      const cells = generateSeasonCells({
        realmId: 3, seasonNumber: 2, maxPlayers, mapPreset,
      });
      const land = new Map(
        cells.filter((cell) => cell.type !== 'water').map((cell) => [`${cell.x},${cell.y}`, cell]),
      );
      const [start] = land.keys();
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        const [x, y] = queue.pop().split(',').map(Number);
        for (const key of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
          if (land.has(key) && !seen.has(key)) {
            seen.add(key);
            queue.push(key);
          }
        }
      }
      assert.equal(
        seen.size,
        land.size,
        `${mapPreset} at ${maxPlayers} players strands ${land.size - seen.size} of ${land.size} land cells`,
      );
    }
  }
});
