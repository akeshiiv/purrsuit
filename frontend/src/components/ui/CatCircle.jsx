import { catArt } from '../cats.js';

// A cat portrait in a round well. `tone` picks the well fill: cream on the dark
// session screens (a translucent fill would swallow the black cat), gold for the
// featured animal, blue for the third of the entry-screen trio.
const TONES = {
  default: 'bg-sunk border-edge',
  gold: 'bg-gold border-edge-strong',
  blue: 'bg-[#CFE7F4] border-blue',
  night: 'p-cat-well-night',
  dashed: 'bg-sunk border-edge border-dashed',
};

export default function CatCircle({
  unitType = 'A',
  size = 120,
  tone = 'default',
  bob = false,
  border = 3,
  padding = 8,
  className = '',
  alt = '',
}) {
  return (
    <div
      className={`p-cat-well ${TONES[tone] ?? TONES.default} ${className}`}
      style={{ width: size, height: size, borderWidth: border }}
    >
      <img
        alt={alt}
        className={`p-cat-art ${bob ? 'p-bob' : ''}`}
        src={catArt(unitType)}
        style={{ padding }}
      />
    </div>
  );
}
