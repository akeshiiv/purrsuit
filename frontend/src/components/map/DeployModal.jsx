import { useMemo, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { UNIT_META, beats } from './mapModel.js';
import { mapService } from '../../services/index.js';

const FRIENDLY = {
  INSUFFICIENT_UNITS: 'You do not have enough of that unit.',
  NOT_ADJACENT: 'You can only attack cells next to your territory.',
  INVALID_TARGET: 'That cell cannot be attacked.',
  UNIT_TYPE_MISMATCH: 'Reinforcements must match the garrison unit.',
  NOT_OWNER: 'You can only defend your own cells.',
};

function held(units, type) {
  return type ? (units?.[UNIT_META[type].key] ?? 0) : 0;
}

export default function DeployModal({ open, mode, cell, me, onClose, onDeployed }) {
  const units = me?.units;
  const availableTypes = useMemo(
    () => ['A', 'B', 'C'].filter(type => held(units, type) >= 1),
    [units],
  );
  const [unitType, setUnitType] = useState(mode === 'defend' ? (cell?.unitType ?? 'A') : (availableTypes[0] ?? 'A'));
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open || !cell) return null;

  const maxQuantity = mode === 'attack' ? held(units, unitType) : 1;
  const canConfirm = !busy && (mode === 'defend'
    ? held(units, cell.unitType) >= 1
    : maxQuantity >= 1 && quantity >= 1);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const result = mode === 'attack'
        ? await mapService.attack({ x: cell.x, y: cell.y, unitType, quantity: Number(quantity) })
        : await mapService.defend({ x: cell.x, y: cell.y, unitType: cell.unitType });
      onDeployed(result);
    } catch (caught) {
      setError(FRIENDLY[caught.code] ?? caught.message);
      setBusy(false);
    }
  }

  const title = `${mode === 'attack' ? 'Attack' : 'Defend'} (${cell.x}, ${cell.y})`;
  const enemy = mode === 'attack' && Boolean(cell.ownerMemberId);
  const defenderUnit = cell.unitType ? UNIT_META[cell.unitType] : null;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>

        {mode === 'attack' ? (
          <>
            <p className="text-sm text-slate-600">
              {enemy
                ? `Enemy garrison: ${defenderUnit ? `${defenderUnit.glyph} ${defenderUnit.label}` : '—'} ×${cell.troopCount}`
                : 'Neutral cell — claim it for your colour.'}
            </p>

            {availableTypes.length === 0 ? (
              <p className="text-sm text-red-700">You have no units to deploy. Visit the shop first.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  {availableTypes.map(type => (
                    <button
                      key={type}
                      className={`flex-1 rounded border px-2 py-2 text-sm ${type === unitType ? 'border-blue-600 bg-blue-50' : 'border-slate-300'}`}
                      onClick={() => { setUnitType(type); setQuantity(q => Math.min(q, held(units, type))); }}
                      type="button"
                    >
                      <span className="text-base">{UNIT_META[type].glyph}</span>
                      <span className="ml-1">{UNIT_META[type].label}</span>
                      <span className="ml-1 text-slate-500">×{held(units, type)}</span>
                    </button>
                  ))}
                </div>

                {enemy && defenderUnit && (
                  <p className="text-xs text-slate-500">
                    {beats(unitType, cell.unitType)
                      ? `${UNIT_META[unitType].glyph} beats ${defenderUnit.glyph} — captures if quantity ≥ ${cell.troopCount}.`
                      : `${UNIT_META[unitType].glyph} does not beat ${defenderUnit.glyph} — this attack will be repelled.`}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <span className="text-sm">Quantity</span>
                  <Button variant="secondary" disabled={quantity <= 1} onClick={() => setQuantity(q => Math.max(1, q - 1))}>−</Button>
                  <span className="w-8 text-center font-semibold">{quantity}</span>
                  <Button variant="secondary" disabled={quantity >= maxQuantity} onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}>+</Button>
                  <span className="text-xs text-slate-500">/ {maxQuantity}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Reinforce {defenderUnit ? `${defenderUnit.glyph} ${defenderUnit.label}` : 'this cell'} (now ×{cell.troopCount}).
            You hold {held(units, cell.unitType)} matching unit{held(units, cell.unitType) === 1 ? '' : 's'}.
          </p>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={!canConfirm} onClick={confirm}>
            {mode === 'attack' ? 'Attack' : 'Reinforce'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
