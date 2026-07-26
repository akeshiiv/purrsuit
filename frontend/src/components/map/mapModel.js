// SSOT: Map UI/UX + Game logic. 
// NO REACT/DOM IMPORTS!

export const PALETTE = {
  neutralLand: '#e9e1d4',
  water: '#86c5e0',
  obstacle: '#3c3c44',
  gridline: '#f4f1ea',
  highlightRing: '#f59e0b', // valid cells to attack
  homeRing: '#1A1E24', // highlight home base
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
