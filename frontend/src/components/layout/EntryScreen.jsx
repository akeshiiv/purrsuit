/**
 * The frame the pre-realm screens share (sign in, realm select, create, join).
 *
 * These sit outside the app chrome — no tab bar, no coin pill — on the warm
 * radial page, with two translucent circles bleeding off the edges. The circles
 * are decoration only, so they are hidden from assistive tech and never take a
 * pointer event.
 *
 * `decor` lets a screen place its own circles; the default pair is the sign-in
 * arrangement. `className` styles the inner content box, which is the flex
 * container each screen lays its columns out in.
 */
const SIGN_IN_DECOR = [
  { id: 'gold', style: { left: 70, top: 70, width: 150, height: 150, background: 'rgba(242, 206, 126, 0.28)' } },
  { id: 'blue', style: { right: 110, bottom: 90, width: 220, height: 220, background: 'rgba(140, 199, 228, 0.25)' } },
];

export default function EntryScreen({ children, decor = SIGN_IN_DECOR, className = '' }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden font-body text-ink-body"
      style={{ background: 'var(--page-glow)' }}
    >
      {decor.map(circle => (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          key={circle.id}
          style={{ position: 'absolute', borderRadius: '50%', ...circle.style }}
        />
      ))}
      <div className={`relative mx-auto flex min-h-screen max-w-[1372px] ${className}`}>{children}</div>
    </div>
  );
}
