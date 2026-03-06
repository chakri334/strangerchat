import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const CookiePolicy = () => {
  const navigate = useNavigate();

  const cookieTable = [
    { name: "_ga, _ga_*", provider: "Google Analytics", purpose: "Tracks sessions and page views anonymously", expiry: "2 years" },
    { name: "ph_*", provider: "PostHog", purpose: "Product analytics and session tracking", expiry: "1 year" },
    { name: "io (Socket.IO)", provider: "Stumble Chat", purpose: "Maintains your real-time chat connection", expiry: "Session" },
    { name: "userName, userAge, userGender, userCity", provider: "Stumble Chat", purpose: "Saves your display preferences locally", expiry: "Until cleared" },
    { name: "hasSeenOnboarding", provider: "Stumble Chat", purpose: "Remembers that you accepted the terms", expiry: "1 year" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <header className="p-6 flex items-center gap-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Cookie Policy</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        <p className="text-gray-400 text-sm">Last updated: March 2026</p>

        <p className="text-gray-300 leading-relaxed">
          This Cookie Policy explains what cookies and local storage Stumble Chat uses, why we use them, and how you can control them.
        </p>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>1. What Are Cookies?</h2>
          <p className="text-gray-300 leading-relaxed">
            Cookies are small text files stored on your device by your browser. Stumble Chat also uses
            browser local storage — similar to cookies but stored differently — to remember your preferences
            between visits.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>2. Cookies We Use</h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left px-4 py-3 text-gray-300 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 text-gray-300 font-semibold">Provider</th>
                  <th className="text-left px-4 py-3 text-gray-300 font-semibold">Purpose</th>
                  <th className="text-left px-4 py-3 text-gray-300 font-semibold">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {cookieTable.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-[#7c5cfc] font-mono text-xs">{row.name}</td>
                    <td className="px-4 py-3 text-gray-300">{row.provider}</td>
                    <td className="px-4 py-3 text-gray-400">{row.purpose}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{row.expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>3. Types of Cookies</h2>
          <div className="space-y-4">
            {[
              { label: "Essential Cookies", desc: "Required for the app to function. The Socket.IO session cookie is necessary for real-time chat. You cannot opt out of these." },
              { label: "Functional Cookies", desc: "Store your preferences (display name, city, gender) so you don't have to re-enter them each visit. Stored in browser local storage." },
              { label: "Analytics Cookies", desc: "Google Analytics and PostHog cookies help us understand how users interact with the app so we can improve it. These are anonymized — no personal data is collected." },
            ].map(({ label, desc }) => (
              <div key={label} className="bg-white/5 rounded-xl p-4">
                <p className="font-semibold text-white mb-1">{label}</p>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>4. How to Control Cookies</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            You can control cookies through your browser settings. Note that disabling essential cookies will prevent the app from functioning correctly.
          </p>
          <div className="space-y-2">
            {[
              "Chrome: Settings → Privacy & Security → Cookies",
              "Safari: Settings → Safari → Privacy & Security",
              "Firefox: Settings → Privacy & Security → Cookies",
              "To clear local storage: Browser DevTools → Application → Local Storage → Clear",
            ].map((item, i) => (
              <div key={i} className="flex gap-3 text-gray-300">
                <span className="text-[#7c5cfc] flex-shrink-0">•</span>
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>5. Contact</h2>
          <p className="text-gray-300 leading-relaxed">
            For questions about our use of cookies, contact us at Stumblechat.online@gmail.com.
          </p>
        </div>

      </div>
    </div>
  );
};

export default CookiePolicy;
