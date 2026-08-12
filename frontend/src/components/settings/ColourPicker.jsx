// Identity colours: the same hex marks the player's cells, avatar ring and
// legend chip everywhere, so the choice is a fixed set rather than a colour box.
const COLOURS = [
  { value: '#3b82f6', name: 'Blue' },
  { value: '#ef4444', name: 'Red' },
  { value: '#22c55e', name: 'Green' },
  { value: '#a855f7', name: 'Purple' },
  { value: '#f97316', name: 'Orange' },
  { value: '#ec4899', name: 'Pink' },
];

export default function ColourPicker({ value, onChange }) {
  const current = (value ?? '').toLowerCase();
  // A colour saved before this picker existed still belongs to the player, so it
  // rides along as a seventh swatch instead of silently reading as unselected.
  const swatches = COLOURS.some(colour => colour.value === current)
    ? COLOURS
    : [...COLOURS, { value: current || '#3b82f6', name: 'Current colour' }];

  return (
    <div aria-label="Territory colour" className="flex gap-[9px]" role="radiogroup">
      {swatches.map(colour => {
        const selected = colour.value === current;
        return (
          <button
            aria-checked={selected}
            aria-label={colour.name}
            className="size-[42px] rounded-[14px]"
            key={colour.value}
            onClick={() => onChange(colour.value)}
            role="radio"
            style={{
              background: colour.value,
              border: selected ? '4px solid #4A2A12' : '3px solid rgba(0,0,0,.12)',
              boxShadow: selected ? '0 0 0 3px #FFF8EA inset' : 'none',
            }}
            type="button"
          />
        );
      })}
    </div>
  );
}
