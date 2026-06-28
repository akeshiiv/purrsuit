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

export function crossroads(size) {
  const middle = Math.floor(size / 2);
  return makeCells(size, (x, y) => (
    x === middle || y === middle ? 'water' : 'regular'
  ));
}

export function archipelago(size) {
  const inset = Math.max(2, Math.floor(size / 4));
  const far = size - inset - 1;

  return makeCells(size, (x, y) => {
    const onHorizontalRing = y === inset || y === far;
    const onVerticalRing = x === inset || x === far;
    const insideRingBounds = x >= inset && x <= far && y >= inset && y <= far;
    return insideRingBounds && (onHorizontalRing || onVerticalRing)
      ? 'water'
      : 'regular';
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
