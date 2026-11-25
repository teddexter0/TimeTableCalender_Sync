import Link from 'next/link';

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-8 text-gray-900">
      <h1 className="text-3xl font-bold">Timetable Sync privacy policy</h1>
      <p>Timetable Sync (TTS) turns a timetable PDF into events you can review and save to Google Calendar.</p>

      <h2 className="text-xl font-bold">Your timetable</h2>
      <p>TTS processes the PDF on its server to extract timetable rows. The app keeps the extracted draft and semester preferences in this browser. A successful sync clears the draft. You can clear the remaining preferences through your browser’s site settings.</p>

      <h2 className="text-xl font-bold">Google account and Calendar access</h2>
      <p>When you connect Google, TTS receives your account identifier, email, and basic profile. It uses your email to show the calendar destination and keeps Google credentials in your encrypted sign-in session. The app reads events from your primary calendar when you request a schedule comparison. It creates or updates TTS timetable events after you confirm a sync.</p>
      <p>Google account and Calendar data are used to provide those features. TTS does not sell these data, use them for advertising, or share them with an AI provider. TTS’s use of Google data follows the <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>

      <h2 className="text-xl font-bold">Disconnecting</h2>
      <p>Use Log out in TTS to end your session. You can revoke access at any time from <a className="underline" href="https://myaccount.google.com/connections">Google Account connections</a>. Events you already synced remain in Google Calendar, where you can edit or remove them.</p>
      <p><Link className="underline" href="/">Return to Timetable Sync</Link></p>
    </main>
  );
}
