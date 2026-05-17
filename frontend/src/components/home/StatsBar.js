const StatsBar = ({ stats }) => (
  <div className="px-6 pb-24">
    <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 text-center" data-testid="stat-online">
        <div className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.online}</div>
        <div className="text-xs text-gray-400 mt-1">Online Now</div>
      </div>
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 text-center" data-testid="stat-chats">
        <div className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.chats_today}</div>
        <div className="text-xs text-gray-400 mt-1">Chats Today</div>
      </div>
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 text-center" data-testid="stat-cities">
        <div className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{stats.cities}</div>
        <div className="text-xs text-gray-400 mt-1">Cities</div>
      </div>
    </div>
  </div>
);

export default StatsBar;
