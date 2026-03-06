import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Guidelines = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <header className="p-6 flex items-center gap-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Community Guidelines</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        <p className="text-gray-400 text-sm">Last updated: March 2026</p>

        <div className="bg-gradient-to-r from-[#7c5cfc]/20 to-[#fc5c7d]/20 rounded-2xl p-6 border border-white/10">
          <p className="text-white leading-relaxed text-center">
            Stumble Chat is a place to meet new people and have genuine conversations.
            Keep it respectful, keep it fun, and keep it safe.
          </p>
        </div>

        {/* DO's */}
        <div>
          <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm">✓</span>
            What's Welcome
          </h2>
          <div className="space-y-3">
            {[
              { emoji: "💬", title: "Genuine conversations", desc: "Talk about anything — movies, music, life, ideas. Real conversations are what Stumble Chat is for." },
              { emoji: "🤝", title: "Respect", desc: "Treat every stranger the way you'd want to be treated. Kindness goes a long way." },
              { emoji: "😄", title: "Humour and fun", desc: "Jokes, banter, and light-hearted chat are welcome. Just make sure both sides are enjoying it." },
              { emoji: "🌍", title: "Cultural curiosity", desc: "Meeting people from different cities and backgrounds is the whole point. Be curious, not judgmental." },
              { emoji: "🚪", title: "Leaving freely", desc: "If a chat isn't working for you, use Skip or Disconnect without guilt. No explanation needed." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="flex gap-4 bg-white/5 rounded-xl p-4">
                <span className="text-2xl flex-shrink-0">{emoji}</span>
                <div>
                  <p className="font-semibold text-white text-sm mb-1">{title}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* DON'Ts */}
        <div>
          <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-sm">✕</span>
            What's Not Allowed
          </h2>
          <div className="space-y-3">
            {[
              { emoji: "🚫", title: "Explicit or sexual content", desc: "Do not share, request, or describe sexually explicit content. This includes photos, messages, and suggestions. Zero tolerance." },
              { emoji: "👶", title: "Content involving minors", desc: "Any content that sexualises or exploits minors will result in an immediate permanent ban and may be reported to authorities." },
              { emoji: "😡", title: "Harassment and threats", desc: "Personal attacks, threats, hate speech, or targeted harassment of any kind are not allowed." },
              { emoji: "🧠", title: "Hate speech", desc: "Content that discriminates or attacks based on race, religion, gender, sexual orientation, nationality, or disability is prohibited." },
              { emoji: "📸", title: "Non-consensual photos", desc: "Never share photos of others without their consent. Screenshots of chats shared publicly are a serious violation." },
              { emoji: "🎭", title: "Impersonation", desc: "Do not pretend to be someone else — a celebrity, another user, or a Stumble Chat staff member." },
              { emoji: "📢", title: "Spam and promotion", desc: "No advertising, promoting services, or sending repetitive unsolicited messages." },
              { emoji: "🔗", title: "Phishing and scams", desc: "Do not share links designed to steal information, ask for money, or run any kind of scam." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="flex gap-4 bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                <span className="text-2xl flex-shrink-0">{emoji}</span>
                <div>
                  <p className="font-semibold text-white text-sm mb-1">{title}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reporting */}
        <div>
          <h2 className="text-lg font-bold mb-4 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            How Reporting Works
          </h2>
          <div className="space-y-3">
            {[
              { step: "1", text: "Tap the Report button during or after any chat." },
              { step: "2", text: "The full conversation is automatically included with your report." },
              { step: "3", text: "Add an optional comment describing what happened." },
              { step: "4", text: "Reports are reviewed and action is taken within 24 hours." },
              { step: "5", text: "Users with 3 or more reports are temporarily blocked for 3 days." },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-4 items-start">
                <span className="w-7 h-7 rounded-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {step}
                </span>
                <p className="text-gray-300 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Consequences */}
        <div className="bg-white/5 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Consequences</h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            Violations of these guidelines may result in:
          </p>
          <div className="space-y-2">
            {[
              "Temporary IP block (3 days) for repeated reports",
              "Permanent ban for severe violations (explicit content, minors, threats)",
              "Reporting to law enforcement for illegal activity",
            ].map((item, i) => (
              <div key={i} className="flex gap-3 text-gray-300">
                <span className="text-[#fc5c7d] flex-shrink-0">→</span>
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Contact</h2>
          <p className="text-gray-300 leading-relaxed text-sm">
            Questions about these guidelines? Email us at Stumblechat.online@gmail.com.
          </p>
        </div>

      </div>
    </div>
  );
};

export default Guidelines;
