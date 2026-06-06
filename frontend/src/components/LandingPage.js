import { useState, useEffect } from 'react';
import { Radio, Shield, Image, MessageCircle, Users, Sparkles, ChevronDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const LandingPage = ({ onGetStarted }) => {
  const [stats, setStats] = useState({ online: 0, chats_today: 0, cities: 0 });

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/stats`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-x-hidden">

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#7c5cfc] opacity-5 blur-[140px] rounded-full" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-emerald-500 opacity-5 blur-[140px] rounded-full" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#7c5cfc] to-emerald-400 text-white shadow shadow-emerald-500/10">
            <Radio className="h-4 w-4 animate-pulse" />
          </div>
          <span className="text-base font-bold tracking-tight text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Stumble Chat
          </span>
          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Live
          </span>
        </div>
        <button
          onClick={onGetStarted}
          className="rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
        >
          Sign in
        </button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-12">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {stats.online > 0 ? `${stats.online} people online now` : 'Free · Anonymous · No signup needed'}
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4 max-w-xl" style={{ fontFamily: 'Syne, sans-serif' }}>
          Chat with strangers.<br />Make real connections.
        </h1>

        <p className="text-slate-400 text-sm sm:text-base max-w-sm leading-relaxed mb-8">
          Meet new people from Hyderabad and around the world instantly. Free, anonymous, no sign-up needed.
        </p>

        {/* Connect button */}
        <div className="relative mb-10">
          <div className="absolute inset-0 animate-ping opacity-20">
            <div className="w-40 h-40 rounded-full bg-gradient-to-r from-[#7c5cfc] to-emerald-400" />
          </div>
          <button
            onClick={onGetStarted}
            className="relative w-40 h-40 rounded-full bg-gradient-to-br from-[#7c5cfc] via-emerald-400 to-emerald-500 shadow-2xl shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center gap-2"
          >
            <Radio className="h-7 w-7 text-white" />
            <span className="text-xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Connect</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          {[
            { value: stats.online, label: 'Online' },
            { value: stats.chats_today, label: 'Chats Today' },
            { value: stats.cities, label: 'Cities' },
          ].map(({ value, label }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
              <div className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Syne, sans-serif' }}>{value}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-1 text-slate-600 text-xs">
          <span>Scroll to learn more</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 py-12 border-t border-slate-800/50">
        <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-8">Features</p>
        <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
          {[
            { icon: Radio, title: 'Random Match', desc: 'Instantly matched with a stranger worldwide', color: 'text-emerald-400' },
            { icon: Shield, title: 'Anonymous', desc: 'No personal info needed. Chat freely', color: 'text-[#7c5cfc]' },
            { icon: Image, title: 'Photo Sharing', desc: 'Share photos that disappear after viewing', color: 'text-sky-400' },
            { icon: MessageCircle, title: 'Persistent Chat', desc: 'Save conversations with people you like', color: 'text-pink-400' },
            { icon: Users, title: 'People Tab', desc: 'Browse and discover online users near you', color: 'text-amber-400' },
            { icon: Sparkles, title: 'No Sign-up', desc: 'Jump in as a guest and start chatting instantly', color: 'text-emerald-400' },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <Icon className={`h-5 w-5 ${color} mb-3`} />
              <div className="text-sm font-bold text-white mb-1">{title}</div>
              <div className="text-[11px] text-slate-500 leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 py-12 border-t border-slate-800/50">
        <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-8">How it works</p>
        <div className="flex flex-col gap-5 max-w-sm mx-auto">
          {[
            { num: '1', title: 'Visit Stumble Chat', desc: 'Open on mobile or desktop — no install needed' },
            { num: '2', title: 'Click connect', desc: 'Matched instantly with a stranger from Hyderabad or worldwide' },
            { num: '3', title: 'Start chatting', desc: 'Text, share photos, skip or save — your choice' },
          ].map(({ num, title, desc }) => (
            <div key={num} className="flex items-start gap-4">
              <div className="min-w-[32px] h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-400">
                {num}
              </div>
              <div>
                <div className="text-sm font-bold text-white">{title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy trust */}
      <section className="relative z-10 px-6 py-6 border-t border-slate-800/50 bg-emerald-500/5">
        <div className="flex items-start gap-3 max-w-sm mx-auto">
          <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-white">Privacy First</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Random chats stay anonymous and ephemeral. Sign in to unlock persistent chats, People tab and Profile — those messages auto-flush after 7 days.
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-14 border-t border-slate-800/50 text-center">
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
          Ready to meet someone new?
        </h2>
        <p className="text-slate-400 text-sm mb-6">Join thousands of users chatting on Stumble Chat every day</p>
        <button
          onClick={onGetStarted}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#7c5cfc] to-emerald-500 text-white font-bold px-8 py-3.5 text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
        >
          <Radio className="h-4 w-4" />
          Start Chatting Free
        </button>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 bg-slate-900/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 flex-wrap">
          {['/terms', '/privacy', '/guidelines', '/cookies'].map((path) => (
            <a key={path} href={path} className="text-[11px] text-slate-500 hover:text-slate-300 capitalize">
              {path.replace('/', '')}
            </a>
          ))}
          <a href="https://stumblechat.blogspot.com" rel="noopener noreferrer" target="_blank" className="text-[11px] text-slate-500 hover:text-slate-300">Blog</a>
        </div>
        <div className="text-[11px] text-slate-600">© 2026 Stumble Chat</div>
      </footer>

    </div>
  );
};

export default LandingPage;
