import { createPortal } from 'react-dom';
import Button from './ui/Button.jsx';
import { catArt } from './cats.js';
import { formatStudy } from '../utils/time.js';

// 18 strips in the design's six confetti colours. Fixed at module scope: the
// pattern is decoration, so it must not re-shuffle on every render.
const CONFETTI_COLOURS = ['#F2CE7E', '#E9A62C', '#8CC7E4', '#E88A7D', '#7ED09B', '#C99C55'];
const CONFETTI = Array.from({ length: 18 }, (_, index) => ({
  left: `${(index * 9.7 + (index % 4) * 4) % 100}%`,
  colour: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length],
  animation: `fall ${(2.4 + (index % 5) * 0.5).toFixed(2)}s linear ${((index % 7) * 0.32).toFixed(2)}s infinite`,
}));

// The two faces of the card. Only the crest, the eyebrow, the headline and the
// banner gradient differ — the card, the standings and the CTA are shared.
const VICTORY = {
  crest: 'A',
  eyebrow: 'Champion',
  headline: 'Victory!',
  banner: 'linear-gradient(#F5D68C,#E9A62C 60%,#D98B1E)',
};
const DEFEAT = {
  crest: 'C',
  eyebrow: 'Final standings',
  headline: 'Season over',
  banner: 'linear-gradient(#F5EDDD,#E0C89E 60%,#C99C55)',
};

const CATS = ['A', 'B', 'C'];

// Standings rows carry no avatar art, so a player's cat is derived from their id
// — stable for a given player rather than random per render.
function catFor(userId) {
  const text = String(userId ?? '');
  let sum = 0;
  for (let index = 0; index < text.length; index += 1) sum += text.charCodeAt(index);
  return CATS[sum % CATS.length];
}

export default function SeasonEndOverlay({ winnerName, rows = [], me, onAck, acking = false, ackError = '' }) {
  const victory = Boolean(winnerName) && winnerName === me?.name;
  const placementIndex = rows.findIndex(row => row.userId === me?.userId);
  const placement = placementIndex >= 0 ? placementIndex + 1 : null;
  const total = rows.length;
  const face = victory ? VICTORY : DEFEAT;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[rgba(36,24,9,.93)] p-4 font-body">
      {victory && (
        <div aria-hidden="true" className="season-confetti pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              className="absolute top-[-16px] block h-4 w-[9px] rounded-[2px]"
              style={{ left: piece.left, backgroundColor: piece.colour, animation: piece.animation }}
            />
          ))}
        </div>
      )}

      <div
        aria-label="Season results"
        aria-modal="true"
        role="dialog"
        className="season-pop relative w-[520px] max-w-full overflow-hidden rounded-[36px] border-[5px] border-edge-strong bg-surface shadow-[0_20px_0_#A9793A,0_40px_80px_-20px_rgba(0,0,0,.6)]"
      >
        <div className="px-[30px] pt-[34px] pb-[30px] text-center" style={{ background: face.banner }}>
          <div className="p-cat-well mx-auto size-[130px] border-4 border-gold-edge bg-raised">
            <img alt="" className="p-cat-art p-bob" src={catArt(face.crest)} />
          </div>
          <p
            className="season-rise mt-4 text-[12px] font-extrabold tracking-[.32em] text-gold-ink uppercase"
            style={{ animationDelay: '80ms' }}
          >
            {face.eyebrow}
          </p>
          <p
            className="season-rise mt-1 font-display text-[52px] leading-none font-extrabold text-ink"
            style={{ animationDelay: '160ms' }}
          >
            {face.headline}
          </p>
          <p
            className="season-rise mt-[10px] text-[14.5px] font-bold text-gold-ink"
            style={{ animationDelay: '240ms' }}
          >
            {victory
              ? 'Congrats — you were the most locked in this season.'
              : winnerName
                ? `${winnerName} took this one. Your cats fought well.`
                : 'Nobody claimed this season. Your cats fought well.'}
          </p>
          {placement && (
            <p
              className="season-rise mt-4 inline-block rounded-full border-2 border-[#C08D45] bg-[rgba(255,248,234,.65)] px-[18px] py-[7px] text-[13px] font-extrabold text-ink-body"
              style={{ animationDelay: '320ms' }}
            >
              You placed #{placement} of {total}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5 pt-[18px] pb-[22px]">
          {rows.map((row, index) => (
            <div
              key={row.userId}
              className={`flex items-center gap-[11px] rounded-2xl border-2 px-3 py-[9px] ${
                index === 0 ? 'border-[#DDB264] bg-[#F7DFA8]' : 'border-[#EFE3CD] bg-muted'
              }`}
            >
              <span className="w-4 font-display text-[16px] font-extrabold text-[#8A6234]">{index + 1}</span>
              <span
                className="p-cat-well size-8 flex-none border-2 bg-[#EFE0C2]"
                style={{ borderColor: row.colour }}
              >
                <img alt="" className="p-cat-art p-[2px]" src={catArt(catFor(row.userId))} />
              </span>
              <span className="flex-1 truncate font-display text-[16px] font-extrabold text-ink">{row.name}</span>
              <span className="p-nums text-[16px] text-ink-body-soft">{row.territories}</span>
              <span className="w-[58px] text-right text-[11.5px] font-extrabold text-ink-muted-soft">
                {formatStudy(row.secondsStudied)}
              </span>
            </div>
          ))}

          <Button
            autoFocus
            className="mt-2"
            disabled={acking}
            full
            onClick={onAck}
            size="lg"
            variant="gold"
          >
            {acking ? 'Returning…' : 'Back to realms'}
          </Button>
          {ackError && (
            <p className="text-center text-[13px] font-bold text-danger-ink" role="alert">
              {ackError}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
