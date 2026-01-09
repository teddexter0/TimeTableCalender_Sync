// src/lib/google-calendar.ts
import { google } from 'googleapis';
import { TimetableEvent } from '@/types/timetable';

export async function syncToGoogleCalendar(
  accessToken: string,
  events: TimetableEvent[],
  semesterStart: string
): Promise<{ success: boolean; eventIds: string[] }> {
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const eventIds: string[] = [];
  const semesterEnd = new Date(semesterStart);
  semesterEnd.setMonth(semesterEnd.getMonth() + 4);
  
  const dayMap: Record<string, string> = {
    'Monday': 'MO',
    'Tuesday': 'TU',
    'Wednesday': 'WE',
    'Thursday': 'TH',
    'Friday': 'FR',
  };
  
  for (const event of events) {
    try {
      const startDate = new Date(semesterStart);
      const dayNum = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(event.day);
      const daysDiff = (dayNum - startDate.getDay() + 7) % 7;
      startDate.setDate(startDate.getDate() + daysDiff);
      
      const [startHour, startMin] = event.startTime.split(':').map(Number);
      const [endHour, endMin] = event.endTime.split(':').map(Number);
      
      startDate.setHours(startHour, startMin, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(endHour, endMin, 0, 0);
      
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: `${event.courseCode}: ${event.subject}`,
          location: event.venue,
          description: `Lecturer: ${event.lecturer || 'TBA'}\nCourse: ${event.courseCode}`,
          start: {
            dateTime: startDate.toISOString(),
            timeZone: 'Africa/Nairobi',
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: 'Africa/Nairobi',
          },
          recurrence: [
            `RRULE:FREQ=WEEKLY;UNTIL=${semesterEnd.toISOString().split('T')[0].replace(/-/g, '')};BYDAY=${dayMap[event.day]}`
          ],
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'notification', minutes: 30 },
            ],
          },
          colorId: '10',
        },
      });
      
      eventIds.push(response.data.id!);
      
    } catch (error) {
      console.error(`Failed to create event for ${event.courseCode}:`, error);
      throw error;
    }
  }
  
  return { success: true, eventIds };
}

export async function updateGoogleCalendarEvents(
  accessToken: string,
  oldEvents: TimetableEvent[],
  newEvents: TimetableEvent[]
): Promise<void> {
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const toDelete = oldEvents.filter(
    old => !newEvents.find(n => n.courseCode === old.courseCode)
  );
  
  for (const event of toDelete) {
    if (event.googleEventId) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: event.googleEventId,
        });
      } catch (error) {
        console.error(`Failed to delete event ${event.googleEventId}:`, error);
      }
    }
  }
}