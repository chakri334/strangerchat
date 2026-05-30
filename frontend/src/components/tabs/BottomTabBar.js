import { Users, Radio, MessageSquare, User } from 'lucide-react';

const TABS = [
  { id: 'people', label: 'People', icon: Users, accent: 'text-emerald-400' },
  { id: 'random', label: 'Random Chat', icon: Radio, accent: 'text-sky-400' },
  { id: 'chats', label: 'Chats', icon: MessageSquare, accent: 'text-purple-400' },
  { id: 'profile', label: 'Profile', icon: User, accent: 'text-pink-400' },
];

const BottomTabBar = ({ activeTab, onChange }) => (
  <nav
    className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 py-2 flex justify-around items-center shadow-2xl"
    data-testid="bottom-tab-bar"
  >
    {TABS.map(({ id, label, icon: Icon, accent }) => {
      const active = activeTab === id;
      return (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            active ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
          data-testid={`tab-${id}`}
        >
          <Icon className={`h-5 w-5 ${active ? `${accent} ${id === 'random' ? 'animate-pulse' : ''}` : 'text-slate-500'}`} />
          <span className="text-[10px] tracking-wide">{label}</span>
        </button>
      );
    })}
  </nav>
);

export default BottomTabBar;
