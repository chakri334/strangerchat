import { Check, X } from 'lucide-react';
import useSEO from '../hooks/useSEO';
import LegalPage, { LegalSection } from '../components/legal/LegalPage';

const WELCOME = [
  { emoji: '💬', title: 'Genuine conversations', desc: "Talk about anything — movies, music, life, ideas. Real conversations are what Stumble Chat is for." },
  { emoji: '🤝', title: 'Respect', desc: "Treat every stranger the way you'd want to be treated. Kindness goes a long way." },
  { emoji: '😄', title: 'Humour and fun', desc: 'Jokes, banter, and light-hearted chat are welcome. Just make sure both sides are enjoying it.' },
  { emoji: '🌍', title: 'Cultural curiosity', desc: 'Meeting people from different cities and backgrounds is the whole point. Be curious, not judgmental.' },
  { emoji: '🚪', title: 'Leaving freely', desc: "If a chat isn't working for you, use Skip, Disconnect, or Block without guilt. No explanation needed." },
];

const NOT_ALLOWED = [
  { emoji: '🚫', title: 'Explicit or sexual content', desc: 'Do not share explicit, sexual, or adult content of any kind. This includes photos, messages, and requests.' },
  { emoji: '🚫', title: 'Harassment and hate speech', desc: 'Targeting someone based on their gender, race, religion, sexuality, or any other characteristic is grounds for an immediate ban.' },
  { emoji: '🚫', title: 'Threats or violence', desc: 'Any threats — real or implied — will result in an immediate ban and may be reported to authorities.' },
  { emoji: '🚫', title: 'Sharing personal information', desc: "Do not share your own or anyone else's personal details including phone numbers, addresses, or social media handles." },
  { emoji: '🚫', title: 'Spam or scams', desc: 'Do not use Stumble Chat to promote services, share links, or attempt to scam or phish other users.' },
  { emoji: '🚫', title: 'Impersonation', desc: "Do not pretend to be someone you're not, including celebrities, staff, or other users." },
];

const RuleCard = ({ emoji, title, desc, accent }) => (
  <div className={`flex gap-3 p-3.5 rounded-xl border ${accent}`}>
    <span className="text-xl shrink-0">{emoji}</span>
    <div>
      <p className="font-semibold text-white text-sm">{title}</p>
      <p className="text-slate-400 text-xs leading-relaxed mt-0.5">{desc}</p>
    </div>
  </div>
);

const Guidelines = () => {
  useSEO({
    title: 'Community Guidelines',
    description: 'Stumble Chat Community Guidelines. Keep it respectful, keep it safe. Read the rules that make Stumble Chat a great place to meet new people.',
    canonical: '/guidelines',
  });

  return (
    <LegalPage title="Community Guidelines">
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-[#7c5cfc]/10 p-5 text-center">
        <p className="text-sm text-white leading-relaxed">
          Stumble Chat is a place to meet new people and have genuine conversations.
          Keep it respectful, keep it fun, and keep it safe.
        </p>
      </div>

      <LegalSection title="What's Welcome">
        <div className="flex items-center gap-2 -mt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Check size={14} />
          </div>
          <span className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Encouraged behaviour</span>
        </div>
        <div className="space-y-2.5 pt-1">
          {WELCOME.map((r) => (
            <RuleCard key={r.title} {...r} accent="border-slate-800 bg-slate-900/60" />
          ))}
        </div>
      </LegalSection>

      <LegalSection title="What's Not Allowed">
        <div className="flex items-center gap-2 -mt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
            <X size={14} />
          </div>
          <span className="text-[11px] text-slate-400 uppercase font-mono tracking-wider">Instant-ban offences</span>
        </div>
        <div className="space-y-2.5 pt-1">
          {NOT_ALLOWED.map((r) => (
            <RuleCard key={r.title} {...r} accent="border-red-900/40 bg-red-950/20" />
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Enforcement">
        <p>
          Users who violate these guidelines may be temporarily or permanently banned by IP address.
          Users reported 3 or more times will receive an automatic 3-day IP block.
          Use the <strong className="text-emerald-400">Report</strong> button in any random chat,
          or the <strong className="text-emerald-400">Block</strong> button inside a People-tab chat to flag a user.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions? Contact us at{' '}
          <a href="mailto:stumblechat.online@gmail.com" className="text-emerald-400 hover:text-emerald-300 underline">
            stumblechat.online@gmail.com
          </a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
};

export default Guidelines;
