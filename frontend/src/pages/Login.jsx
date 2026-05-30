import { useAuth } from '../components/AuthContext.jsx';
import '../App.css';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-3xl font-semibold mb-6">Welcome to Purrsuit</h1>
      <button 
        onClick={loginWithGoogle}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Sign in with Google
      </button>
    </div>
  );
}