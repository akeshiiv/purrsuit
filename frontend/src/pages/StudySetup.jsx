import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import Screen from '../components/layout/Screen.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import CircularSlider from '../components/ui/CircularSlider.jsx';
import { COINS_PER_MINUTE } from '../components/units.js';
import CoinPill from '../components/ui/CoinPill.jsx';

const PRESETS = [25, 50, 60];
const MIN_MINUTES = 5;
const MAX_MINUTES = 120;
const STEP_MINUTES = 5;

function PresetPill({ active, minutes, onSelect }) {
  return (
    <Button
      aria-pressed={active}
      className={
        active
          ? 'shadow-[0_4px_0_var(--color-gold-shadow)] active:shadow-[0_1px_0_var(--color-gold-shadow)]'
          : 'border-edge-soft bg-sunk text-ink-muted shadow-[0_4px_0_var(--color-warm)] active:shadow-[0_1px_0_var(--color-warm)]'
      }
      onClick={() => onSelect(minutes)}
      style={{ padding: '11px 22px', fontSize: 17 }}
      variant={active ? 'gold' : 'plain'}
    >
      {minutes} min
    </Button>
  );
}

function StepButton({ children, disabled, label, onClick }) {
  return (
    <Button
      aria-label={label}
      className="size-[46px] rounded-[16px] bg-[#F1E4CB] text-ink-body-soft shadow-[0_4px_0_var(--color-warm)] active:shadow-[0_1px_0_var(--color-warm)]"
      disabled={disabled}
      onClick={onClick}
      style={{ padding: 0, fontSize: 22 }}
      variant="plain"
    >
      {children}
    </Button>
  );
}

export default function StudySetup() {
  const navigate = useNavigate();
  const { me, realm } = useGame();
  const [duration, setDuration] = useState(25);

  // The server decides whether another session is allowed; never recompute the
  // gate from coins on the client.
  const canStudy = me.actions?.canStudy ?? true;
  const reward = duration * COINS_PER_MINUTE;

  const nudge = delta =>
    setDuration(current => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, current + delta)));

  return (
    <Screen bodyClassName="flex items-center justify-center" right={<CoinPill coins={me?.coins} />}>
      <div className="mx-auto flex w-full max-w-[1372px] items-center justify-center gap-[44px]">
        <Card className="flex w-[520px] flex-col items-center px-[34px] py-8" variant="hero">
          <h1 className="font-display text-[30px] font-extrabold text-ink">
            How long are we locking in?
          </h1>
          <p className="mt-[6px] text-[14px] font-extrabold text-ink-muted">
            1 minute studied = {COINS_PER_MINUTE} coins earned
          </p>

          <div className="mt-[26px]">
            <CircularSlider
              max={MAX_MINUTES}
              min={MIN_MINUTES}
              onChange={setDuration}
              step={STEP_MINUTES}
              value={duration}
            />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <StepButton
              disabled={duration <= MIN_MINUTES}
              label={`Shorten the session by ${STEP_MINUTES} minutes`}
              onClick={() => nudge(-STEP_MINUTES)}
            >
              −
            </StepButton>
            {PRESETS.map(preset => (
              <PresetPill
                active={duration === preset}
                key={preset}
                minutes={preset}
                onSelect={setDuration}
              />
            ))}
            <StepButton
              disabled={duration >= MAX_MINUTES}
              label={`Lengthen the session by ${STEP_MINUTES} minutes`}
              onClick={() => nudge(STEP_MINUTES)}
            >
              +
            </StepButton>
          </div>

          <div className="mt-6 flex w-full items-center gap-3 rounded-[20px] border-2 border-edge-soft bg-sunk px-[18px] py-[14px]">
            <span
              aria-hidden="true"
              className="block size-[30px] flex-none rounded-full border-2 border-[#C08D45] bg-gold"
            />
            <span className="text-[14px] font-extrabold text-[#8A6234]">You&rsquo;ll earn</span>
            <span className="p-nums ml-auto text-[26px] text-ink">{reward} coins</span>
          </div>

          {canStudy ? (
            <Button
              className="mt-[18px] shadow-[0_6px_0_var(--color-blue-shadow)] active:shadow-[0_2px_0_var(--color-blue-shadow)]"
              full
              onClick={() => navigate('/realm/study/focus', { state: { duration } })}
              style={{ padding: 17, fontSize: 24 }}
              variant="blue"
            >
              Start focus
            </Button>
          ) : (
            // The server says this player has to spend before studying again, so
            // the start CTA is replaced by the way out of it rather than sitting
            // there disabled with the reason hidden in a tooltip.
            <div className="p-warn mt-[18px] w-full rounded-[22px] px-[18px] py-4 shadow-[0_6px_0_#F0DCAC]">
              <p className="font-display text-[16px] font-extrabold text-warn-ink">
                You&rsquo;re too rich!
              </p>
              <p className="mt-[5px] text-[12.5px] font-bold text-[#A9803A]">
                Spend some coins in the shop before your next session.{' '}
                <Link className="font-extrabold text-ink-link underline" to="/realm/shop">
                  Fine, I&rsquo;ll shop →
                </Link>
              </p>
            </div>
          )}
        </Card>

        <aside className="flex w-[330px] flex-col gap-4">
          <div className="flex flex-col items-center rounded-card border-3 border-edge bg-linear-to-b from-surface to-[#F4E4C8] p-5 shadow-[0_6px_0_var(--color-warm)]">
            <CatCircle bob padding={10} size={150} tone="dashed" unitType="C" />
            <p className="mt-3 font-display text-[19px] font-extrabold text-ink">
              Mr.Chonk is watching
            </p>
            <p className="mt-[3px] text-center text-[12.5px] font-bold text-ink-muted text-pretty">
              Leave the tab and he&rsquo;ll know. Finish the session and he&rsquo;ll pay up.
            </p>
          </div>

          {realm?.antiCheatEnabled && (
            <div className="p-info rounded-[22px] px-[18px] py-4 shadow-[0_6px_0_#D3E8F4]">
              <h2 className="font-display text-[16px] font-extrabold text-[#2F5F82]">
                BrainrotDoctor is on
              </h2>
              <p className="mt-[5px] text-[12.5px] font-bold text-[#4F7EA0] text-pretty">
                You&rsquo;ll be asked to share your screen. It&rsquo;s checked on-device for
                distractions. Nothing leaves your computer, and it&rsquo;s required to earn coins
                this session.
              </p>
            </div>
          )}
        </aside>
      </div>
    </Screen>
  );
}
