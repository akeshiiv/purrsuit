import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Screen from '../components/layout/Screen.jsx';
import RecruitCard from '../components/shop/RecruitCard.jsx';
import CoinPill from '../components/ui/CoinPill.jsx';
import {
  MAX_UNITS,
  UNIT_COST,
  UNIT_META,
  UNIT_ORDER,
} from '../components/units.js';
import { shopService } from '../services/index.js';

// The rock-paper-scissors cycle, written out of the unit table rather than
// pasted: A beats B beats C beats A, so the order is UNIT_ORDER looped once.
const CYCLE = [...UNIT_ORDER, UNIT_ORDER[0]].map(unitType => UNIT_META[unitType].name).join(' → ');

// Notice band above the cards. Deliberately not `p-chip`: a chip is inline-flex,
// which would break a sentence containing a link into gapped flex items.
const BAND = 'rounded-full border-2 px-[14px] py-[6px] text-[12.5px] font-extrabold';

// The design spells the remaining-slots count out ("Two slots left"), so keep
// words for the only range that can occur (0-6 barracks slots).
const SLOT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

function slotsLeftLabel(remaining) {
  const word = SLOT_WORDS[remaining] ?? String(remaining);
  return `${word} slot${remaining === 1 ? '' : 's'} left`;
}

export default function Shop() {
  const { refresh } = useGame();
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [questNotice, setQuestNotice] = useState('');
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    shopService.getInventory()
      .then(setInventory)
      .catch(caught => setError(caught.message));
  }, []);

  async function buy(unitType) {
    setError('');
    setNotice('');
    setQuestNotice('');
    setBuying(unitType);
    try {
      const result = await shopService.buy({ unitType });
      setInventory(await shopService.getInventory());
      await refresh();
      setNotice(`Recruited ${UNIT_META[unitType].name}.`);
      if (result.questCompleted) {
        setQuestNotice(`Quest complete! +${result.questCompleted.reward} coins · ${result.questCompleted.title}`);
      }
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBuying(null);
    }
  }

  if (!inventory) {
    return (
      <Screen>
        <div className="mx-auto flex max-w-[1372px] flex-col items-center pt-20">
          <p className="font-display text-[19px] font-extrabold text-ink-muted">Loading shop…</p>
          {error && (
            <p className="mt-3 text-[13.5px] font-extrabold text-danger-ink" role="alert">{error}</p>
          )}
        </div>
      </Screen>
    );
  }

  const { coins, units, total, actions } = inventory;
  const full = total >= MAX_UNITS;
  const broke = coins < UNIT_COST;
  const remaining = Math.max(0, MAX_UNITS - total);

  // Enablement is the server's call (`actions.canBuy`); this only puts the
  // reason into words on the card, which is where the design wants it.
  let blockedReason = '';
  if (!actions.canBuy) {
    if (full) blockedReason = 'Barracks full. Deploy a cat to free a slot.';
    else if (broke) blockedReason = `Costs ${UNIT_COST} coins. You hold ${coins}.`;
    else blockedReason = 'Recruiting is unavailable right now.';
  }

  const headerRight = (
    <>
      <Link
        className="p-chip px-[14px] py-[6px] transition-[filter] hover:brightness-[0.97]"
        to="/realm/inventory"
      >
        {total} / {MAX_UNITS} cats housed
      </Link>
      <CoinPill coins={coins} />
    </>
  );

  return (
    <Screen right={headerRight}>
      <div className="mx-auto flex max-w-[1372px] flex-col items-center">
        <h1 className="font-display text-[34px] font-extrabold text-ink">Adopt a cat</h1>
        <p className="mt-[6px] text-[14px] font-bold text-ink-muted">
          Every cat costs {UNIT_COST} coins. Each one beats exactly one other, so pick to counter your neighbours.
        </p>

        {/* The three shop states plus the buy notices share one band. `full` is
            carried by the warn chip further down, where the design puts it. */}
        <div className="mt-[14px] flex flex-col items-center gap-2 empty:hidden">
          {!full && broke && (
            <p className={`${BAND} border-edge-soft bg-sunk text-ink-muted`}>
              You need {UNIT_COST} coins to recruit a cat.{' '}
              <Link className="text-ink-link underline" to="/realm/study">Study</Link> to earn more.
            </p>
          )}
          {!full && !broke && actions.mustBuy && (
            <p className={`${BAND} border-info-edge bg-info text-info-ink`}>
              You're too rich! Recruit a cat before you continue studying or attacking.
            </p>
          )}
          {questNotice && (
            <p className={`${BAND} border-gold-edge bg-gold text-ink-body shadow-[0_3px_0_var(--color-gold-shadow)]`}>
              {questNotice}
            </p>
          )}
          {notice && <p className={`${BAND} border-good-edge bg-good text-good-ink`}>{notice}</p>}
          {error && (
            <p className={`${BAND} border-danger-edge bg-danger text-danger-ink`} role="alert">{error}</p>
          )}
        </div>

        <div className="mt-[28px] grid grid-cols-[repeat(3,340px)] gap-[24px]">
          {UNIT_ORDER.map((unitType, index) => (
            <RecruitCard
              busy={buying === unitType}
              disabled={!actions.canBuy || buying !== null}
              key={unitType}
              lead={index === 0}
              onRecruit={() => buy(unitType)}
              owned={units[UNIT_META[unitType].key] ?? 0}
              reason={blockedReason}
              unitType={unitType}
            />
          ))}
        </div>

        <div className="mt-[26px] flex w-full max-w-[1088px] gap-[14px]">
          <p className="p-info flex-1 rounded-[20px] px-[18px] py-[14px] text-[13px] font-extrabold">
            {CYCLE}. Sending a cat that doesn't beat the defender just bounces.
          </p>
          <p className="p-warn flex-none rounded-[20px] px-[18px] py-[14px] text-[13px] font-extrabold">
            {slotsLeftLabel(remaining)}. Deploy cats on the{' '}
            <Link className="underline" to="/realm/map">map</Link> to free up room.
          </p>
        </div>
      </div>
    </Screen>
  );
}
