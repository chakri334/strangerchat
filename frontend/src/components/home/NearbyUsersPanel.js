const NearbyUsersPanel = ({ users, onRefresh, onSelect }) => (
  <div className="px-6">
    <div className="max-w-2xl mx-auto bg-white/5 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">Nearby Active Users</h2>
        <button onClick={onRefresh} className="text-xs text-gray-300 hover:text-white">Refresh</button>
      </div>
      <div className="space-y-2 max-h-60 overflow-auto">
        {users.length === 0 ? (
          <p className="text-sm text-gray-400">No nearby active users yet. Try refresh in a moment.</p>
        ) : users.map((u) => (
          <button
            key={u.sid}
            onClick={() => onSelect(u.sid)}
            className="w-full text-left bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-all"
          >
            <div className="font-medium">{u.emoji} {u.name}</div>
            <div className="text-xs text-gray-400">{u.city} {u.age ? `• ${u.age}` : ''}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default NearbyUsersPanel;
