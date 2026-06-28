import { createPortal } from 'react-dom';
import Button from './ui/Button.jsx';
import { formatStudy } from '../utils/time.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const CONFETTI_BASE = ['#fbbf24', '#f59e0b', '#fde68a', '#fb7185', '#34d399', '#60a5fa'];

function buildConfetti(rows) {
  const colours = [...CONFETTI_BASE, ...rows.map(row => row.colour).filter(Boolean)];
  return Array.from({ length: 20 }, (_, index) => ({
    left: (index * 9.7 + (index % 4) * 4) % 100,
    delay: (index % 7) * 0.28,
    duration: 2.2 + (index % 5) * 0.45,
    colour: colours[index % colours.length],
  }));
}

export default function SeasonEndOverlay({ winnerName, rows = [], me, onAck, acking = false, ackError = '' }) {
  const victory = Boolean(winnerName) && winnerName === me?.name;
  const placementIndex = rows.findIndex(row => row.userId === me?.userId);
  const placement = placementIndex >= 0 ? placementIndex + 1 : null;
  const total = rows.length;
  const confetti = victory ? buildConfetti(rows) : [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/85 p-4 backdrop-blur-sm">
      {victory && (
        <div aria-hidden="true" className="season-confetti pointer-events-none absolute inset-0">
          {confetti.map((piece, index) => (
            <span
              key={index}
              className="season-confetti-piece"
              style={{
                left: `${piece.left}%`,
                backgroundColor: piece.colour,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      <div
        aria-label="Season results"
        aria-modal="true"
        role="dialog"
        className="season-pop relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/5"
      >
        <div
          className={`relative overflow-hidden px-6 pb-7 pt-9 text-center text-white ${
            victory
              ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-orange-600'
              : 'bg-gradient-to-b from-slate-700 to-slate-900'
          }`}
        >
          {victory && (
            <div
              aria-hidden="true"
              className="season-spin pointer-events-none absolute left-1/2 top-[-30%] h-[180%] w-[180%] -translate-x-1/2 opacity-40"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.55) 0deg 8deg, transparent 8deg 22deg)',
                maskImage: 'radial-gradient(circle at center, black 0%, black 35%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 0%, black 35%, transparent 70%)',
              }}
            />
          )}

          <div className="relative">
            <div className={`text-7xl drop-shadow ${victory ? 'season-float' : ''}`} aria-hidden="true">
              {victory ? '🏆' : '🐾'}
            </div>
            <p
              className="season-rise mt-4 text-xs font-semibold uppercase tracking-[0.35em] text-white/80"
              style={{ animationDelay: '80ms' }}
            >
              {victory ? 'Champion' : 'Final Standings'}
            </p>
            <h2
              className="season-rise mt-1 text-4xl font-black uppercase tracking-tight"
              style={{ animationDelay: '160ms' }}
            >
              {victory ? 'Victory' : 'Season Over'}
            </h2>
            <p
              className="season-rise mx-auto mt-2 max-w-xs text-sm text-white/90"
              style={{ animationDelay: '240ms' }}
            >
              {victory
                ? 'You held the most territory this season.'
                : `${winnerName ?? 'Nobody'} claimed the crown.`}
            </p>
            {placement && (
              <p
                className="season-rise mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1 text-sm ring-1 ring-white/25 backdrop-blur"
                style={{ animationDelay: '320ms' }}
              >
                <span className="opacity-80">Your finish</span>
                <span className="font-bold">#{placement}</span>
                <span className="opacity-80">of {total}</span>
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4 p-6">
          {rows.length > 0 && (
            <ol className="space-y-1">
              {rows.map((row, index) => {
                const isMe = row.userId === me?.userId;
                return (
                  <li
                    key={row.userId}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      isMe ? 'bg-amber-50 ring-1 ring-amber-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-6 text-center text-base">
                      {MEDALS[index] ?? <span className="text-slate-400">{index + 1}</span>}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full shadow ring-2 ring-white"
                      style={{ backgroundColor: row.colour }}
                    />
                    <span className="flex-1 truncate font-medium text-slate-800">
                      {row.name}
                      {isMe && <span className="ml-1.5 text-xs font-semibold text-amber-600">you</span>}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-700">{row.territories}</span>
                    <span className="w-14 text-right text-xs tabular-nums text-slate-400">
                      {formatStudy(row.secondsStudied)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <Button autoFocus className="w-full justify-center font-semibold" onClick={onAck} disabled={acking}>
            {acking ? 'Returning…' : 'Back to realms'}
          </Button>
          {ackError && <p className="text-center text-sm text-red-700">{ackError}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
