import useSEO from '../hooks/useSEO';
import LegalPage, { LegalSection } from '../components/legal/LegalPage';

const Terms = () => {
  useSEO({
    title: 'Terms & Conditions',
    description: 'Read the Stumble Chat Terms and Conditions. Learn about eligibility, acceptable use, photo sharing rules, and your rights when using our free anonymous chat platform.',
    canonical: '/terms',
  });

  const sections = [
    { title: '1. Eligibility', body: 'You must be at least 18 years old to use Stumble Chat. By using the App you confirm that you meet this age requirement. We do not knowingly allow minors to access the service. If we become aware that a user is under 18, their access will be terminated immediately.' },
    { title: '2. Acceptable Use', body: 'You agree not to use Stumble Chat to: share sexually explicit, violent, or offensive content; harass, threaten, or harm other users; share personal information of others without consent; engage in spam, phishing, or fraudulent activity; attempt to hack, reverse-engineer, or disrupt the platform; impersonate any person or entity.' },
    { title: '3. Anonymous & Saved Chats', body: 'Random Chat connects you with strangers anonymously and does not save messages. People-tab conversations between signed-in users are saved to MongoDB and auto-deleted after 7 days unless you pin them to your hotlist. We do not verify identities. Do not share your real name, phone number, address, or financial information with strangers.' },
    { title: '4. Photo Sharing', body: 'Photos shared via Stumble Chat are automatically deleted after being viewed (15-second timer). You must not share explicit, offensive, or illegal imagery. By sharing a photo, you confirm you have the right to share it and that it does not violate any laws or third-party rights.' },
    { title: '5. Content & Conduct', body: 'All users are responsible for their own conduct. Stumble Chat does not pre-screen conversations. We reserve the right to block or ban users who violate these terms, particularly those reported multiple times by other users. Banned users may be blocked by IP address.' },
    { title: '6. Reporting & Blocking', body: 'If another user violates these terms, use the in-app Report feature inside Random Chat, or the Block button inside a People-tab chat. Reports include the conversation history for review. Users reported 3 or more times may be temporarily blocked. False or malicious reports are themselves a violation.' },
    { title: '7. Stumble ID & Telegram Linking', body: 'Each signed-in user receives a unique Stumble ID (@handle). Sharing your Stumble ID lets others find you in the People directory. Linking a Telegram username is optional and only used by our bot for notifications.' },
    { title: '8. Disclaimer of Warranties', body: 'Stumble Chat is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service, the accuracy of information shared by users, or the safety of interactions. Use the platform at your own risk.' },
    { title: '9. Limitation of Liability', body: 'To the fullest extent permitted by law, Stumble Chat and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App, including harm caused by other users.' },
    { title: '10. Changes to Terms', body: 'We may update these Terms at any time. Continued use of the App after changes are posted constitutes acceptance of the new terms. The "Last updated" date will be reflected at the top of this page.' },
    { title: '11. Contact', body: 'For questions about these Terms, contact us at stumblechat.online@gmail.com.' },
  ];

  return (
    <LegalPage title="Terms & Conditions">
      <p className="text-sm text-slate-300 leading-relaxed">
        By accessing or using Stumble Chat ("the App"), you agree to be bound by these Terms and Conditions.
        If you do not agree, please do not use the App.
      </p>
      {sections.map(({ title, body }) => (
        <LegalSection key={title} title={title}>
          <p>{body}</p>
        </LegalSection>
      ))}
    </LegalPage>
  );
};

export default Terms;
