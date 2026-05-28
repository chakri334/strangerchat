const BlockedScreen = ({ message }) => (
  <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center" data-testid="blocked-page">
    <div className="text-center px-6">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
        <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>Access Restricted</h1>
      <p className="text-gray-400">{message || 'You have been temporarily blocked due to multiple reports.'}</p>
    </div>
  </div>
);

export default BlockedScreen;
