import { useMemo, useState } from 'react';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import CatCircle from '../ui/CatCircle.jsx';
import Modal from '../ui/Modal.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';
import { UNIT_META, UNIT_ORDER } from '../units.js';
import { beats } from './mapModel.js';
import { mapService } from '../../services/index.js';

const FRIENDLY = {
  INSUFFICIENT_UNITS: 'You have no units! Buy some first.',
  NOT_ADJACENT: 'Only attack cells next to your territory.',
  INVALID_TARGET: 'That cell cannot be attacked :(',
  UNIT_TYPE_MISMATCH: 'Unit type mismatch!',
  NOT_OWNER: 'Bruh, only defend your own territory.',
};

// The verdict box borrows the status surfaces: green when your cat wins the
// matchup, red when it can't, blue when there is nothing to beat.
const VERDICT_TONE = {
  good: 'bg-good border-good-edge text-good-ink',
  bad: 'bg-bad border-bad-edge text-bad-ink',
  info: 'bg-info border-info-edge text-info-ink',
};

// The stepper keys are flat 38px squares, not pill buttons — no hard shadow.
const STEPPER = 'flex size-[38px] items-center justify-center rounded-[14px] border-3 border-edge bg-[#F1E4CB] font-display text-[19px] font-extrabold text-ink-body-soft disabled:cursor-not-allowed disabled:opacity-45';

function held(units, type) {
  return type ? (units?.[UNIT_META[type].key] ?? 0) : 0;
}

function choiceSkin(available, selected) {
  if (!available) return 'bg-[#F3EADA] border-[#EADCC0] cursor-not-allowed';
  if (selected) return 'bg-gold border-gold-edge';
  return 'bg-sunk border-edge-soft';
}

function Label({ children }) {
  return <p className="p-label text-[11px] tracking-[.08em]">{children}</p>;
}

/**
 * The deploy surface: a modal on Home, the docked 396px panel on Map. Both
 * spell the matchup out before the user commits — a wrong-type attack always
 * bounces, however many cats it sends — and both own the service call.
 */
export default function DeployModal({
  open,
  mode,
  cell,
  me,
  variant = 'modal',
  defenderName = '',
  onClose,
  onDeployed,
}) {
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

  const attacking = mode === 'attack';
  const maxQuantity = attacking ? held(units, unitType) : 1;
  const safeQuantity = Math.min(quantity, Math.max(1, maxQuantity));
  const canConfirm = !busy && (attacking ? maxQuantity >= 1 : held(units, cell.unitType) >= 1);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const result = attacking
        ? await mapService.attack({ x: cell.x, y: cell.y, unitType, quantity: Number(safeQuantity) })
        : await mapService.defend({ x: cell.x, y: cell.y, unitType: cell.unitType });
      // The intent rides along untouched beside the server payload so the board
      // can narrate what just happened ("MasterGooner doesn't beat Mr.Chonk").
      onDeployed(result, {
        mode,
        unitType: attacking ? unitType : cell.unitType,
        quantity: attacking ? Number(safeQuantity) : 1,
        target: cell,
      });
    } catch (caught) {
      setError(FRIENDLY[caught.code] ?? caught.message);
      setBusy(false);
    }
  }

  const title = `${attacking ? 'Attack' : 'Reinforce'} (${cell.x}, ${cell.y})`;
  const enemy = attacking && Boolean(cell.ownerMemberId);
  const defenderUnit = cell.unitType ? UNIT_META[cell.unitType] : null;
  const attackerUnit = UNIT_META[unitType];
  const defended = Boolean(enemy && defenderUnit);
  const beatsIt = defended && beats(unitType, cell.unitType);
  // The capture rule, exactly: an attack takes the cell when nothing defends
  // it, or when it wins the matchup and sends at least as many cats.
  const willCapture = !defended || (beatsIt && safeQuantity >= cell.troopCount);

  const subtitle = attacking
    ? (enemy
      ? (defenderName
        ? `${defenderName} holds this cell`
        : `Enemy holds ${defenderUnit ? defenderUnit.name : 'this cell'} × ${cell.troopCount}`)
      : 'Neutral land — nobody is defending')
    : 'Add another cat to a cell you already hold';

  let verdict = 'Reinforcing keeps this cell yours for longer.';
  let tone = 'info';
  if (attacking && !defended) {
    verdict = 'Neutral land — any cat claims it.';
  } else if (attacking && beatsIt) {
    verdict = `${attackerUnit.name} beats ${defenderUnit.name} — captures if you send ${cell.troopCount} or more.`;
    tone = 'good';
  } else if (attacking) {
    verdict = `${attackerUnit.name} does not beat ${defenderUnit.name} — this attack bounces, however many you send.`;
    tone = 'bad';
  }

  const showDefender = variant === 'panel' && defenderUnit && cell.ownerMemberId;

  const body = (
    <>
      <p className="font-display text-[24px] font-extrabold text-ink">{title}</p>
      <p className="mt-1 text-[13px] font-bold text-ink-muted">{subtitle}</p>

      {showDefender && (
        <div className="mt-[14px] flex items-center gap-[14px] rounded-[20px] border-2 border-edge-soft bg-sunk p-3">
          <PlayerAvatar colour={cell.colour} padding={4} size={52} unitType={cell.unitType} />
          <div>
            <Label>{attacking ? 'Defending' : 'Holding'}</Label>
            <p className="p-nums mt-px text-[17px] text-ink">{defenderUnit.name} × {cell.troopCount}</p>
          </div>
        </div>
      )}

      {attacking ? (
        <>
          <div className="mt-4 mb-2">
            <Label>Send your cats</Label>
          </div>
          <div className="flex gap-2">
            {UNIT_ORDER.map(type => {
              const owned = held(units, type);
              const available = owned >= 1;
              return (
                <button
                  aria-pressed={type === unitType}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-[18px] border-3 px-[6px] py-[10px] ${choiceSkin(available, type === unitType)}`}
                  disabled={!available}
                  key={type}
                  onClick={() => { setUnitType(type); setQuantity(q => Math.min(q, owned)); }}
                  type="button"
                >
                  <CatCircle border={0} padding={2} size={variant === 'panel' ? 42 : 40} unitType={type} />
                  <span className={`text-[10.5px] font-extrabold ${available ? 'text-ink-body-soft' : 'text-[#C6AC80]'}`}>
                    {UNIT_META[type].name}
                  </span>
                  <span className={`text-[10px] font-extrabold ${available ? 'text-ink-muted' : 'text-[#C6AC80]'}`}>
                    ×{owned}
                  </span>
                </button>
              );
            })}
          </div>

          <p className={`mt-[14px] rounded-[14px] border-2 px-[13px] py-[11px] text-[12.5px] font-extrabold ${VERDICT_TONE[tone]}`}>
            {verdict}
          </p>

          {availableTypes.length === 0 ? (
            <p className="mt-3 text-[12.5px] font-extrabold text-danger-ink">
              No cats held, visit the shop first!
            </p>
          ) : maxQuantity < 1 ? (
            <p className="mt-3 text-[12.5px] font-extrabold text-danger-ink">
              You hold no {attackerUnit.name} — pick a cat you have.
            </p>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-[12px] font-extrabold text-[#8A6234]">Send</span>
                <button
                  aria-label="Send one fewer"
                  className={STEPPER}
                  disabled={safeQuantity <= 1}
                  onClick={() => setQuantity(Math.max(1, safeQuantity - 1))}
                  type="button"
                >
                  −
                </button>
                <span className="p-nums w-[34px] text-center text-[24px] text-ink">{safeQuantity}</span>
                <button
                  aria-label="Send one more"
                  className={STEPPER}
                  disabled={safeQuantity >= maxQuantity}
                  onClick={() => setQuantity(Math.min(maxQuantity, safeQuantity + 1))}
                  type="button"
                >
                  +
                </button>
                <span className="text-[11.5px] font-extrabold text-ink-muted-soft">/ {maxQuantity}</span>
              </div>
              {defended && beatsIt && (
                <p className="mt-2 text-[11.5px] font-extrabold text-ink-muted">
                  {willCapture
                    ? 'That takes the cell.'
                    : `Send ${cell.troopCount} or more to take it — ${safeQuantity} only thins them out.`}
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <p className={`mt-[14px] rounded-[14px] border-2 px-[13px] py-[11px] text-[12.5px] font-extrabold ${VERDICT_TONE.info}`}>
            {verdict}
          </p>
          <p className="mt-2 text-[11.5px] font-extrabold text-ink-muted">
            Sends 1 {defenderUnit ? defenderUnit.name : 'cat'} — reinforcements match the cats already there.
            You hold {held(units, cell.unitType)}.
          </p>
          {held(units, cell.unitType) < 1 && (
            <p className="mt-2 text-[12.5px] font-extrabold text-danger-ink">
              You hold no {defenderUnit ? defenderUnit.name : 'cats'} — buy one in the shop first.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="p-danger mt-3 px-[13px] py-[11px] text-[12.5px] font-extrabold" role="alert">{error}</p>
      )}

      <div className="mt-5 flex gap-[10px]">
        <Button className="flex-1 bg-[#F1E4CB]" disabled={busy} onClick={onClose} variant="plain">
          Cancel
        </Button>
        <Button className="flex-1" disabled={!canConfirm} onClick={confirm} variant="gold">
          {attacking ? 'Attack' : 'Reinforce'}
        </Button>
      </div>
    </>
  );

  if (variant === 'panel') {
    return (
      <Card
        aria-label={title}
        className="w-[396px] flex-none border-4 border-edge-strong p-[22px] shadow-[0_10px_0_var(--color-edge)]"
        variant="panel"
      >
        {body}
      </Card>
    );
  }

  return (
    <Modal className="max-w-[430px]" onClose={onClose} open={open} title={title}>
      {body}
    </Modal>
  );
}
