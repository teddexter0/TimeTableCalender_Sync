// src/app/privacy/page.tsx
export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">1. Data We Collect</h2>
        <ul className="list-disc pl-6">
          <li>Email address (for reminders)</li>
          <li>Phone number (optional, for SMS)</li>
          <li>Class schedule information</li>
          <li>Payment information (via PesaPal - we don't store card details)</li>
        </ul>

        <h2 className="text-xl font-bold">2. How We Use Your Data</h2>
        <ul className="list-disc pl-6">
          <li>Send class reminders via email</li>
          <li>Sync schedule to your Google Calendar</li>
          <li>Process payments</li>
        </ul>

        <h2 className="text-xl font-bold">3. Data Security</h2>
        <p>
          Your data is stored securely in Firebase. We use industry-standard encryption.
        </p>

        <h2 className="text-xl font-bold">4. Your Rights</h2>
        <p>
          You can request deletion of your data at any time by contacting support@tts.com
        </p>
      </section>
    </div>
  );
}
