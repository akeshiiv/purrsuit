import { useSearchParams } from 'react-router';
import { useAuth } from '../components/AuthContext.jsx';
import EntryScreen from '../components/layout/EntryScreen.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import CatCircle from '../components/ui/CatCircle.jsx';

// The OAuth callback rejects a login whose `state` nonce is missing, expired, or
// forged, and bounces back here with ?error=oauth_state. Without this the
// rejection is invisible — the user lands on the login screen again with no idea
// why — and a stale browser tab left open past the nonce's ten minutes looks
// identical to a broken sign-in button.
const ERROR_MESSAGES = {
  oauth_state: 'That sign-in attempt expired or could not be verified. Please try again.',
};

// The design ships a grey disc as a placeholder for the provider mark; this is
// the real one, at the same 20px.
function GoogleMark() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 48 48" width="20">
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19A23.94 23.94 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const [searchParams] = useSearchParams();
  const errorMessage = ERROR_MESSAGES[searchParams.get('error')] ?? null;

  return (
    <EntryScreen className="flex-wrap items-center justify-center gap-[70px] px-10 py-10">
      <div className="flex flex-col items-center">
        <div className="flex items-end gap-2">
          <CatCircle border={3} padding={10} size={150} tone="default" unitType="C" />
          <CatCircle bob border={4} padding={12} size={190} tone="gold" unitType="A" />
          <CatCircle border={3} padding={10} size={150} tone="blue" unitType="B" />
        </div>
        <h1 className="mt-[34px] font-display text-[64px] leading-none font-extrabold text-ink">Purrsuit</h1>
        <p className="mt-[10px] max-w-[430px] text-center text-[16px] font-bold text-ink-muted [text-wrap:pretty]">
          Study to earn cats. Send cats to take ground. Whoever focuses most owns the map when the season ends.
        </p>
      </div>

      <Card className="w-[420px] max-w-full px-8 py-9" variant="hero">
        <h2 className="font-display text-[26px] font-extrabold text-ink">Welcome back</h2>
        <p className="mt-[5px] text-[13.5px] font-bold text-ink-muted">
          Sign in to pick up your season where you left off.
        </p>

        {errorMessage && (
          <p className="p-danger mt-[18px] px-4 py-3 text-[12.5px] font-bold" role="alert">
            {errorMessage}
          </p>
        )}

        <Button
          className="mt-[26px]"
          full
          onClick={loginWithGoogle}
          style={{ padding: '16px', fontSize: '18px' }}
          variant="white"
        >
          <GoogleMark />
          Sign in with Google
        </Button>

        <p className="mt-[26px] text-[11.5px] font-bold text-ink-muted-soft [text-wrap:pretty]">
          New here? Signing in makes an account. You&rsquo;ll pick or create a realm next.
        </p>
      </Card>
    </EntryScreen>
  );
}
