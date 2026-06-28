import { cellsForPreset } from './presets.js';

function hashSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(realmId, seasonNumber) {
  return hashSeed(`${realmId}:${seasonNumber}`);
}

export function mapSizeForPlayerCount(maxPlayers) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    throw new RangeError('maxPlayers must be an integer from 2 to 10');
  }
  if (maxPlayers <= 4) return 8;
  if (maxPlayers <= 7) return 12;
  return 16;
}

function interiorPerimeterSlots(size) {
  const last = size - 2;
  const slots = [];

  for (let x = 1; x <= last; x += 1) slots.push({ x, y: 1 });
  for (let y = 2; y <= last; y += 1) slots.push({ x: last, y });
  for (let x = last - 1; x >= 1; x -= 1) slots.push({ x, y: last });
  for (let y = last - 1; y >= 2; y -= 1) slots.push({ x: 1, y });

  return slots;
}

export function homeSlotsForSeason({ realmId, seasonNumber, maxPlayers }) {
  const size = mapSizeForPlayerCount(maxPlayers);
  const candidates = interiorPerimeterSlots(size);
  const random = mulberry32(seedFor(realmId, seasonNumber));
  const offset = Math.floor(random() * candidates.length);
  const step = candidates.length / maxPlayers;
  const used = new Set();
  const slots = [];

  for (let i = 0; i < maxPlayers; i += 1) {
    let index = Math.floor(offset + i * step) % candidates.length;
    while (used.has(index)) {
      index = (index + 1) % candidates.length;
    }
    used.add(index);
    slots.push({ ...candidates[index] });
  }

  return slots;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function adjacentCoords({ x, y }, size) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].filter((coord) => (
    coord.x >= 0 && coord.x < size && coord.y >= 0 && coord.y < size
  ));
}

function ensureHomeHasRegularNeighbour(cellsByKey, home, size) {
  const adjacent = adjacentCoords(home, size)
    .map((coord) => cellsByKey.get(cellKey(coord.x, coord.y)));
  if (adjacent.some((cell) => cell?.type === 'regular')) return;

  const firstNonHome = adjacent.find((cell) => cell && cell.type !== 'home');
  if (firstNonHome) {
    firstNonHome.type = 'regular';
  }
}

export function generateSeasonCells({ realmId, seasonNumber, maxPlayers, mapPreset }) {
  const size = mapSizeForPlayerCount(maxPlayers);
  const cells = cellsForPreset(mapPreset, size).map((cell) => ({ ...cell }));
  const cellsByKey = new Map(cells.map((cell) => [cellKey(cell.x, cell.y), cell]));
  const homes = homeSlotsForSeason({ realmId, seasonNumber, maxPlayers });

  for (const home of homes) {
    const cell = cellsByKey.get(cellKey(home.x, home.y));
    cell.type = 'home';
    cell.ownerMemberId = null;
    cell.unitType = null;
    cell.troopCount = 0;
  }

  for (const home of homes) {
    ensureHomeHasRegularNeighbour(cellsByKey, home, size);
  }

  return cells;
}
