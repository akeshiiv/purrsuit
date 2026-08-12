import CellTile from '../ui/CellTile.jsx';
import { PALETTE, cellKey } from './mapModel.js';

// The board is one object at two sizes: 60px cells on Home, 72px on Map. The
// tray grows with it — same water tray, same white rim, same hard blue lift.
const TRAYS = {
  small: {
    padding: 16,
    radius: 34,
    rim: 5,
    lift: 16,
    ambient: '0 26px 44px -22px rgba(15,23,42,.45)',
    gap: 4,
    gutterPadding: 6,
    gutterRadius: 22,
  },
  large: {
    padding: 18,
    radius: 38,
    rim: 6,
    lift: 18,
    ambient: '0 34px 60px -26px rgba(15,23,42,.5)',
    gap: 5,
    gutterPadding: 7,
    gutterRadius: 26,
  },
};

export default function MapBoard({
  cells,
  size,
  meId,
  cellSize = 60,
  interactive = false,
  onCellClick,
  highlightKeys,
  selectedKey = null,
  className = '',
}) {
  const tray = cellSize >= 68 ? TRAYS.large : TRAYS.small;

  return (
    <div
      className={`flex-none ${className}`}
      style={{
        padding: tray.padding,
        borderRadius: tray.radius,
        background: 'var(--water-tray)',
        boxShadow: `inset 0 0 0 ${tray.rim}px rgba(255,255,255,.6), 0 ${tray.lift}px 0 -4px #93BCD4, ${tray.ambient}`,
      }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          gridAutoRows: `${cellSize}px`,
          gap: tray.gap,
          padding: tray.gutterPadding,
          borderRadius: tray.gutterRadius,
          background: PALETTE.gridline,
        }}
      >
        {cells.map(cell => {
          const key = cellKey(cell);
          const highlighted = Boolean(highlightKeys?.has(key));
          const defendable = cell.ownerMemberId === meId && Boolean(cell.unitType);
          // Clickability is derived, never passed in: only a cell you can act on
          // becomes a button, so blocked terrain is never focusable.
          const actionable = highlighted || defendable;
          return (
            <CellTile
              cell={cell}
              highlighted={highlighted}
              key={key}
              onClick={interactive && actionable ? onCellClick : undefined}
              selected={selectedKey === key}
              size={cellSize}
            />
          );
        })}
      </div>
    </div>
  );
}
