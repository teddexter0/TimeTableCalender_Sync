
export interface TimetableEvent {
  id?: string;
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  subject: string;
  venue: string;
  lecturer?: string;
  googleEventId?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  googleId: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  isPaid: boolean;
  paymentExpiry: Date;
  timetable: TimetableEvent[];
  lastSyncedAt?: Date;
  createdAt: Date;
}

// Helper function to format time range
export function formatTimeRange(event: TimetableEvent): string {
  return `${event.startTime}-${event.endTime}`;
}