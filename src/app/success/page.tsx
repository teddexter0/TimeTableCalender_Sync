// src/app/success/page.tsx


import React from "react";
import { Calendar } from "lucide-react"; // or whatever icon you use


interface Event {
  day: string;
  start_time: string;
  end_time: string;
  course_code: string;
  subject: string;
  venue: string;
  lecturer?: string;
}

const events = []; // replace with actual state or props from your app
const email = "student@example.com";

export default function SuccessPage() {
  const handleDownloadCalendar = async () => {
    try {
      const response = await fetch("/api/sync-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: events.map(e => ({
            day: e.day,
            startTime: e.start_time,
            endTime: e.end_time,
            courseCode: e.course_code,
            subject: e.subject,
            venue: e.venue,
            lecturer: e.lecturer
          })),
          email: email,
          semesterStart: "2025-01-13"
        })
      });

      if (!response.ok) throw new Error("Failed to generate calendar");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timetable.ics";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to download calendar");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Payment Successful!</h1>
      <button
        onClick={handleDownloadCalendar}
        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700"
      >
        <Calendar className="w-5 h-5" />
        Download Calendar
      </button>
    </div>
  );
}
