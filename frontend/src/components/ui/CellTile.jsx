export default function CellTile({ cell, onClick }) {
  const background = cell.colour ?? '#e5e7eb';
  const blocked = cell.type === 'obstacle' || cell.type === 'water';

  return (
    <button
      className="aspect-square min-h-10 rounded border border-white/80 p-1 text-xs font-semibold text-slate-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      disabled={blocked}
      onClick={() => onClick(cell)}
      style={{ background }}
      type="button"
    >
      <span className="block">{blocked ? cell.type : (cell.unitType ?? '-')}</span>
      <span className="block">{cell.troopCount}</span>
    </button>
  );
}
