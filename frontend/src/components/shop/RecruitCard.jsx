import { useId } from 'react';

import Button from '../ui/Button.jsx';
import CatCircle from '../ui/CatCircle.jsx';
import { UNIT_COST, UNIT_META, beatsLabel } from '../units.js';

/**
 * One 340px shop card: portrait, name, `Beats X`, price, holdings, Recruit.
 *
 * `lead` carries the stronger border/shadow pair (4px `edge-strong` over
 * `0 10px 0 warm-deep`) so the first card reads as the row's visual lead.
 *
 * `reason` is the inline explanation for a disabled Recruit — the design asks
 * for the reason on the card itself, never in a tooltip, so it is also wired to
 * the button through `aria-describedby`.
 */
export default function RecruitCard({
  unitType,
  owned = 0,
  lead = false,
  disabled = false,
  busy = false,
  reason = '',
  onRecruit,
}) {
  const reasonId = useId();

  return (
    <section
      className={[
        'flex w-[340px] flex-col items-center rounded-[30px] border-4 bg-surface p-[22px]',
        lead
          ? 'border-edge-strong shadow-[0_10px_0_var(--color-warm-deep)]'
          : 'border-edge shadow-[0_10px_0_var(--color-warm)]',
      ].join(' ')}
    >
      {/* `bg-raised!` beats CatCircle's default well fill: on a surface card the
          portrait needs the lighter cream to separate from the card. */}
      <CatCircle className="bg-raised!" size={170} unitType={unitType} />

      <p className="mt-4 font-display text-[24px] font-extrabold text-ink">{UNIT_META[unitType].name}</p>
      <p className="p-chip mt-[6px] px-[14px] py-[6px] text-[12px]">Beats {beatsLabel(unitType)}</p>

      <div className="mt-[14px] flex items-center gap-2">
        <span
          aria-hidden="true"
          className="block size-6 rounded-full border-2 border-[#C08D45] bg-linear-to-b from-gold-pale to-gold-deep"
        />
        <span className="p-nums text-[22px] text-ink">{UNIT_COST}</span>
      </div>

      <p className="mt-2 text-[12px] font-extrabold text-ink-muted">You hold {owned}</p>

      <Button
        aria-describedby={reason ? reasonId : undefined}
        className="mt-[14px]"
        disabled={disabled}
        full
        onClick={onRecruit}
        size="lg"
        variant="gold"
      >
        {busy ? 'Recruiting…' : 'Recruit'}
      </Button>

      {reason && (
        <p className="mt-2 text-center text-[11.5px] font-extrabold text-warn-ink" id={reasonId}>
          {reason}
        </p>
      )}
    </section>
  );
}
