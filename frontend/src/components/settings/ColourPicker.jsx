import { DEFAULT_PLAYER_COLOUR, PLAYER_COLOURS } from '../playerColours.js';

export default function ColourPicker({ value, onChange }) {
  const current = (value ?? '').toLowerCase();
  // A colour saved before this picker existed still belongs to the player, so it
  // rides along as a seventh swatch instead of silently reading as unselected.
  const swatches = PLAYER_COLOURS.some(colour => colour.value === current)
    ? PLAYER_COLOURS
    : [...PLAYER_COLOURS, { value: current || DEFAULT_PLAYER_COLOUR, name: 'Current colour' }];

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
