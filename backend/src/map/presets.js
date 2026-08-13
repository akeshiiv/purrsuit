export const MAP_PRESETS = new Set(['open_plains', 'crossroads', 'archipelago']);

function makeCells(size, typeFor) {
  const cells = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      cells.push({
        x,
        y,
        type: typeFor(x, y),
        ownerMemberId: null,
        unitType: null,
        troopCount: 0,
      });
    }
  }
  return cells;
}

export function openPlains(size) {
  return makeCells(size, () => 'regular');
}

// A water cross with four bridges. The bridges are load-bearing, not decoration:
// water is impassable (attack() refuses any cell that is not 'regular'), so an
// unbroken cross cuts the board into four quadrants that can never reach one
// another — every player would be sealed into their own corner for the whole
// season and territory could never be contested. One crossing per arm restores
// a single connected board while keeping the choke points the preset is for.
export function crossroads(size) {
  const middle = Math.floor(size / 2);
  const bridge = Math.floor(size / 4);
  const bridges = new Set([bridge, size - 1 - bridge]);

  return makeCells(size, (x, y) => {
    const onVerticalArm = x === middle;
    const onHorizontalArm = y === middle;
    if (!onVerticalArm && !onHorizontalArm) return 'regular';
    // The centre, where the arms meet, stays water — a bridge there would join
    // all four quadrants at one cell and undo the choke points.
    if (onVerticalArm && onHorizontalArm) return 'water';
    return (onVerticalArm && bridges.has(y)) || (onHorizontalArm && bridges.has(x))
      ? 'regular'
      : 'water';
  });
}

// A water ring around a central lagoon, with one channel through each side. The
// channels exist for the same reason crossroads has bridges: a closed ring seals
// the cells inside it off from the rest of the board, and because water is
// impassable those cells could never be claimed by anyone — 4 dead cells at
// size 8, rising to 36 at size 16. The channels make the middle the contested
// prize the preset is shaped like, instead of scenery.
export function archipelago(size) {
  const inset = Math.max(2, Math.floor(size / 4));
  const far = size - inset - 1;
  const channel = Math.floor((inset + far) / 2);

  return makeCells(size, (x, y) => {
    const onHorizontalRing = y === inset || y === far;
    const onVerticalRing = x === inset || x === far;
    const insideRingBounds = x >= inset && x <= far && y >= inset && y <= far;
    if (!insideRingBounds || !(onHorizontalRing || onVerticalRing)) return 'regular';
    if (onHorizontalRing && x === channel) return 'regular';
    if (onVerticalRing && y === channel) return 'regular';
    return 'water';
  });
}

export function cellsForPreset(preset, size) {
  switch (preset) {
    case 'open_plains':
      return openPlains(size);
    case 'crossroads':
      return crossroads(size);
    case 'archipelago':
      return archipelago(size);
    default:
      throw new RangeError(`unknown map preset: ${String(preset)}`);
  }
}
