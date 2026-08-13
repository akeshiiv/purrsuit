import EntryScreen from './layout/EntryScreen.jsx';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import CatCircle from './ui/CatCircle.jsx';

/**
 * Shown when the start-up session check could not be answered — a 429 from a
 * rate limiter, a 5xx from a backend still waking up, or a request that never
 * completed at all.
 *
 * It exists so that outcome has somewhere to land other than the sign-in screen.
 * A player holding a perfectly good cookie who is shown "Welcome back" has been
 * told something false about their account, and the only move it offers them is
 * to sign in again — which is the one thing that cannot help, because nothing
 * was ever wrong with their session.
 *
 * Retry is a reload rather than a re-run of the check in place: this screen is
 * the whole of what is mounted at this point, so there is no work to preserve,
 * and a reload starts the app from the same clean state a manual refresh would.
 */
export default function SessionUnavailable() {
  return (
    <EntryScreen className="flex-wrap items-center justify-center px-10 py-10">
      <Card className="w-[440px] max-w-full px-8 py-9 text-center" variant="hero">
        <div className="flex justify-center">
          <CatCircle border={3} padding={10} size={120} tone="default" unitType="C" />
        </div>

        <h1 className="mt-[26px] font-display text-[26px] font-extrabold text-ink">
          Can&rsquo;t reach Purrsuit
        </h1>
        <p className="mt-[8px] text-[13.5px] font-bold text-ink-muted [text-wrap:pretty]">
          We couldn&rsquo;t check your session just now. Your account is fine &mdash; this is on our
          side, or on the connection in between.
        </p>

        <Button className="mt-[26px]" full onClick={() => window.location.reload()} size="lg">
          Try again
        </Button>

        <p className="mt-[22px] text-[11.5px] font-bold text-ink-muted-soft [text-wrap:pretty]">
          Still stuck after a few tries? Give it a minute &mdash; the server may be waking up.
        </p>
      </Card>
    </EntryScreen>
  );
}
