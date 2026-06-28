import CellTile from '../ui/CellTile.jsx';
import { PALETTE, cellKey } from './mapModel.js';

export default function MapBoard({
  cells,
  size,
  meId,
  interactive = false,
  onCellClick,
  highlightKeys,
  selectedKey = null,
  className = '',
}) {
  return (
    <div
      className={`relative mx-auto w-full max-w-xl rounded-[1.75rem] p-4 sm:p-5 ${className}`}
      style={{
        // Tweak the planet frame here.
        background: 'radial-gradient(circle at 50% 30%, #d4ecf6 0%, #bcdcec 55%, #a6cbe0 100%)',
        boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.55), 0 20px 45px -22px rgba(15,23,42,0.6)',
      }}
    >
      <div
        className="grid aspect-square w-full gap-[2px] overflow-hidden rounded-2xl p-[2px]"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          backgroundColor: PALETTE.gridline,
        }}
      >
        {cells.map(cell => {
          const key = cellKey(cell);
          const highlighted = Boolean(highlightKeys?.has(key));
          // Only attackable (highlighted) or own garrisoned cells are actionable;
          // everything else stays a non-interactive div so it isn't keyboard-focusable.
          const defendable = cell.ownerMemberId === meId && Boolean(cell.unitType);
          const actionable = highlighted || defendable;
          return (
            <CellTile
              key={key}
              cell={cell}
              meId={meId}
              highlighted={highlighted}
              selected={selectedKey === key}
              onClick={interactive && actionable ? onCellClick : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
