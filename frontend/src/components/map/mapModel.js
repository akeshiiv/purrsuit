// SSOT: Map UI/UX + Game logic.
// NO REACT/DOM IMPORTS!

export const PALETTE = {
  neutralLand: '#E9E1D4',
  water: '#8CC7E4',
  obstacle: '#4A4A55',
  gridline: '#F4F1EA',
  highlightRing: '#E9A62C', // valid cells to attack
  homeRing: 'rgba(46,29,11,.55)', // highlight home base
  ownedTintToward: '#EBEBEB',
};

// An owned cell is filled with its owner's colour tinted this far toward
// `ownedTintToward` and ringed with the untinted colour, so the board stays
// legible while the identity colour still reads at a glance.
export const OWNED_TINT = 0.52;

export const UNIT_META = {
  A: { label: 'MasterGooner', glyph: '😼', key: 'a' },
  B: { label: 'AlphaSigma67', glyph: '😽', key: 'b' },
  C: { label: 'Mr.Chonk', glyph: '😻', key: 'c' },
};

export const UNIT_TYPES = ['A', 'B', 'C'];

const BEATS = { A: 'B', B: 'C', C: 'A' };

export function beats(attacker, defender) {
  return BEATS[attacker] === defender;
}

export function cellKey(cell) {
  return `${cell.x}-${cell.y}`;
}

function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Mix `hex` `amount` of the way toward `toward` (both `#rgb` or `#rrggbb`).
 * `tint('#3b82f6', 0.52)` → `'rgb(151, 185, 240)'`. Unparseable input is
 * returned untouched so a missing player colour can never blank out a cell.
 */
export function tint(hex, amount, toward = PALETTE.ownedTintToward) {
  const from = parseHex(hex);
  const to = parseHex(toward);
  if (!from || !to) return hex;
  const mix = (a, b) => Math.round(a + (b - a) * amount);
  return `rgb(${mix(from[0], to[0])}, ${mix(from[1], to[1])}, ${mix(from[2], to[2])})`;
}

export function cellPalette(cell) {
  if (cell.type === 'water') return { fill: PALETTE.water, blocked: true, ring: null };
  if (cell.type === 'obstacle') return { fill: PALETTE.obstacle, blocked: true, ring: null };
  const colour = cell.ownerMemberId ? (cell.colour ?? null) : null;
  if (!colour) return { fill: PALETTE.neutralLand, blocked: false, ring: null };
  return { fill: tint(colour, OWNED_TINT), blocked: false, ring: colour };
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

/**
 * The cat a player is best known for: whichever type holds most of their cells.
 * Used for avatar art — members carry a colour but no portrait of their own.
 */
export function dominantUnit(cells, memberId) {
  const tally = { A: 0, B: 0, C: 0 };
  for (const cell of cells) {
    if (cell.ownerMemberId !== memberId) continue;
    if (cell.unitType && tally[cell.unitType] !== undefined) tally[cell.unitType] += 1;
  }
  return UNIT_TYPES.reduce((best, type) => (tally[type] > tally[best] ? type : best), 'A');
}
