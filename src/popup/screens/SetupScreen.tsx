import { useState } from 'react';

interface SetupScreenProps {
  onSetup: (password: string) => void;
}

function SetupScreen({ onSetup }: SetupScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    onSetup(password);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-quack-500 to-quack-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🦆</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Quack!
          </h1>
          <p className="text-gray-600">
            Create a master password to secure your encryption keys
          </p>
        </div>

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
              placeholder="Enter master password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
              placeholder="Confirm master password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="text-yellow-700 text-sm">
                <p className="font-bold mb-1">⚠️ Important</p>
                <p>
                  Your master password <strong>cannot be recovered</strong> if lost.
                  All encryption keys will be permanently inaccessible.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105"
          >
            Create Vault
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetupScreen;

