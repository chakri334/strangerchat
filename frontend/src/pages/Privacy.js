import useSEO from '../hooks/useSEO';
import LegalPage, { LegalSection, BulletList } from '../components/legal/LegalPage';

const Privacy = () => {
  useSEO({
    title: 'Privacy Policy',
    description: 'Stumble Chat Privacy Policy. We collect minimal data – no emails, no stored chats. Learn exactly what we collect, why, and how your data is protected.',
    canonical: '/privacy',
  });

  const sections = [
    {
      title: '1. What We Collect',
      items: [
        "Display name, age, and gender — stored locally in your browser. For signed-in users, the name and gender are also synced with your profile.",
        "City / location — detected automatically to improve matching. Only the city name is stored unless you opt in to distance sorting.",
        "IP address — collected per session to enforce IP-based blocks on reported users. Not stored permanently.",
        "Random chat messages — never stored on our servers. They exist only inside the active session and are lost when the chat ends.",
        "People-tab chats (signed-in users only) — stored in MongoDB and automatically purged after 7 days unless pinned to your hotlist.",
        "Photos — temporarily held in memory during a chat and deleted automatically after a 15-second view timer.",
        "Report data — when you report a user, the chat history and your comment are saved for abuse review.",
        "Analytics — Google Analytics 4 collects anonymized usage data. IP addresses are anonymized.",
      ],
    },
    {
      title: '2. What We Do NOT Collect',
      items: [
        "We do not collect your phone number, financial information, or precise GPS coordinates without your explicit permission.",
        "We do not store random-chat histories.",
        "We do not sell your data to third parties.",
        "We do not use your data for advertising profiling.",
      ],
    },
    {
      title: '3. How We Use Your Data',
      items: [
        "City data is used solely to match you with nearby users first.",
        "IP addresses are used solely to enforce temporary blocks on reported users.",
        "Analytics data is used to understand how the app is used and to improve performance.",
        "Report data is used only to review abuse reports and take action.",
      ],
    },
    {
      title: '4. Third-Party Services',
      items: [
        "Google Sign-In — used for authentication; we never see your password.",
        "Google Analytics 4 — anonymized usage analytics.",
        "PostHog — product analytics.",
        "BigDataCloud — city-level reverse-geocoding.",
        "Telegram Bot API — optional notifications and account linking.",
      ],
    },
    {
      title: '5. Cookies & Local Storage',
      items: [
        "Browser local storage remembers your display name, age, gender, city, and interests between sessions.",
        "An HttpOnly session cookie keeps you signed in after Google sign-in.",
        "Google Analytics and PostHog set analytics cookies. See the Cookie Policy for full details.",
      ],
    },
    {
      title: '6. Your Rights',
      items: [
        "You can clear all locally stored data by clearing your browser's local storage or site data.",
        "Signed-in users can permanently delete their account and all stored chats by contacting us.",
        "For questions or data requests, contact stumblechat.online@gmail.com.",
      ],
    },
    {
      title: "7. Children's Privacy",
      items: [
        "Stumble Chat is intended for users aged 18 and over.",
        "We do not knowingly collect data from minors.",
        "If you believe a minor is using the service, please report it to stumblechat.online@gmail.com.",
      ],
    },
    {
      title: '8. Changes to This Policy',
      items: [
        "We may update this policy from time to time. The 'Last updated' date will reflect any changes.",
        "Continued use of the app after changes are posted constitutes acceptance of the updated policy.",
      ],
    },
  ];

  return (
    <LegalPage title="Privacy Policy">
      <p className="text-sm text-slate-300 leading-relaxed">
        This Privacy Policy explains what data Stumble Chat collects, how it is used, and your rights.
        We are committed to collecting as little data as possible.
      </p>
      {sections.map((s) => (
        <LegalSection key={s.title} title={s.title}>
          <BulletList items={s.items} />
        </LegalSection>
      ))}
    </LegalPage>
  );
};

export default Privacy;
