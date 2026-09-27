// src/app/terms/page.tsx
export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">1. Service Description</h2>
        <p>
          TTS (Timetable Sync) is a class reminder service. We provide schedule information
          for informational purposes only.
        </p>

        <h2 className="text-xl font-bold">2. No Warranty</h2>
        <p className="font-bold text-red-600">
          CRITICAL: Schedule information is provided "AS IS" without any warranty.
          You MUST verify all class times, venues, and dates with official university sources.
        </p>

        <h2 className="text-xl font-bold">3. Limitation of Liability</h2>
        <p>
          TTS and its operators are NOT responsible for:
          - Missed classes, exams, or assignments
          - Incorrect venue, time, or date information
          - Any academic, financial, or other damages
        </p>

        <h2 className="text-xl font-bold">4. User Responsibility</h2>
        <p>
          By using TTS, you agree to:
          - Verify all information with official university timetables
          - Not rely solely on TTS for critical academic deadlines
          - Check your official university portal regularly
        </p>

        <h2 className="text-xl font-bold">5. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless TTS from any claims arising from your use of the service.
        </p>
      </section>
    </div>
  );
}
