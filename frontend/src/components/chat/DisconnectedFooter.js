import { AlertCircle } from 'lucide-react';

const DisconnectedFooter = ({ onReport, onFindNew }) => (
  <div className="text-center py-4">
    <p className="text-gray-400 mb-4">Chat ended. Messages are view-only.</p>
    <div className="flex gap-3 justify-center">
      <button
        onClick={onReport}
        className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl font-medium transition-all text-red-400 flex items-center gap-2"
        data-testid="report-after-disconnect-button"
      >
        <AlertCircle size={16} />
        Report User
      </button>
      <button
        onClick={onFindNew}
        className="px-6 py-3 bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/20 transition-all"
        data-testid="find-new-button"
      >
        Find New Chat
      </button>
    </div>
  </div>
);

export default DisconnectedFooter;
