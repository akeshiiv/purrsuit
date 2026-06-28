import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import {
  MAX_UNITS,
  UNIT_COST,
  UNIT_META,
  UNIT_ORDER,
  beatsLabel,
} from '../components/units.js';
import { shopService } from '../services/index.js';

export default function Shop() {
  const { refresh } = useGame();
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    shopService.getInventory()
      .then(setInventory)
      .catch(caught => setError(caught.message));
  }, []);

  async function buy(unitType) {
    setError('');
    setNotice('');
    setBuying(unitType);
    try {
      await shopService.buy({ unitType });
      setInventory(await shopService.getInventory());
      await refresh();
      setNotice(`Recruited ${UNIT_META[unitType].name}.`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBuying(null);
    }
  }

  if (!inventory) {
    return <p className="text-sm text-slate-500">Loading shop…</p>;
  }

  const { coins, total, actions } = inventory;
  const full = total >= MAX_UNITS;
  const broke = coins < UNIT_COST;

  return (
    <div className="space-y-4">
      <Card className="space-y-1">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Shop</h1>
          <span className="text-sm text-slate-500">{total}/{MAX_UNITS} units</span>
        </div>
        <p className="text-sm">Coins: <span className="font-semibold">{coins}</span></p>

        {full && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Inventory full. Deploy units on the <Link className="underline" to="/realm/map">map</Link> before recruiting more.
          </p>
        )}
        {!full && broke && (
          <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
            You need {UNIT_COST} coins to recruit a unit. <Link className="underline" to="/realm/study">Study</Link> to earn more.
          </p>
        )}
        {!full && !broke && actions.mustBuy && (
          <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">
            You have coins to spend — recruit a unit to keep studying and attacking.
          </p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {UNIT_ORDER.map(unitType => {
          const meta = UNIT_META[unitType];
          return (
            <Card key={unitType} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-sm font-semibold text-white">
                  {unitType}
                </span>
                <span className="font-semibold">{meta.name}</span>
              </div>
              <p className="text-xs text-slate-500">Beats {beatsLabel(unitType)}</p>
              <p className="mt-auto text-sm">{UNIT_COST} coins</p>
              <Button
                disabled={!actions.canBuy || buying !== null}
                onClick={() => buy(unitType)}
              >
                {buying === unitType ? 'Recruiting…' : 'Recruit'}
              </Button>
            </Card>
          );
        })}
      </div>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <p className="text-sm text-slate-500">
        <Link className="underline" to="/realm/inventory">View inventory →</Link>
      </p>
    </div>
  );
}
