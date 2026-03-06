import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Terms = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <header className="p-6 flex items-center gap-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Terms & Conditions</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        <p className="text-gray-400 text-sm">Last updated: March 2026</p>

        <p className="text-gray-300 leading-relaxed">
          By accessing or using Stumble Chat ("the App"), you agree to be bound by these Terms and Conditions.
          If you do not agree, please do not use the App.
        </p>

        {[
          {
            title: "1. Eligibility",
            body: "You must be at least 18 years old to use Stumble Chat. By using the App you confirm that you meet this age requirement. We do not knowingly allow minors to access the service. If we become aware that a user is under 18, their access will be terminated immediately."
          },
          {
            title: "2. Acceptable Use",
            body: "You agree not to use Stumble Chat to: share sexually explicit, violent, or offensive content; harass, threaten, or harm other users; share personal information of others without consent; engage in spam, phishing, or fraudulent activity; attempt to hack, reverse-engineer, or disrupt the platform; impersonate any person or entity."
          },
          {
            title: "3. Anonymous Chat",
            body: "Stumble Chat connects you with random strangers anonymously. You use a display name of your choice. We do not verify identities. You are solely responsible for the information you share during chats. Do not share your real name, phone number, address, or financial information with strangers."
          },
          {
            title: "4. Photo Sharing",
            body: "Photos shared via Stumble Chat are automatically deleted after being viewed (15-second timer). You must not share explicit, offensive, or illegal imagery. By sharing a photo, you confirm you have the right to share it and that it does not violate any laws or third-party rights."
          },
          {
            title: "5. Content & Conduct",
            body: "All users are responsible for their own conduct. Stumble Chat does not pre-screen conversations. We reserve the right to block or ban users who violate these terms, particularly those reported multiple times by other users. Banned users may be blocked by IP address."
          },
          {
            title: "6. Reporting",
            body: "If another user violates these terms, use the in-app Report feature. Reports include the conversation history for review. Users reported 3 or more times may be temporarily blocked from the platform. False or malicious reports are also a violation of these terms."
          },
          {
            title: "7. Disclaimer of Warranties",
            body: "Stumble Chat is provided 'as is' without warranties of any kind. We do not guarantee uninterrupted service, the accuracy of information shared by users, or the safety of interactions. Use the platform at your own risk."
          },
          {
            title: "8. Limitation of Liability",
            body: "To the fullest extent permitted by law, Stumble Chat and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App, including harm caused by other users."
          },
          {
            title: "9. Changes to Terms",
            body: "We may update these Terms at any time. Continued use of the App after changes are posted constitutes acceptance of the new terms. We will indicate the 'Last updated' date at the top of this page."
          },
          {
            title: "10. Contact",
            body: "For questions about these Terms, contact us at Stumblechat.online@gmail.com."
          }
        ].map(({ title, body }) => (
          <div key={title}>
            <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h2>
            <p className="text-gray-300 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Terms;
