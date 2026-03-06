import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <header className="p-6 flex items-center gap-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Privacy Policy</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        <p className="text-gray-400 text-sm">Last updated: March 2026</p>

        <p className="text-gray-300 leading-relaxed">
          This Privacy Policy explains what data Stumble Chat collects, how it is used, and your rights.
          We are committed to collecting as little data as possible.
        </p>

        {[
          {
            title: "1. What We Collect",
            items: [
              "Display name, age, and gender — stored in your browser's local storage only. Never sent to our servers permanently.",
              "City / location — detected automatically to improve matching. Only the city name is used, not your precise coordinates.",
              "IP address — collected temporarily per session to enforce IP-based blocks for reported users. Not stored permanently.",
              "Chat messages — not stored on our servers. Messages exist only in active sessions and are lost when the chat ends.",
              "Photos — temporarily held in memory during a chat session and deleted automatically after the 15-second view timer expires.",
              "Report data — if you report a user, the chat history and your comment are saved for abuse review purposes.",
              "Analytics — we use Google Analytics 4 to collect anonymized usage data (page views, session duration, device type). IP addresses are anonymized.",
            ]
          },
          {
            title: "2. What We Do NOT Collect",
            items: [
              "We do not collect your real name, email address, or phone number.",
              "We do not store chat histories outside of the report system.",
              "We do not sell your data to third parties.",
              "We do not use your data for advertising profiling.",
            ]
          },
          {
            title: "3. How We Use Your Data",
            items: [
              "City data is used solely to match you with nearby users first.",
              "IP addresses are used solely to enforce temporary blocks for users reported for abuse.",
              "Analytics data is used to understand how the app is used and to improve performance.",
              "Report data is used only to review abuse reports and take action.",
            ]
          },
          {
            title: "4. Third-Party Services",
            items: [
              "Google Analytics 4 — anonymized usage analytics. See Google's Privacy Policy for details.",
              "PostHog — product analytics for app improvement. Data is anonymized.",
              "BigDataCloud API — used to detect your city from your IP address. Only the city name is retained.",
            ]
          },
          {
            title: "5. Data Retention",
            items: [
              "Session data (connections, queues, active chats) — deleted immediately when you disconnect.",
              "Photos — deleted automatically after 15 seconds of being viewed, or when the chat ends.",
              "IP block records — deleted automatically after 3 days.",
              "Report records — retained for up to 90 days for abuse review, then deleted.",
              "Local storage (name, age, gender, city) — stored in your browser until you clear it.",
            ]
          },
          {
            title: "6. Your Rights",
            items: [
              "You can clear your profile data at any time by clearing your browser's local storage.",
              "You can use the app without providing a real name — a display name is sufficient.",
              "To request deletion of any report data associated with your IP address, contact Stumblechat.online@gmail.com.",
            ]
          },
          {
            title: "7. Children's Privacy",
            items: [
              "Stumble Chat is not intended for users under 18 years of age.",
              "We do not knowingly collect data from minors.",
              "If you believe a minor is using the service, please report it to Stumblechat.online@gmail.com.",
            ]
          },
          {
            title: "8. Changes to This Policy",
            items: [
              "We may update this policy from time to time. The 'Last updated' date at the top of this page will reflect any changes.",
              "Continued use of the app after changes are posted constitutes acceptance of the updated policy.",
            ]
          }
        ].map(({ title, items }) => (
          <div key={title}>
            <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h2>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex gap-3 text-gray-300 leading-relaxed">
                  <span className="text-[#7c5cfc] mt-1 flex-shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Privacy;
