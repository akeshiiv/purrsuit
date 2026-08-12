import { catArt } from '../cats.js';
import { PALETTE, cellPalette } from '../map/mapModel.js';
import { UNIT_META } from '../units.js';

// The two board sizes in the design: 60px cells on Home, 72px on Map.
const METRICS = {
  small: { radius: 9, count: 13, countRight: 3, countBottom: 1, home: 9, homeInset: 4 },
  large: { radius: 11, count: 15, countRight: 5, countBottom: 2, home: 11, homeInset: 5 },
};

function tooltip(cell, unit) {
  if (cell.type === 'water') return 'Water — impassable';
  if (cell.type === 'obstacle') return 'Rock — impassable';
  if (unit) return `${unit.name} ×${cell.troopCount}`;
  if (cell.ownerMemberId) return `Held cell (${cell.x}, ${cell.y})`;
  return `Neutral land (${cell.x}, ${cell.y})`;
}

/**
 * One board cell. It only becomes a `<button>` when the board hands it an
 * `onClick` — blocked water and rock never do, so they stay inert `<div>`s.
 */
export default function CellTile({ cell, size = 60, highlighted = false, selected = false, onClick }) {
  const { fill, ring, blocked } = cellPalette(cell);
  const metrics = size >= 68 ? METRICS.large : METRICS.small;
  const isHome = cell.type === 'home';
  const unit = cell.unitType ? UNIT_META[cell.unitType] : null;
  // Blocked terrain can never become a button, whatever the board passes.
  const interactive = Boolean(onClick) && !blocked;
  const Tag = interactive ? 'button' : 'div';

  const tagProps = interactive
    ? { type: 'button', onClick: () => onClick(cell), 'aria-label': `Cell ${cell.x}, ${cell.y}` }
    : { 'aria-hidden': true };

  const boxShadow = [
    'inset 0 1px 0 rgba(255,255,255,0.5)',
    'inset 0 -2px 3px rgba(0,0,0,0.16)',
    ring ? `inset 0 0 0 2px ${ring}` : null,
    isHome ? `inset 0 0 0 ${metrics.homeInset}px ${PALETTE.homeRing}` : null,
    highlighted || selected ? `0 0 0 3px ${PALETTE.highlightRing}` : null,
  ].filter(Boolean).join(', ');

  return (
    <Tag
      className={[
        'relative flex items-center justify-center transition-transform duration-[120ms] ease-out hover:scale-[1.09]',
        interactive ? 'cursor-pointer' : '',
        selected ? 'z-10' : '',
      ].filter(Boolean).join(' ')}
      style={{ width: size, height: size, borderRadius: metrics.radius, background: fill, boxShadow }}
      title={tooltip(cell, unit)}
      {...tagProps}
    >
      {/* The pulse rides on its own layer: `glow` animates box-shadow, which
          would otherwise wipe out the cell's own rim and owner ring. */}
      {highlighted && (
        <span
          aria-hidden="true"
          className="p-glow pointer-events-none absolute inset-0"
          style={{ borderRadius: metrics.radius }}
        />
      )}
      {unit && <img alt="" className="w-[80%] opacity-[0.92]" src={catArt(cell.unitType)} />}
      {cell.troopCount > 0 && (
        <span
          className="p-nums absolute"
          style={{ right: metrics.countRight, bottom: metrics.countBottom, fontSize: metrics.count, color: '#3B2410' }}
        >
          {cell.troopCount}
        </span>
      )}
      {isHome && (
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 block rounded-[3px] bg-[#2E1D0B]"
          style={{ width: metrics.home, height: metrics.home }}
        />
      )}
    </Tag>
  );
}
