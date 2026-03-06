import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useSEO from '../hooks/useSEO';

const Guidelines = () => {
  const navigate = useNavigate();

  useSEO({
    title: 'Community Guidelines',
    description: 'Stumble Chat Community Guidelines. Keep it respectful, keep it safe. Read the rules that make Stumble Chat a great place to meet new people.',
    canonical: '/guidelines',
  });

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
              <div key={title} className="flex gap-4 p-4 bg-white/5 rounded-xl">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <p className="font-semibold text-white text-sm">{title}</p>
                  <p className="text-gray-400 text-sm leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif' }}>
            <span className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-sm">✗</span>
            What's Not Allowed
          </h2>
          <div className="space-y-3">
            {[
              { emoji: "🚫", title: "Explicit or sexual content", desc: "Do not share explicit, sexual, or adult content of any kind. This includes photos, messages, and requests." },
              { emoji: "🚫", title: "Harassment and hate speech", desc: "Targeting someone based on their gender, race, religion, sexuality, or any other characteristic is grounds for an immediate ban." },
              { emoji: "🚫", title: "Threats or violence", desc: "Any threats — real or implied — will result in an immediate ban and may be reported to authorities." },
              { emoji: "🚫", title: "Sharing personal information", desc: "Do not share your own or anyone else's personal details including phone numbers, addresses, or social media handles." },
              { emoji: "🚫", title: "Spam or scams", desc: "Do not use Stumble Chat to promote services, share links, or attempt to scam or phish other users." },
              { emoji: "🚫", title: "Impersonation", desc: "Do not pretend to be someone you're not, including celebrities, staff, or other users." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="flex gap-4 p-4 bg-white/5 rounded-xl">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <p className="font-semibold text-white text-sm">{title}</p>
                  <p className="text-gray-400 text-sm leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Enforcement</h2>
          <p className="text-gray-300 leading-relaxed">
            Users who violate these guidelines may be temporarily or permanently banned by IP address. Users reported 3 or more times will receive an automatic 3-day IP block. Use the <strong className="text-white">Report</strong> button in any chat to flag a user.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Contact</h2>
          <p className="text-gray-300 leading-relaxed">
            Questions? Contact us at{' '}
            <a href="mailto:stumblechat.online@gmail.com" className="text-[#7c5cfc] hover:underline">stumblechat.online@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Guidelines;
