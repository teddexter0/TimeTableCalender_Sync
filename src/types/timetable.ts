export interface TimetableEvent {
  day: string;
  startTime: string;   // "08:00"
  endTime: string;     // "10:00"
  courseCode: string;  // "BBIT 2101"
  subject: string;
  venue: string;
  lecturer?: string;
}

// Helper to format time range for display
export function formatTimeRange(event: TimetableEvent): string {
  return `${event.startTime}-${event.endTime}`;
}