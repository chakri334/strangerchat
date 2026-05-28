const buttonLabel = (isConnected, isSearching) => {
  if (!isConnected) return 'Loading...';
  if (isSearching) return 'Searching...';
  return 'Connect';
};

const ConnectHero = ({ isSearching, isConnected, onConnect }) => (
  <div className="flex-1 flex items-center justify-center px-6 py-12">
    <div className="text-center">
      <div className="relative inline-block">
        {isSearching && (
          <div className="absolute inset-0 animate-ping">
            <div className="w-64 h-64 rounded-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] opacity-20"></div>
          </div>
        )}
        <button
          onClick={onConnect}
          disabled={isSearching || !isConnected}
          className={`relative w-64 h-64 rounded-full bg-gradient-to-br from-[#7c5cfc] to-[#fc5c7d] shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${!isConnected ? 'opacity-50' : ''}`}
          data-testid="connect-button"
        >
          <span className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            {buttonLabel(isConnected, isSearching)}
          </span>
        </button>
      </div>

      {!isConnected && !isSearching && (
        <p className="mt-6 text-yellow-400 animate-pulse">Connecting to server...</p>
      )}

      {isSearching && (
        <p className="mt-6 text-gray-400 animate-pulse" data-testid="searching-text">Finding a stranger for you...</p>
      )}
    </div>
  </div>
);

export default ConnectHero;
