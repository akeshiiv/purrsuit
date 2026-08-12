import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import EntryScreen from '../components/layout/EntryScreen.jsx';
import { DEFAULT_PLAYER_COLOUR, PLAYER_COLOURS } from '../components/playerColours.js';
import PlayerAvatar from '../components/settings/PlayerAvatar.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import { UNIT_META, UNIT_ORDER } from '../components/units.js';
import { profileService } from '../services/index.js';

const DECOR = [
  { id: 'gold', style: { left: -70, top: -40, width: 250, height: 250, background: 'rgba(242, 206, 126, 0.24)' } },
  { id: 'blue', style: { right: -60, bottom: -60, width: 280, height: 280, background: 'rgba(140, 199, 228, 0.22)' } },
];

const ART_GLOW = 'radial-gradient(circle at 50% 34%, #FFF6E4, #F5E2BE 70%, #EFD6A8)';

const CHIP_TONES = {
  blue: 'border-blue-edge bg-blue text-blue-ink shadow-[0_3px_0_var(--color-blue-shadow)]',
  gold: 'border-gold-edge bg-gold text-ink-body shadow-[0_3px_0_var(--color-gold-shadow)]',
};

const LOOP_ROWS = [
  {
    note: 'Every minute studied pays 4 coins. A 25-minute session is 100.',
    title: 'Run a focus session',
    tone: 'blue',
  },
  {
    note: '100 coins each. Your barracks holds six at a time.',
    title: 'Adopt a cat',
    tone: 'gold',
  },
  {
    note: 'Only tiles touching ground you already hold. Water and rock never move.',
    title: 'Send them at a tile',
    tone: 'gold',
  },
];

const FOCUS_BULLETS = [
  'You share your screen when a session starts. Frames are checked on your machine and thrown away.',
  'Nothing is uploaded, stored, or shown to anyone in your realm.',
];

function LoopSteps() {
  return (
    <ol className="mt-[26px] flex flex-col gap-3">
      {LOOP_ROWS.map((row, index) => (
        <li className="p-tile flex items-center gap-4 px-[18px] py-4 shadow-[0_5px_0_var(--color-warm)]" key={row.title}>
          <span
            aria-hidden="true"
            className={`flex size-[46px] flex-none items-center justify-center rounded-[16px] border-3 font-display text-[19px] font-extrabold ${CHIP_TONES[row.tone]}`}
          >
            {index + 1}
          </span>
          <div className="flex-1">
            <p className="font-display text-[19px] font-extrabold text-ink">{row.title}</p>
            <p className="mt-[2px] text-[13px] font-bold text-ink-muted">{row.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TypeCycle() {
  return (
    <>
      <div className="mt-[26px] flex items-center justify-between rounded-[26px] border-3 border-edge-soft bg-sunk px-5 py-[22px] shadow-[0_6px_0_var(--color-warm)]">
        {UNIT_ORDER.map((unitType, index) => (
          <div className="flex items-center gap-[14px]" key={unitType}>
            <div className="flex w-[104px] flex-col items-center gap-2">
              <CatCircle border={3} className="bg-raised!" padding={6} size={66} unitType={unitType} />
              <span className="text-center font-display text-[13.5px] leading-[1.15] font-extrabold text-ink">
                {UNIT_META[unitType].name}
              </span>
            </div>
            {index < UNIT_ORDER.length - 1 && (
              <span aria-hidden="true" className="font-display text-[22px] font-extrabold text-ink-link">
                &rsaquo;
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[12.5px] font-extrabold text-ink-muted-soft">
        &hellip;and Mr.Chonk beats MasterGooner, closing the loop.
      </p>
      <div className="p-info mt-[18px] rounded-[20px] px-[18px] py-4">
        <p className="text-[13.5px] font-extrabold text-pretty">
          Numbers matter too &mdash; send at least as many cats as the defender is holding, or the tile stays
          theirs.
        </p>
      </div>
    </>
  );
}

function FocusGuard() {
  return (
    <>
      <div className="p-info mt-6 flex flex-col gap-[11px] rounded-[22px] px-5 py-[18px]">
        <p className="font-display text-[18px] font-extrabold">Your screen never leaves your device</p>
        <ul className="flex flex-col gap-[11px]">
          {FOCUS_BULLETS.map(bullet => (
            <li className="flex items-start gap-[10px]" key={bullet}>
              <span aria-hidden="true" className="mt-[5px] size-[9px] flex-none rounded-full bg-info-ink" />
              <p className="text-[13.5px] font-bold text-pretty">{bullet}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="p-warn mt-[14px] rounded-[20px] px-[18px] py-4">
        <p className="text-[13.5px] font-extrabold text-pretty">
          If a distraction is spotted, the session ends early and pays nothing &mdash; no coins, no study time,
          no streak.
        </p>
      </div>
    </>
  );
}

function ColourStep({ colour, name, onPickColour, seed }) {
  return (
    <>
      <div aria-label="Board colour" className="mt-[26px] flex gap-[14px]" role="radiogroup">
        {PLAYER_COLOURS.map(swatch => {
          const selected = swatch.value === colour;
          return (
            <button
              aria-checked={selected}
              aria-label={swatch.name}
              className="size-[66px] cursor-pointer rounded-full"
              key={swatch.value}
              onClick={() => onPickColour(swatch.value)}
              role="radio"
              style={{
                background: swatch.value,
                border: selected ? '4px solid var(--color-ink)' : '3px solid var(--color-edge-soft)',
                boxShadow: selected
                  ? 'inset 0 0 0 3px var(--color-raised), 0 4px 0 var(--color-warm-deep)'
                  : '0 4px 0 var(--color-warm)',
              }}
              type="button"
            />
          );
        })}
      </div>

      <div className="p-tile mt-[26px] flex items-center gap-4 px-[18px] py-4 shadow-[0_5px_0_var(--color-warm)]">
        <PlayerAvatar border={3} colour={colour} padding={4} seed={seed} size={54} well="var(--color-sunk)" />
        <div className="flex-1">
          <p className="font-display text-[19px] font-extrabold text-ink">{name}</p>
          {/* Literal, not live counts: the tour only ever runs for a player who
              has just been dropped into their home corner with nothing else. */}
          <p className="mt-[2px] text-[12.5px] font-bold text-ink-muted">
            Your home corner is already yours &middot; 0 cats &middot; 0 coins
          </p>
        </div>
        <span className="p-chip p-chip-gold px-[14px] py-[7px] font-display text-[13px]">You</span>
      </div>

      <p className="mt-4 text-[12.5px] font-bold text-ink-muted-soft text-pretty">
        Name and colour are changeable any time in Settings.
      </p>
    </>
  );
}

// `intro` takes the realm name because step 4 names the realm the colour is
// being claimed in; the other three ignore it rather than splitting the shape.
const STEPS = [
  {
    Body: LoopSteps,
    caption: 'Adopt your first cat with the coins from one 25-minute session.',
    cat: 'A',
    heading: 'Study, adopt, take ground',
    intro: () => 'The whole loop is three moves. You’ll run it a few times a day.',
  },
  {
    Body: TypeCycle,
    caption: 'MasterGooner beats AlphaSigma67 beats Mr.Chonk.',
    cat: 'B',
    heading: 'Cats beat cats',
    intro: () => 'Three types, one cycle. Attack with the wrong type and you bounce, however many you send.',
  },
  {
    Body: FocusGuard,
    caption: 'Sessions are watched on your device, never anywhere else.',
    cat: 'C',
    heading: 'Focus Guard keeps it honest',
    intro: () => 'Coins only count when you’re actually studying, so sessions are checked while they run.',
  },
  {
    Body: ColourStep,
    caption: 'Your corner of the board is waiting.',
    cat: 'A',
    heading: 'Claim your colour',
    intro: realmName => `This is how your tiles read on the board for everyone in ${realmName}.`,
  },
];

const LAST_STEP = STEPS.length - 1;

// The design guarantees a swatch is always selected, so the player's stored
// colour only seeds the picker when it is one of the six. Settings keeps an
// off-palette colour alive as a seventh swatch because it is theirs and was
// chosen; here it would only render as six unselected circles above a CTA the
// design promises is never blocked.
function startingColour(stored) {
  const current = (stored ?? '').toLowerCase();
  return PLAYER_COLOURS.some(swatch => swatch.value === current) ? current : DEFAULT_PLAYER_COLOUR;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { me, realm } = useGame();
  const [step, setStep] = useState(0);
  const [colour, setColour] = useState(() => startingColour(me.colour));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const goTo = index => setStep(Math.min(LAST_STEP, Math.max(0, index)));

  async function handleStart() {
    setError('');
    setSubmitting(true);
    try {
      // One PATCH carries both fields: the flag is what stops the tour coming
      // back, and a colour saved without it would strand the player here.
      await profileService.update({ colour, hasOnboarded: true });
      navigate('/realm/study');
    } catch (caught) {
      // The design draws no failure here, but the write is a network call. Say
      // what happened and leave the button pressable rather than swallowing it.
      setError(caught.message);
      setSubmitting(false);
    }
  }

  const { Body, caption, cat, heading, intro } = STEPS[step];

  return (
    <EntryScreen className="flex-col" decor={DECOR}>
      <header className="flex items-center px-11 pt-[26px]">
        <h1 className="font-display text-[28px] font-extrabold text-ink">Purrsuit</h1>
        <div className="ml-auto flex items-center gap-[14px]">
          <span className="text-[12.5px] font-extrabold text-ink-muted-soft">
            {realm.name} &middot; {realm.joinCode}
          </span>
          {/* Skip lands on the colour step, not on Home: the tour is optional,
              the colour is the one thing this flow has to collect. */}
          <button
            className="p-pill cursor-pointer px-[18px] py-[9px] font-display text-[14px] font-extrabold text-ink-muted hover:text-gold-ink"
            onClick={() => goTo(LAST_STEP)}
            type="button"
          >
            Skip tour
          </button>
        </div>
      </header>

      <div className="flex flex-1 justify-center px-11 pt-[38px] pb-10">
        <Card
          className="flex h-[600px] w-[1120px] max-w-full overflow-hidden rounded-[38px] shadow-[0_14px_0_var(--color-warm-deep)]"
          variant="hero"
        >
          <div
            className="flex w-[420px] flex-none flex-col items-center justify-center gap-[22px] border-r-4 border-edge-soft p-9"
            style={{ background: ART_GLOW }}
          >
            <CatCircle
              bob
              border={5}
              className="border-edge-soft! bg-raised! shadow-[0_10px_0_#E4CDA2]"
              padding={20}
              size={260}
              unitType={cat}
            />
            <p className="max-w-[280px] text-center text-[13px] font-extrabold text-ink-muted text-pretty">
              {caption}
            </p>
          </div>

          <div className="flex flex-1 flex-col px-[46px] pt-11 pb-8">
            <p className="p-label text-[11px] tracking-[.14em]">Step {step + 1} of 4</p>
            <h2 className="mt-[9px] font-display text-[38px] leading-[1.08] font-extrabold text-ink">
              {heading}
            </h2>
            <p className="mt-[10px] text-[15px] font-bold text-ink-muted text-pretty">{intro(realm.name)}</p>

            <Body colour={colour} name={me.name} onPickColour={setColour} seed={me.userId} />

            {error && (
              <p className="p-danger mt-4 px-4 py-3 text-[12.5px] font-bold" role="alert">{error}</p>
            )}

            <div className="mt-auto flex items-center pt-6">
              <div className="flex items-center gap-2">
                {STEPS.map((item, index) => (
                  <button
                    aria-current={index === step ? 'step' : undefined}
                    aria-label={`Go to step ${index + 1}`}
                    className={`h-[11px] cursor-pointer rounded-full border-2 ${
                      index === step
                        ? 'w-[30px] border-gold-edge bg-gold'
                        : `w-[11px] border-edge-soft ${index < step ? 'bg-warm' : 'bg-sunk'}`
                    }`}
                    key={item.heading}
                    onClick={() => goTo(index)}
                    type="button"
                  />
                ))}
              </div>

              <div className="ml-auto flex items-center gap-3">
                {step > 0 && (
                  <button
                    className="cursor-pointer rounded-full border-3 border-edge-soft px-[26px] py-[14px] font-display text-[17px] font-extrabold text-ink-muted hover:text-gold-ink"
                    onClick={() => goTo(step - 1)}
                    type="button"
                  >
                    Back
                  </button>
                )}
                {step < LAST_STEP ? (
                  <Button onClick={() => goTo(step + 1)} size="lg" style={{ padding: '15px 40px' }} variant="gold">
                    Next
                  </Button>
                ) : (
                  <Button
                    disabled={submitting}
                    onClick={handleStart}
                    size="lg"
                    style={{ padding: '15px 34px' }}
                    variant="blue"
                  >
                    {submitting ? 'Starting…' : 'Start my first session'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </EntryScreen>
  );
}
