import { useState } from 'react';
import { Shield, Users, Camera, AlertTriangle } from 'lucide-react';

const OnboardingModal = ({ onAccept }) => {
  const [checked, setChecked] = useState(false);

  // FIX: Open in new tab — navigating away loses the modal state
  // and the user returns to an unchecked modal after pressing back
  const openPage = (path) => window.open(path, '_blank');

  const handleAccept = () => {
    if (!checked) return;
    localStorage.setItem('hasSeenOnboarding', 'true');
    onAccept();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-[#111111] rounded-2xl max-w-md w-full border border-white/10 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#7c5cfc]/20 to-[#fc5c7d]/20 p-6 text-center border-b border-white/10">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7c5cfc] to-[#fc5c7d] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">👋</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>
            Welcome to Stumble Chat
          </h2>
          <p className="text-gray-400 text-sm">Before you start, here's what you need to know</p>
        </div>

        {/* Rules */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {[
            {
              icon: <Shield size={20} className="text-[#7c5cfc]" />,
              title: "You must be 18+",
              desc: "Stumble Chat is for adults only. Minors are not permitted."
            },
            {
              icon: <Users size={20} className="text-green-400" />,
              title: "Be respectful",
              desc: "Treat every stranger with kindness. Harassment and hate speech will result in a ban."
            },
            {
              icon: <Camera size={20} className="text-[#fc5c7d]" />,
              title: "No explicit content",
              desc: "Do not share explicit, offensive, or illegal photos or messages."
            },
            {
              icon: <AlertTriangle size={20} className="text-yellow-400" />,
              title: "Stay safe",
              desc: "Never share your real name, phone number, address, or financial details."
            },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex gap-4 items-start">
              <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                {icon}
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{title}</p>
                <p className="text-gray-400 text-xs leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Checkbox */}
        <div className="px-6 pb-4">
          <div className="flex items-start gap-3">
            {/* Standalone checkbox div — NOT inside a label so clicking
                the legal links doesn't accidentally toggle the checkbox */}
            <div
              role="checkbox"
              aria-checked={checked}
              tabIndex={0}
              onClick={() => setChecked(!checked)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setChecked(!checked); } }}
              data-testid="age-agree-checkbox"
              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border transition-all cursor-pointer ${
                checked
                  ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] border-transparent'
                  : 'border-white/30 bg-white/5 hover:border-white/50'
              }`}
            >
              {checked && <span className="text-white text-xs font-bold">✓</span>}
            </div>
            <span className="text-gray-300 text-sm leading-relaxed">
              I am 18 or older and I agree to the{' '}
              <button
                onClick={() => openPage('/terms')}
                className="text-[#7c5cfc] hover:underline"
              >
                Terms & Conditions
              </button>
              ,{' '}
              <button
                onClick={() => openPage('/privacy')}
                className="text-[#7c5cfc] hover:underline"
              >
                Privacy Policy
              </button>
              , and{' '}
              <button
                onClick={() => openPage('/guidelines')}
                className="text-[#7c5cfc] hover:underline"
              >
                Community Guidelines
              </button>
              .
            </span>
          </div>
        </div>

        {/* Button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleAccept}
            disabled={!checked}
            data-testid="age-confirm-btn"
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              checked
                ? 'bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] hover:shadow-lg hover:shadow-purple-500/20 text-white'
                : 'bg-white/10 text-gray-500 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            I Understand — Let's Chat
          </button>
        </div>

      </div>
    </div>
  );
};

export default OnboardingModal;
