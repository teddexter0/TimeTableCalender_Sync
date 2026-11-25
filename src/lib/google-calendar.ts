import crypto from 'crypto';
import { calendar_v3, google } from 'googleapis';
import { DocumentType, TimetableEvent } from '@/types/timetable';
import { calendarGoogleError } from '@/lib/auth';
import { firstOccurrenceForDay, NAIROBI_TIME_ZONE, reminderMinutes } from '@/lib/timetable-rules';

interface SyncOptions {
  documentType?: DocumentType;
  semesterStart?: string;
  semesterEnd?: string;
}

function shiftTime(date: string, time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMinutes(hours * 60 + mins + minutes);
  return `${value.toISOString().slice(0, 10)}T${value.toISOString().slice(11, 19)}`;
}

function eventDate(event: TimetableEvent, semesterStart?: string): string {
  if (event.date) return event.date;
  if (!event.day || !semesterStart) throw new Error(`A semester start date is required for ${event.courseUnit}.`);
  return firstOccurrenceForDay(semesterStart, event.day);
}

function eventIdentity(event: TimetableEvent, documentType: DocumentType): string {
  const courseCode = event.courseUnit.match(/\b[A-Z]{2,6}\s*\d{3,5}[A-Z]?\b/i)?.[0]?.replace(/\s+/g, '').toUpperCase();
  const identityType = documentType === 'class' ? 'class' : 'assessment';
  return [identityType, courseCode || event.courseUnit.trim().toUpperCase(), event.date, event.day, event.matchedGroupLabel.trim().toUpperCase()].join('|');
}

function googleEventId(event: TimetableEvent, documentType: DocumentType, occurrenceIndex = 0): string {
  const identity = `${eventIdentity(event, documentType)}|${occurrenceIndex}`;
  return `tts${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 40)}`;
}

export function makeCalendarEvent(
  event: TimetableEvent,
  documentType: DocumentType,
  options: SyncOptions = {},
  occurrenceIndex = 0,
): { id: string; requestBody: calendar_v3.Schema$Event } {
  const date = eventDate(event, options.semesterStart);
  const isAssessment = documentType !== 'class';
  const assessmentLabel = documentType === 'cat' ? 'CAT' : 'Exam';
  const requestBody: calendar_v3.Schema$Event = {
    summary: event.courseUnit,
    location: event.venue,
    description: [
      isAssessment ? `${assessmentLabel} - calendar block starts 1 hour early for arrival.` : 'Weekly class imported by TTS.',
      `Official time: ${event.startTime}-${event.endTime}`,
      event.lecturer ? `Lecturer: ${event.lecturer}` : '',
      `Matched group: ${event.matchedGroupLabel}`,
      event.ambiguousMatch ? 'Please verify this combined/ambiguous timetable row.' : '',
    ].filter(Boolean).join('\n'),
    start: {
      dateTime: shiftTime(date, event.startTime, isAssessment ? -60 : 0),
      timeZone: NAIROBI_TIME_ZONE,
    },
    end: {
      dateTime: shiftTime(date, event.endTime, 0),
      timeZone: NAIROBI_TIME_ZONE,
    },
    reminders: {
      useDefault: false,
      overrides: reminderMinutes(documentType).map(minutes => ({ method: 'popup', minutes })),
    },
    extendedProperties: {
      private: { ttsManaged: 'true', ttsDocumentType: documentType },
    },
    colorId: documentType === 'exam' ? '11' : documentType === 'cat' ? '6' : '10',
  };

  if (documentType === 'class') {
    const semesterEnd = options.semesterEnd;
    if (!semesterEnd) throw new Error('A semester end date is required for weekly classes.');
    requestBody.recurrence = [`RRULE:FREQ=WEEKLY;UNTIL=${semesterEnd.replace(/-/g, '')}T205959Z`];
  }

  return { id: googleEventId(event, documentType, occurrenceIndex), requestBody };
}

export async function syncToGoogleCalendar(
  accessToken: string,
  events: TimetableEvent[],
  semesterStart?: string,
  documentType: DocumentType = 'class',
  semesterEnd?: string,
): Promise<{ success: boolean; eventIds: string[]; eventLink?: string; failure?: ReturnType<typeof calendarGoogleError> }> {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const eventIds: string[] = [];
  const occurrenceCounts = new Map<string, number>();

  const calendarEvents = events.map(event => {
    const identity = eventIdentity(event, documentType);
    const occurrenceIndex = occurrenceCounts.get(identity) || 0;
    occurrenceCounts.set(identity, occurrenceIndex + 1);
    return makeCalendarEvent(event, documentType, { semesterStart, semesterEnd }, occurrenceIndex);
  });

  let eventLink: string | undefined;
  for (const { id, requestBody } of calendarEvents) {
    try {
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: { id, ...requestBody },
      }).catch((error: { code?: number; response?: { status?: number } }) => {
        if ((error.response?.status ?? error.code) !== 409) throw error;
        return calendar.events.update({ calendarId: 'primary', eventId: id, requestBody });
      });
      eventIds.push(response.data.id || id);
      eventLink ||= response.data.htmlLink ?? undefined;
    } catch (error) {
      return { success: false, eventIds, failure: calendarGoogleError(error) };
    }
  }
  return { success: true, eventIds, eventLink };
}

export async function updateGoogleCalendarEvents(
  accessToken: string,
  oldEvents: TimetableEvent[],
  newEvents: TimetableEvent[],
): Promise<void> {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const currentIds = new Set(newEvents.map(event => event.googleEventId).filter(Boolean));
  for (const event of oldEvents) {
    if (event.googleEventId && !currentIds.has(event.googleEventId)) {
      await calendar.events.delete({ calendarId: 'primary', eventId: event.googleEventId });
    }
  }
}
