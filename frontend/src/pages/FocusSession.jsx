import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useGame } from '../components/GameContext.jsx';
import NightScreen from '../components/study/NightScreen.jsx';
import Button from '../components/ui/Button.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { COINS_PER_MINUTE } from '../components/units.js';
import { useBrainrotDoctor } from '../hooks/useBrainrotDoctor.js';
import { studyService } from '../services/index.js';

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Outlined, low-emphasis action on a night background — the way out of a
// session, never the thing the eye lands on first.
const GHOST_TONES = {
  warm: 'border-[rgba(246,231,204,.3)] text-[#E4CFA8] hover:bg-[rgba(246,231,204,.08)]',
  fail: 'border-[rgba(246,217,204,.32)] text-[#F0C8B8] hover:bg-[rgba(246,217,204,.08)]',
  cool: 'border-[rgba(220,235,246,.28)] text-[#B9D3E4] hover:bg-[rgba(220,235,246,.08)]',
};

function NightGhostButton({ children, className = '', style, tone = 'warm', ...props }) {
  return (
    <Button
      className={`bg-transparent shadow-none ${GHOST_TONES[tone] ?? GHOST_TONES.warm} ${className}`}
      style={{ padding: '13px 34px', fontSize: 17, ...style }}
      variant="plain"
      {...props}
    >
      {children}
    </Button>
  );
}

function NightBlueButton({ children, className = '', style, ...props }) {
  return (
    <Button
      className={`text-[#12314F] shadow-[0_5px_0_#416F9B] active:shadow-[0_2px_0_#416F9B] ${className}`}
      style={{ padding: '12px 28px', fontSize: 17, ...style }}
      variant="blue"
      {...props}
    >
      {children}
    </Button>
  );
}

function NightNote({ children, className = '', tone = 'warn', ...props }) {
  const tones = {
    warn: 'border-[rgba(233,200,127,.34)] bg-[rgba(233,200,127,.14)] text-gold',
    bad: 'border-[rgba(224,110,86,.32)] bg-[rgba(224,110,86,.14)] text-[#F0B3A0]',
  };
  return (
    <p
      className={`mt-[14px] rounded-[14px] border-2 px-[14px] py-[10px] text-[12.5px] font-extrabold text-pretty ${tones[tone] ?? tones.warn} ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

// What the guard is actually doing right now. The design draws the happy path —
// a live, watched, shared session — and this must never claim that when the
// share never started or the realm doesn't monitor at all.
function GuardStatusPill({ monitored, status }) {
  const watching = monitored && status !== 'running-uncredited';
  const label = monitored
    ? (status === 'running-uncredited'
      ? 'BrainrotDoctor couldn’t start · this session won’t earn coins'
      : 'BrainrotDoctor watching · screen shared')
    : 'BrainrotDoctor is off for this realm';

  return (
    <div className="flex items-center gap-[10px] rounded-full border-2 border-[rgba(246,231,204,.22)] bg-[rgba(246,231,204,.1)] px-[18px] py-2">
      <span
        aria-hidden="true"
        className={`block size-[11px] rounded-full ${watching ? 'p-pulse-dot bg-[#7ED09B]' : 'bg-[rgba(246,231,204,.45)]'}`}
      />
      <span className="text-[12.5px] font-extrabold tracking-[.12em] text-[#E4CFA8] uppercase">
        {label}
      </span>
    </div>
  );
}

export default function FocusSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const { realm, refresh } = useGame();
  const duration = location.state?.duration ?? null;
  const monitored = Boolean(realm?.antiCheatEnabled);

  // The server issues the session key when the countdown starts. The guard reads
  // it later — to burn the row when it kills a session — and nothing renders it,
  // so it lives in a ref rather than state.
  const sessionKeyRef = useRef(null);
  const getSessionKey = useCallback(() => sessionKeyRef.current, []);

  const totalSeconds = (duration ?? 25) * 60;
  const endTimeRef = useRef(null);

  // The countdown starts as soon as consent resolves, while the guard is still
  // loading its model. The guard schedules captures against whatever is left of
  // the countdown at that point, so it has to read this clock rather than assume
  // it owns a full session's worth of time. Null until the countdown anchors.
  const getRemainingMs = useCallback(
    () => (endTimeRef.current === null ? null : endTimeRef.current - Date.now()),
    [],
  );

  const guard = useBrainrotDoctor({
    enabled: monitored,
    durationMinutes: duration,
    getSessionKey,
    getRemainingMs,
  });
  const startPromiseRef = useRef(null);

  const [remaining, setRemaining] = useState(totalSeconds);
  const [phase, setPhase] = useState('running');
  const [reward, setReward] = useState(null);
  const [startError, setStartError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const finishedRef = useRef(false);
  const guardAbort = guard.abort;
  const onCountdownZero = guard.onCountdownZero;

  // Open the session server-side at the exact moment the countdown begins and no
  // earlier: on a monitored realm that is only once consent is granted, and a
  // clock started while the user still sits on the share prompt would hand out
  // elapsed time nobody studied for.
  const beginServerSession = useCallback(() => {
    if (startPromiseRef.current) return startPromiseRef.current;
    startPromiseRef.current = studyService.start({ durationMinutes: duration })
      .then((started) => { sessionKeyRef.current = started.sessionKey; })
      .catch((caught) => {
        // Without a key there are no coins at the end. Say so now instead of
        // letting someone sit through a countdown that could never pay out.
        setStartError(caught.message);
        guardAbort();
      });
    return startPromiseRef.current;
  }, [duration, guardAbort]);

  const finishSession = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('done');
    // Stop the share and settle the credit decision first — it waits on any
    // verdict still in flight, and holding the capture open past that is exactly
    // what the user asked to end.
    const mayCredit = monitored ? await onCountdownZero() : true;
    // The key can still be in flight: the dev skip button, and a slow enough
    // network on a short session, both get here before /start has answered.
    await startPromiseRef.current;
    if (!mayCredit) { setReward({ uncredited: true }); return; }
    if (!sessionKeyRef.current) {
      setReward({ error: 'This session was never registered, so it can’t be credited.' });
      return;
    }
    let result;
    try {
      result = await studyService.complete({ sessionKey: sessionKeyRef.current });
    } catch (caught) {
      setReward({ error: caught.message });
      return;
    }
    // Settle the reward from the response before anything else can fail. The
    // credit is already committed server-side by the time /complete answers —
    // coins, the sessions row and the status flip all land in one transaction —
    // so a shell refresh that trips afterwards must not be reported as "couldn't
    // record your session". It used to share this try/catch, and there is no
    // retry from that screen: the player was told they had lost coins they had
    // in fact been paid, and re-running the session earns nothing extra.
    setReward({
      coins: result.coins,
      gained: duration * COINS_PER_MINUTE,
      questCompleted: result.questCompleted ?? null,
    });
    refresh().catch(() => {});
  }, [duration, refresh, monitored, onCountdownZero]);

  useEffect(() => {
    // `duration` is null when this page is opened directly rather than from the
    // study picker; the render below redirects, but effects still run for that
    // commit and there is no session to open for a duration nobody chose.
    const countdownActive = duration != null && phase === 'running' && startError === null
      && (!monitored || (guard.status !== 'awaiting-consent' && guard.status !== 'terminated'));
    if (!countdownActive) return undefined;
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + totalSeconds * 1000;
      beginServerSession();
    }

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemaining(secondsLeft);
      if (secondsLeft === 0) finishSession();
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [beginServerSession, finishSession, duration, phase, totalSeconds, monitored, guard.status, startError]);

  if (duration == null) {
    return <Navigate replace to="/realm/study" />;
  }

  if (startError !== null) {
    return (
      <NightScreen tone="warm">
        <CatCircle
          className="border-[rgba(246,231,204,.35)] bg-surface [&>img]:opacity-85"
          size={120}
          tone="night"
          unitType="B"
        />
        <h1 className="mt-5 font-display text-[27px] font-extrabold text-night-display">
          Couldn&rsquo;t start your session
        </h1>
        <NightNote className="max-w-[320px]" role="alert" tone="bad">{startError}</NightNote>
        <p className="mt-3 max-w-[320px] text-[13.5px] font-bold text-night-muted text-pretty">
          Nothing was recorded, so nothing was lost. Start the session again.
        </p>
        <NightBlueButton className="mt-6" onClick={() => navigate('/realm/study')}>
          Back to study
        </NightBlueButton>
      </NightScreen>
    );
  }

  // Termination outranks the countdown reaching zero: a session the guard killed
  // pays nothing, and the user has to be told why rather than shown a reward
  // screen with the coins missing.
  if (guard.status === 'terminated') {
    return (
      <NightScreen tone="fail">
        <CatCircle
          className="border-[rgba(224,110,86,.6)] bg-surface [&>img]:opacity-80"
          size={120}
          tone="night"
          unitType="B"
        />
        <h1 className="mt-5 font-display text-[27px] font-extrabold text-[#FFD9CC]">
          Distraction detected
        </h1>
        {guard.verdict?.summary && (
          <p className="mt-[10px] max-w-[300px] text-[13.5px] font-bold text-[#D8A895] text-pretty">
            {guard.verdict.summary}
          </p>
        )}
        {guard.verdict?.justification && (
          <p className="mt-[6px] max-w-[300px] text-[12.5px] font-bold text-[#BF9382] text-pretty">
            {guard.verdict.justification}
          </p>
        )}
        <NightNote className="max-w-[300px]" tone="bad">
          Session ended early. No coins and no study time were earned.
        </NightNote>
        <NightGhostButton
          className="mt-6"
          onClick={() => navigate('/realm')}
          style={{ padding: '12px 28px' }}
          tone="fail"
        >
          Back to dashboard
        </NightGhostButton>
      </NightScreen>
    );
  }

  if (monitored && guard.status === 'awaiting-consent') {
    return (
      <NightScreen tone="cool">
        <CatCircle
          className="border-dashed border-[rgba(140,199,228,.6)] bg-[#F4FAFD] [&>img]:opacity-85"
          size={120}
          tone="night"
          unitType="C"
        />
        <h1 className="mt-5 font-display text-[26px] font-extrabold text-[#EAF6FF]">
          Share your screen to earn
        </h1>
        <p className="mt-[10px] max-w-[320px] text-[13.5px] font-bold text-[#9FBDD2] text-pretty">
          This realm checks your screen on-device for distractions. Nothing leaves your computer.
        </p>
        <p className="mt-2 max-w-[320px] text-[12.5px] font-bold text-[#7E9EB4] text-pretty">
          Sharing is required to earn coins. If a distraction is detected the session ends early
          and pays nothing: no coins, no study time.
        </p>
        <NightBlueButton
          className="mt-[22px]"
          onClick={guard.consent}
          style={{ padding: '13px 30px', fontSize: 18 }}
        >
          Share screen &amp; start
        </NightBlueButton>
        <NightGhostButton
          className="mt-3"
          onClick={() => navigate('/realm')}
          style={{ padding: '10px 24px', fontSize: 15 }}
          tone="cool"
        >
          Cancel
        </NightGhostButton>
      </NightScreen>
    );
  }

  if (phase === 'done') {
    const paid = reward !== null && !reward.error && !reward.uncredited;
    return (
      <NightScreen tone="warm">
        {reward === null ? (
          // Both the last verdict and the /complete round trip land here, so this
          // is a real wait, not a flash — never show a reward that isn't settled.
          <>
            <CatCircle
              bob
              className="border-[rgba(242,206,126,.65)] bg-raised"
              size={120}
              tone="night"
              unitType="A"
            />
            <h1 className="mt-5 font-display text-[30px] font-extrabold text-night-display">
              Wrapping up your session&hellip;
            </h1>
          </>
        ) : reward.error ? (
          <>
            <CatCircle
              className="border-[rgba(246,231,204,.35)] bg-surface [&>img]:opacity-80"
              size={120}
              tone="night"
              unitType="B"
            />
            <h1 className="mt-5 font-display text-[27px] font-extrabold text-night-display">
              Couldn&rsquo;t record your session
            </h1>
            <NightNote className="max-w-[320px]" role="alert" tone="bad">{reward.error}</NightNote>
          </>
        ) : reward.uncredited ? (
          <>
            <CatCircle
              className="border-[rgba(246,231,204,.35)] bg-surface [&>img]:opacity-80"
              size={120}
              tone="night"
              unitType="A"
            />
            <h1 className="mt-5 font-display text-[30px] font-extrabold text-night-display">
              Session complete
            </h1>
            <NightNote className="max-w-[320px]">
              No coins were earned. BrainrotDoctor couldn&rsquo;t verify this session.
            </NightNote>
          </>
        ) : (
          <>
            <CatCircle
              bob
              className="border-[rgba(242,206,126,.65)] bg-raised"
              size={120}
              tone="night"
              unitType="A"
            />
            <h1 className="mt-5 font-display text-[30px] font-extrabold text-night-display">
              Session complete!
            </h1>
            <p className="p-nums mt-[14px] rounded-full border-3 border-[#C08D45] bg-gold px-[22px] py-[9px] text-[26px] text-ink">
              +{reward.gained} coins
            </p>
            <p className="mt-3 text-[14px] font-bold text-night-muted">
              Balance: {reward.coins} coins
            </p>
            {reward.questCompleted && (
              <p className="mt-[10px] rounded-[14px] border-2 border-[rgba(242,206,126,.3)] bg-[rgba(242,206,126,.14)] px-4 py-2 text-[12.5px] font-extrabold text-gold">
                Quest complete! +{reward.questCompleted.reward} coins · {reward.questCompleted.title}
              </p>
            )}
          </>
        )}

        {paid ? (
          <NightBlueButton className="mt-6" onClick={() => navigate('/realm')}>
            Back to the map
          </NightBlueButton>
        ) : (
          <NightGhostButton
            className="mt-6"
            onClick={() => navigate('/realm')}
            style={{ padding: '12px 28px' }}
          >
            Back to dashboard
          </NightGhostButton>
        )}
      </NightScreen>
    );
  }

  const elapsedPercent = Math.min(100, Math.max(0, ((totalSeconds - remaining) / totalSeconds) * 100));

  return (
    <NightScreen tone="warm">
      <GuardStatusPill monitored={monitored} status={guard.status} />

      <p className="p-nums mt-[34px] text-[170px] leading-none tracking-[.02em] text-night-display">
        {formatTime(remaining)}
      </p>
      <p className="mt-2 text-[17px] font-bold text-night-muted">
        until you earn <span className="font-extrabold text-gold">{duration * COINS_PER_MINUTE} coins</span>
      </p>

      <div className="mt-9 h-4 w-[520px] overflow-hidden rounded-full bg-[rgba(246,231,204,.14)]">
        <div
          className="h-full rounded-full bg-linear-to-r from-gold-pale to-gold-deep transition-[width] duration-200 ease-linear"
          style={{ width: `${elapsedPercent}%` }}
        />
      </div>

      <CatCircle
        bob
        className="mt-11 border-dashed border-[rgba(246,231,204,.5)] bg-surface [&>img]:opacity-85"
        size={150}
        tone="night"
        unitType="A"
      />

      <NightGhostButton className="mt-10" onClick={() => setDialogOpen(true)}>
        Cancel session
      </NightGhostButton>

      {import.meta.env.DEV && (
        <button
          className="mt-4 text-[12px] font-bold text-[rgba(246,231,204,.45)] underline"
          onClick={finishSession}
          type="button"
        >
          dev: skip to end
        </button>
      )}

      <ConfirmDialog
        confirmLabel="Cancel focus"
        message="Cancel this focus session?"
        onClose={() => setDialogOpen(false)}
        onConfirm={() => navigate('/realm')}
        open={dialogOpen}
        secondConfirmLabel="Forfeit coins"
        secondMessage="You will not earn any coins for this session."
        secondTitle="Forfeit reward"
        title="Cancel focus"
      />
    </NightScreen>
  );
}
