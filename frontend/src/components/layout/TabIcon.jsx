// The prototype's tab icons were 2x2 grids of dots — deliberate placeholders.
// These are the real set: one rounded 18px glyph per tab, stroked in
// currentColor so a tab's active/inactive ink carries straight through.
const PATHS = {
  home: 'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4h-5v4H4a1 1 0 0 1-1-1z',
  map: 'M7.5 3.5 3 5.5v11l4.5-2 5 2 4.5-2v-11l-4.5 2zM7.5 3.5v11M12.5 5.5v11',
  study: 'M10 3.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6zM10 6.4V10l2.6 1.8',
  shop: 'M4 7h12l-1 9.2a1 1 0 0 1-1 .8H6a1 1 0 0 1-1-.8zM7.4 7V5.6a2.6 2.6 0 0 1 5.2 0V7',
  cats: 'M5.2 8.4 4 4.2l3.4 2.1a7.6 7.6 0 0 1 5.2 0L16 4.2l-1.2 4.2a5.6 5.6 0 0 1 .9 3c0 3-2.6 5-5.7 5s-5.7-2-5.7-5c0-1.1.3-2.1.9-3zM8 11.4h.01M12 11.4h.01',
  ranks: 'M4 16.5h3.5V9H4zM8.25 16.5h3.5V4h-3.5zM12.5 16.5H16v-5h-3.5z',
  stats: 'M3.5 13.6 7.4 9l3 2.7L16.5 5M16.5 5h-3.6M16.5 5v3.6',
};

export default function TabIcon({ name, size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 20 20"
      width={size}
    >
      <path d={PATHS[name] ?? PATHS.home} />
    </svg>
  );
}
