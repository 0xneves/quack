import { useState } from 'react';

interface SetupScreenProps {
  onSetup: (password: string) => void;
  onSetupAndImport?: (password: string) => void;
}

type Step = 'welcome' | 'password';

function SetupScreen({ onSetup, onSetupAndImport }: SetupScreenProps) {
  const [step, setStep] = useState<Step>('welcome');
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

  // ============================================================================
  // STEP: Welcome Splash
  // ============================================================================
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-quack-500 to-quack-700 flex items-center justify-center p-4">
        <div className="flex flex-col items-center justify-center text-center">
          {/* Animated Logo - cycles through 3 colors */}
          <div className="relative w-36 h-36 mb-8">
            <img
              src="/svg/logo-quack-green.svg"
              alt=""
              className="absolute inset-0 w-full h-full object-contain animate-logo-cycle-1"
            />
            <img
              src="/svg/logo-quack-orange.png"
              alt=""
              className="absolute inset-0 w-full h-full object-contain animate-logo-cycle-2"
            />
            <img
              src="/svg/logo-quack-white.svg"
              alt="Quack Logo"
              className="absolute inset-0 w-full h-full object-contain animate-logo-cycle-3"
            />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome to the
          </h1>
          <h1 className="text-4xl font-bold text-white mb-12">
            Quack Nation!
          </h1>

          {/* Start Button */}
          <button
            onClick={() => setStep('password')}
            className="bg-white hover:bg-gray-100 text-quack-600 font-bold py-4 px-12 rounded-xl transition duration-200 transform hover:scale-105 shadow-lg"
          >
            Start →
          </button>
        </div>

        {/* CSS for logo color cycling animation
            Timeline (6 phases, each ~16.67%):
            0-16.67%: Green 100%
            16.67-33.33%: Green↓ Orange↑ (crossfade, meet at 50%/50%)
            33.33-50%: Orange 100%
            50-66.67%: Orange↓ White↑ (crossfade)
            66.67-83.33%: White 100%
            83.33-100%: White↓ Green↑ (crossfade)
        */}
        <style>{`
          @keyframes logoCycle1 {
            0%, 16.67% { opacity: 1; }
            33.33%, 83.33% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes logoCycle2 {
            0%, 16.67% { opacity: 0; }
            33.33%, 50% { opacity: 1; }
            66.67%, 100% { opacity: 0; }
          }
          @keyframes logoCycle3 {
            0%, 50% { opacity: 0; }
            66.67%, 83.33% { opacity: 1; }
            100% { opacity: 0; }
          }
          .animate-logo-cycle-1 {
            animation: logoCycle1 6s linear infinite;
          }
          .animate-logo-cycle-2 {
            animation: logoCycle2 6s linear infinite;
          }
          .animate-logo-cycle-3 {
            animation: logoCycle3 6s linear infinite;
          }
        `}</style>
      </div>
    );
  }

  // ============================================================================
  // STEP: Password Setup
  // ============================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-quack-500 to-quack-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-slide-up">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Create Master Password
          </h1>
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
              autoFocus
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

          {onSetupAndImport && (
            <button
              type="button"
              onClick={() => {
                setError('');
                if (password.length < 8) {
                  setError('Password must be at least 8 characters');
                  return;
                }
                if (password !== confirmPassword) {
                  setError('Passwords do not match');
                  return;
                }
                onSetupAndImport(password);
              }}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition duration-200"
            >
              📥 Restore from Backup
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default SetupScreen;

