import { useState } from 'react';

interface LoginScreenProps {
  onLogin: (password: string) => void;
  /** Optional message to display (e.g., "Session expired due to inactivity") */
  message?: string;
}

function LoginScreen({ onLogin, message }: LoginScreenProps) {
  const [password, setPassword] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onLogin(password);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-quack-500 to-quack-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <img 
            src="/svg/logo-quack-green.svg" 
            alt="Quack" 
            className="w-24 h-24 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Quack
          </h1>
          <p className="text-gray-600">
            Enter your master password to unlock
          </p>
        </div>

        {message && (
          <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <p className="text-orange-700 text-sm font-medium">{message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
              placeholder="Enter your password"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105"
          >
            Unlock Vault
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginScreen;

