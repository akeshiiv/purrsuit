import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import Screen from '../components/layout/Screen.jsx';
import Card from '../components/ui/Card.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import CoinPill from '../components/ui/CoinPill.jsx';
import {
  MAX_UNITS,
  UNIT_COST,
  UNIT_META,
  UNIT_ORDER,
} from '../components/units.js';
import { useMapPolling } from '../hooks/useMapPolling.js';
import { shopService } from '../services/index.js';

function buildSlots(units) {
  const slots = [];
  UNIT_ORDER.forEach(unitType => {
    const count = units[UNIT_META[unitType].key] ?? 0;
    for (let index = 0; index < count; index += 1) {
      slots.push(unitType);
    }
  });
  while (slots.length < MAX_UNITS) {
    slots.push(null);
  }
  return slots;
}

/**
 * Cats standing on the board, per type. The barracks payload only knows what is
 * *not* deployed, so this is counted off live cells: every cell you own carries
 * one unit type and a troop count. Returns null until the map has loaded — the
 * roster shows its own waiting state rather than inventing zeroes.
 */
function deployedByType(map) {
  if (!map?.cells) return null;
  const meId = map.me?.id;
  const counts = { A: 0, B: 0, C: 0 };
  map.cells.forEach(cell => {
    if (cell.ownerMemberId !== meId || !cell.unitType) return;
    counts[cell.unitType] = (counts[cell.unitType] ?? 0) + (cell.troopCount ?? 0);
  });
  return counts;
}

function BarracksSlot({ unitType }) {
  if (!unitType) {
    return (
      <div className="flex h-[196px] flex-col items-center justify-center gap-2 rounded-[24px] border-3 border-dashed border-edge-soft bg-[#FBF5E9]">
        <span
          aria-hidden="true"
          className="size-[104px] rounded-full border-3 border-dashed border-[#DCC9A6] bg-muted"
        />
        <span className="text-[12.5px] font-extrabold text-[#BFA77C]">Empty slot</span>
      </div>
    );
  }

  return (
    <div className="flex h-[196px] flex-col items-center justify-center gap-2 rounded-[24px] border-3 border-edge-soft bg-sunk">
      {/* `bg-raised!` beats CatCircle's default well fill, which would otherwise
          match the slot's own `sunk` background and lose the portrait. */}
      <CatCircle className="bg-raised!" size={104} unitType={unitType} />
      <span className="font-display text-[16px] font-extrabold text-ink">{UNIT_META[unitType].name}</span>
    </div>
  );
}

function RosterRow({ quantity, unitType }) {
  const deployed = quantity > 0;
  return (
    <div
      className={[
        'flex items-center gap-[10px] rounded-[14px] border-2 px-3 py-2',
        deployed ? 'border-edge-soft bg-sunk' : 'border-[#EADCC0] bg-[#F3EADA]',
      ].join(' ')}
    >
      <CatCircle border={0} className="flex-none bg-[#EFE0C2]!" padding={2} size={32} unitType={unitType} />
      <span className="flex-1 text-[12.5px] font-extrabold text-ink-body-soft">{UNIT_META[unitType].name}</span>
      <span className={`p-nums text-[17px] ${deployed ? 'text-ink' : 'text-[#C6AC80]'}`}>{quantity}</span>
    </div>
  );
}

export default function Inventory() {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');
  // The barracks knows nothing about the board, so the "Deployed on the map"
  // roster comes off live cells. Slow poll: nothing here is time-critical, and
  // the version check makes an unchanged map a cheap no-op.
  const { map, error: mapError } = useMapPolling(6000);
  const deployed = useMemo(() => deployedByType(map), [map]);

  useEffect(() => {
    shopService.getInventory()
      .then(setInventory)
      .catch(caught => setError(caught.message));
  }, []);

  if (error && !inventory) {
    return (
      <Screen>
        <div className="mx-auto flex max-w-[1372px] flex-col items-center pt-20">
          <p className="text-[13.5px] font-extrabold text-danger-ink" role="alert">{error}</p>
        </div>
      </Screen>
    );
  }

  if (!inventory) {
    return (
      <Screen>
        <div className="mx-auto flex max-w-[1372px] flex-col items-center pt-20">
          <p className="font-display text-[19px] font-extrabold text-ink-muted">Loading inventory…</p>
        </div>
      </Screen>
    );
  }

  const slots = buildSlots(inventory.units);
  // A brand-new player sees six dashed slots and no other explanation. The empty
  // slots already carry the 6-cap; what they don't say is how a cat is obtained,
  // so the zero case gets that once rather than leaving the screen to be read as
  // something that failed to load.
  const noCats = inventory.total === 0;

  return (
    <Screen bodyClassName="flex items-center justify-center" right={<CoinPill coins={inventory.coins} />}>
      <div className="mx-auto flex w-full max-w-[1372px] items-center justify-center gap-[34px]">
        <div className="w-[760px] pt-5">
          <Card className="relative px-6 pt-[26px] pb-6" variant="hero">
            <h1 className="p-title-pill left-1/2 -translate-x-1/2 px-[32px] py-[9px] text-[20px] whitespace-nowrap">
              Your barracks · {inventory.total} / {MAX_UNITS}
            </h1>
            <div className="grid grid-cols-3 gap-[18px]">
              {slots.map((unitType, index) => (
                <BarracksSlot key={index} unitType={unitType} />
              ))}
            </div>
            {noCats && (
              <p className="mt-[18px] text-center text-[13.5px] font-bold text-ink-muted text-pretty">
                No cats yet — every slot is open. Study to earn coins, then adopt your first cat
                from the shop for {UNIT_COST}.
              </p>
            )}
          </Card>
        </div>

        <div className="flex w-[300px] flex-col gap-4">
          <Card className="rounded-[24px] p-[18px]">
            <h2 className="font-display text-[18px] font-extrabold text-ink">Deployed on the map</h2>
            <div className="mt-3 flex flex-col gap-[9px]">
              {deployed
                ? UNIT_ORDER.map(unitType => (
                  <RosterRow key={unitType} quantity={deployed[unitType]} unitType={unitType} />
                ))
                : (
                  <p
                    className="text-[12.5px] font-extrabold text-ink-muted"
                    role={mapError ? 'alert' : undefined}
                  >
                    {mapError ? "Couldn't read the map — retrying…" : 'Counting your cats on the map…'}
                  </p>
                )}
            </div>
          </Card>

          <Link
            className="p-btn p-btn-gold w-full py-[15px] text-[20px] shadow-[0_6px_0_var(--color-gold-shadow)]"
            to="/realm/shop"
          >
            Go to shop
          </Link>

          <p className="rounded-[18px] border-2 border-edge-soft bg-[#F7EBD6] px-4 py-[14px] text-[12.5px] font-bold text-ink-muted text-pretty">
            {noCats
              ? `Cats cost ${UNIT_COST} coins each, earned by studying. You can house up to ${MAX_UNITS}.`
              : 'Cats in the barracks do nothing. Send them to the map to hold ground and earn territory.'}
          </p>
        </div>
      </div>
    </Screen>
  );
}
