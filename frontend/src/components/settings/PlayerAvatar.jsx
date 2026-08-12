import { useState } from 'react';
import { catArt } from '../cats.js';

const CATS = ['A', 'B', 'C'];

// Members carry no art of their own, so a player's cat is derived from their id:
// stable for a given player rather than reshuffling on every render.
function catFor(seed) {
  const text = String(seed ?? '');
  let sum = 0;
  for (let index = 0; index < text.length; index += 1) sum += text.charCodeAt(index);
  return CATS[sum % CATS.length];
}

/**
 * A round avatar well ringed in the player's identity colour. Falls back to the
 * player's cat when there is no avatar URL, or when the one they pasted 404s.
 */
export default function PlayerAvatar({
  seed,
  colour,
  src = '',
  size = 34,
  border = 2,
  padding = 2,
  well = '#EFE0C2',
  className = '',
}) {
  // Keyed by the URL itself so pasting a new one clears the previous failure.
  const [brokenSrc, setBrokenSrc] = useState(null);
  const custom = Boolean(src) && brokenSrc !== src;

  return (
    <span
      className={`p-cat-well flex-none ${className}`}
      style={{
        width: size,
        height: size,
        background: well,
        borderWidth: border,
        borderColor: colour || 'var(--color-edge)',
      }}
    >
      <img
        alt=""
        className={custom ? 'h-full w-full object-cover' : 'p-cat-art'}
        onError={() => setBrokenSrc(src)}
        src={custom ? src : catArt(catFor(seed))}
        style={custom ? undefined : { padding }}
      />
    </span>
  );
}
