import useSEO from '../hooks/useSEO';
import LegalPage, { LegalSection } from '../components/legal/LegalPage';

const cookieTable = [
  { name: '_ga, _ga_*', provider: 'Google Analytics', purpose: 'Tracks sessions and page views anonymously', expiry: '2 years' },
  { name: 'ph_*', provider: 'PostHog', purpose: 'Product analytics and session tracking', expiry: '1 year' },
  { name: 'session_token', provider: 'Stumble Chat', purpose: 'HttpOnly cookie that keeps you signed in', expiry: '7 days' },
  { name: 'io (Socket.IO)', provider: 'Stumble Chat', purpose: 'Maintains your real-time chat connection', expiry: 'Session' },
  { name: 'userName, userAge, userGender, userCity, userInterests', provider: 'Stumble Chat', purpose: 'Saves your display preferences locally', expiry: 'Until cleared' },
  { name: 'hasSeenOnboarding', provider: 'Stumble Chat', purpose: 'Remembers that you accepted the terms', expiry: '1 year' },
];

const CookiePolicy = () => {
  useSEO({
    title: 'Cookie Policy',
    description: 'Stumble Chat Cookie Policy. See exactly which cookies and local storage we use, what they do, and how to control or disable them.',
    canonical: '/cookies',
  });

  return (
    <LegalPage title="Cookie Policy">
      <p className="text-sm text-slate-300 leading-relaxed">
        This Cookie Policy explains what cookies and local storage Stumble Chat uses, why we use them, and how you can control them.
      </p>

      <LegalSection title="1. What Are Cookies?">
        <p>
          Cookies are small text files stored on your device by your browser. Stumble Chat also uses browser local storage and an HttpOnly session cookie to remember your preferences and keep you signed in between visits.
        </p>
      </LegalSection>

      <LegalSection title="2. Cookies We Use">
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-3 py-2.5 font-bold text-slate-300 uppercase tracking-wider">Cookie / Key</th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-300 uppercase tracking-wider">Provider</th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-300 uppercase tracking-wider hidden sm:table-cell">Purpose</th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-300 uppercase tracking-wider">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {cookieTable.map((row) => (
                <tr key={row.name} className="border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors">
                  <td className="px-3 py-2.5 text-emerald-400 font-mono text-[10px] break-all">{row.name}</td>
                  <td className="px-3 py-2.5 text-slate-300">{row.provider}</td>
                  <td className="px-3 py-2.5 text-slate-400 hidden sm:table-cell">{row.purpose}</td>
                  <td className="px-3 py-2.5 text-slate-400">{row.expiry}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="3. How to Control Cookies">
        <p>
          You can control or disable cookies through your browser settings. Disabling cookies may mean your preferences won't be saved between sessions. To clear local storage data, go to your browser's developer tools and clear site data for stumblechat.online.
        </p>
      </LegalSection>

      <LegalSection title="4. Analytics Cookies">
        <p>
          We use Google Analytics 4 and PostHog to understand how the app is used. These tools collect anonymized data — they cannot identify you personally. IP addresses are anonymized before processing. You can opt out of Google Analytics by installing the{' '}
          <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline">
            Google Analytics opt-out browser add-on
          </a>.
        </p>
      </LegalSection>

      <LegalSection title="5. Contact">
        <p>
          For questions, contact us at{' '}
          <a href="mailto:stumblechat.online@gmail.com" className="text-emerald-400 hover:text-emerald-300 underline">stumblechat.online@gmail.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
};

export default CookiePolicy;
