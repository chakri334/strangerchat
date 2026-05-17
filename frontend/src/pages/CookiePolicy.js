import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import useSEO from '../hooks/useSEO';

const CookiePolicy = () => {
  const navigate = useNavigate();

  useSEO({
    title: 'Cookie Policy',
    description: 'Stumble Chat Cookie Policy. See exactly which cookies and local storage we use, what they do, and how to control or disable them.',
    canonical: '/cookies',
  });

  const cookieTable = [
    { name: "_ga, _ga_*",                          provider: "Google Analytics", purpose: "Tracks sessions and page views anonymously",    expiry: "2 years"      },
    { name: "ph_*",                                 provider: "PostHog",          purpose: "Product analytics and session tracking",         expiry: "1 year"       },
    { name: "io (Socket.IO)",                       provider: "Stumble Chat",     purpose: "Maintains your real-time chat connection",       expiry: "Session"      },
    { name: "userName, userAge, userGender, userCity", provider: "Stumble Chat", purpose: "Saves your display preferences locally",         expiry: "Until cleared" },
    { name: "hasSeenOnboarding",                    provider: "Stumble Chat",     purpose: "Remembers that you accepted the terms",          expiry: "1 year"       },
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
            Cookies are small text files stored on your device by your browser. Stumble Chat also uses browser local storage — similar to cookies but stored differently — to remember your preferences between visits.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>2. Cookies We Use</h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left px-4 py-3 text-gray-300 font-medium">Cookie / Key</th>
                  <th className="text-left px-4 py-3 text-gray-300 font-medium">Provider</th>
                  <th className="text-left px-4 py-3 text-gray-300 font-medium hidden sm:table-cell">Purpose</th>
                  <th className="text-left px-4 py-3 text-gray-300 font-medium">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {cookieTable.map((row) => (
                  <tr key={row.name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-[#7c5cfc] font-mono text-xs">{row.name}</td>
                    <td className="px-4 py-3 text-gray-300">{row.provider}</td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{row.purpose}</td>
                    <td className="px-4 py-3 text-gray-400">{row.expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>3. How to Control Cookies</h2>
          <p className="text-gray-300 leading-relaxed">
            You can control or disable cookies through your browser settings. Disabling cookies may mean your preferences won't be saved between sessions. To clear local storage data, go to your browser's developer tools and clear site data for stumblechat.online.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>4. Analytics Cookies</h2>
          <p className="text-gray-300 leading-relaxed">
            We use Google Analytics 4 and PostHog to understand how the app is used. These tools collect anonymized data — they cannot identify you personally. IP addresses are anonymized before processing. You can opt out of Google Analytics by installing the{' '}
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-[#7c5cfc] hover:underline">
              Google Analytics opt-out browser add-on
            </a>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>5. Contact</h2>
          <p className="text-gray-300 leading-relaxed">
            For questions, contact us at{' '}
            <a href="mailto:stumblechat.online@gmail.com" className="text-[#7c5cfc] hover:underline">stumblechat.online@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
