import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const LegalPage = ({ title, lastUpdated = 'March 2026', children }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 hover:bg-slate-800 transition-colors"
            data-testid="legal-back-btn"
          >
            <ArrowLeft size={16} className="text-slate-300" />
          </button>
          <h1 className="text-base font-bold tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            {title}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-6">
        <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Last updated · {lastUpdated}
        </p>
        {children}
      </div>
    </div>
  );
};

export const LegalSection = ({ title, children }) => (
  <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
    <h2
      className="text-sm font-bold text-emerald-400 uppercase tracking-wider"
      style={{ fontFamily: 'Syne, sans-serif' }}
    >
      {title}
    </h2>
    <div className="text-sm text-slate-300 leading-relaxed space-y-3">{children}</div>
  </section>
);

export const BulletList = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item) => (
      <li key={item} className="flex gap-2.5">
        <span className="text-emerald-400 mt-1 flex-shrink-0">▹</span>
        <span className="text-slate-300">{item}</span>
      </li>
    ))}
  </ul>
);

export default LegalPage;
