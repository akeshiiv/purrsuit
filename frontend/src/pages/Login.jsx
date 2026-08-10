import { useSearchParams } from 'react-router';
import { useAuth } from '../components/AuthContext.jsx';
import '../App.css';

// The OAuth callback rejects a login whose `state` nonce is missing, expired, or
// forged, and bounces back here with ?error=oauth_state. Without this the
// rejection is invisible — the user lands on the login screen again with no idea
// why — and a stale browser tab left open past the nonce's ten minutes looks
// identical to a broken sign-in button.
const ERROR_MESSAGES = {
  oauth_state: 'That sign-in attempt expired or could not be verified. Please try again.',
};

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const [searchParams] = useSearchParams();
  const errorMessage = ERROR_MESSAGES[searchParams.get('error')] ?? null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-3xl font-semibold mb-6">Welcome to Purrsuit</h1>
      {errorMessage && (
        <p role="alert" className="mb-4 max-w-sm text-center text-sm text-red-600">
          {errorMessage}
        </p>
      )}
      <button
        onClick={loginWithGoogle}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Sign in with Google
      </button>
    </div>
  );
}