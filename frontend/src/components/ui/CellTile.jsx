import { UNIT_META, cellPalette } from '../map/mapModel.js';

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

  return (
    <Tag
      className={[
        'relative aspect-square w-full rounded-[3px] text-[0.65rem] leading-none',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_3px_rgba(0,0,0,0.18)]',
        interactive ? 'cursor-pointer transition-transform hover:scale-[1.08]' : '',
        selected ? 'z-10 ring-2 ring-amber-400' : '',
        highlighted && !selected ? 'ring-2 ring-amber-300/70' : '',
      ].filter(Boolean).join(' ')}
      style={{ backgroundColor: fill, outline: mine ? '1px solid rgba(0,0,0,0.22)' : undefined }}
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
