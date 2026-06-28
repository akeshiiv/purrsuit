// Single source of truth for map theming + pure map logic.
// Keep this file free of React/DOM imports so `node --test` can run it.

export const PALETTE = {
  neutralLand: '#e9e1d4', // unowned land
  water: '#86c5e0',       // impassable water
  obstacle: '#3c3c44',    // impassable rock
  gridline: '#f4f1ea',    // gaps between tiles
  highlightRing: '#f59e0b', // attackable / selected cell ring
  homeRing: '#1f2937',    // emphasis ring around home cells
};

export const UNIT_META = {
  A: { label: 'MasterGooner', glyph: '😼', key: 'a' },
  B: { label: 'AlphaSigma67', glyph: '😽', key: 'b' },
  C: { label: 'Mr.Chonk', glyph: '😻', key: 'c' },
};

const BEATS = { A: 'B', B: 'C', C: 'A' };

export function beats(attacker, defender) {
  return BEATS[attacker] === defender;
}

export function cellKey(cell) {
  return `${cell.x}-${cell.y}`;
}

export function cellPalette(cell) {
  if (cell.type === 'water') return { fill: PALETTE.water, blocked: true };
  if (cell.type === 'obstacle') return { fill: PALETTE.obstacle, blocked: true };
  const owned = Boolean(cell.ownerMemberId);
  return { fill: owned ? (cell.colour ?? PALETTE.neutralLand) : PALETTE.neutralLand, blocked: false };
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function attackTargets(cells, meId) {
  const owned = new Set(cells.filter(cell => cell.ownerMemberId === meId).map(cellKey));
  const targets = new Set();
  for (const cell of cells) {
    if (cell.type !== 'regular') continue;
    if (cell.ownerMemberId === meId) continue;
    const adjacent = NEIGHBOURS.some(([dx, dy]) => owned.has(`${cell.x + dx}-${cell.y + dy}`));
    if (adjacent) targets.add(cellKey(cell));
  }
  return targets;
}

export function standings(cells, members) {
  return members
    .map(member => ({
      id: member.id,
      name: member.name,
      colour: member.colour,
      territories: cells.filter(cell => cell.ownerMemberId === member.id).length,
    }))
    .sort((a, b) => b.territories - a.territories);
}
