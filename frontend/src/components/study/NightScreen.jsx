// The focus route's shell: a full-screen night sky with no chrome, no nav and
// nothing to misclick. `tone` picks which night it is — warm for a session that
// is running or has paid out, fail for a distraction termination, cool for the
// screen-share prompt.
const TONES = {
  warm: { background: 'var(--night)', text: 'text-night-text' },
  fail: { background: 'var(--night-fail)', text: 'text-[#F6D9CC]' },
  cool: { background: 'var(--night-cool)', text: 'text-[#DCEBF6]' },
};

export default function NightScreen({ children, tone = 'warm', className = '' }) {
  const { background, text } = TONES[tone] ?? TONES.warm;

  return (
    <div
      className={`relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-8 py-12 text-center font-body ${text} ${className}`}
      style={{ background }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute top-[70px] right-[120px] size-24 rounded-full bg-gold shadow-[0_0_90px_30px_rgba(242,206,126,.18)]" />
        <span className="absolute top-[150px] left-[180px] size-[6px] rounded-full bg-[rgba(246,231,204,.7)]" />
        <span className="absolute top-[90px] left-[320px] size-1 rounded-full bg-[rgba(246,231,204,.5)]" />
        <span className="absolute top-[260px] left-[1120px] size-[5px] rounded-full bg-[rgba(246,231,204,.45)]" />
      </div>
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}
