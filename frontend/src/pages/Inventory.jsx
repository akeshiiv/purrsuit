import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Card from '../components/ui/Card.jsx';
import {
  MAX_UNITS,
  UNIT_META,
  UNIT_ORDER,
} from '../components/units.js';
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

export default function Inventory() {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    shopService.getInventory()
      .then(setInventory)
      .catch(caught => setError(caught.message));
  }, []);

  if (error && !inventory) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (!inventory) {
    return <p className="text-sm text-slate-500">Loading inventory…</p>;
  }

  const slots = buildSlots(inventory.units);

  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <span className="text-sm text-slate-500">{inventory.total}/{MAX_UNITS} units</span>
      </div>
      <p className="text-sm">Coins: <span className="font-semibold">{inventory.coins}</span></p>

      <div className="grid grid-cols-3 gap-2">
        {slots.map((unitType, index) => (
          <div
            key={index}
            className={`flex h-20 flex-col items-center justify-center gap-1 rounded border text-sm ${
              unitType
                ? 'border-slate-300 bg-slate-50'
                : 'border-dashed border-slate-200 text-slate-400'
            }`}
          >
            {unitType ? (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-sm font-semibold text-white">
                  {unitType}
                </span>
                <span className="text-xs text-slate-600">{UNIT_META[unitType].name}</span>
              </>
            ) : (
              <span className="text-xs">Empty</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        <Link className="underline" to="/realm/shop">Go to shop →</Link>
      </p>
    </Card>
  );
}
