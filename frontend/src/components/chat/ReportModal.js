const ReportModal = ({ comment, setComment, onCancel, onSubmit }) => (
  <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" data-testid="report-modal">
    <div className="bg-[#1a1a1a] rounded-2xl p-6 max-w-md w-full">
      <h3 className="text-xl font-bold mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>Report User</h3>
      <p className="text-gray-400 text-sm mb-4">
        The entire chat history will be saved for review. Add any additional comments below (optional).
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add comments about this report (optional)..."
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none h-24 mb-4"
        data-testid="report-comment-input"
      />
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors"
          data-testid="report-cancel-button"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-medium transition-colors"
          data-testid="report-submit-button"
        >
          Submit Report
        </button>
      </div>
    </div>
  </div>
);

export default ReportModal;
