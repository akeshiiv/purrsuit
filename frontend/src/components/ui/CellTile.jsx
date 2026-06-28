import { PALETTE, UNIT_META, cellPalette } from '../map/mapModel.js';

export default function CellTile({ cell, meId, highlighted = false, selected = false, onClick }) {
  const { fill, blocked } = cellPalette(cell);
  const isHome = cell.type === 'home';
  const mine = cell.ownerMemberId === meId;
  const unit = cell.unitType ? UNIT_META[cell.unitType] : null;
  const interactive = Boolean(onClick) && !blocked;
  const Tag = interactive ? 'button' : 'div';

  const tagProps = interactive
    ? { type: 'button', onClick: () => onClick(cell), 'aria-label': `Cell ${cell.x}, ${cell.y}` }
    : { 'aria-hidden': true };

  // Bevel + rings, all driven from PALETTE so the look stays tweakable in one place.
  const ring = selected
    ? `0 0 0 3px ${PALETTE.highlightRing}`
    : (highlighted ? `0 0 0 2px ${PALETTE.highlightRing}` : null);
  const boxShadow = [
    'inset 0 1px 0 rgba(255,255,255,0.45)',
    'inset 0 -2px 3px rgba(0,0,0,0.18)',
    isHome ? `0 0 0 2px ${PALETTE.homeRing}` : null,
    ring,
  ].filter(Boolean).join(', ');

  return (
    <Tag
      className={[
        'relative aspect-square w-full rounded-[3px] text-[0.65rem] leading-none',
        interactive ? 'cursor-pointer transition-transform hover:scale-[1.08]' : '',
        selected ? 'z-10' : '',
      ].filter(Boolean).join(' ')}
      style={{ backgroundColor: fill, boxShadow, outline: mine ? '1px solid rgba(0,0,0,0.22)' : undefined }}
      {...tagProps}
    >
      {isHome && <span className="absolute left-0.5 top-0.5 text-[0.55rem]">🏠</span>}
      {unit && (
        <span className="absolute inset-0 flex items-center justify-center text-[clamp(0.7rem,2.2vw,1.1rem)]">
          {unit.glyph}
        </span>
      )}
      {cell.troopCount > 0 && (
        <span className="absolute bottom-0 right-0.5 font-bold text-slate-900/80">{cell.troopCount}</span>
      )}
    </Tag>
  );
}
