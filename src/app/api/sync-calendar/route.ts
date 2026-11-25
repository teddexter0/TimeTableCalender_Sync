import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { calendarAuthOptions, calendarConnectionError, calendarGoogleError } from '@/lib/auth';
import { syncToGoogleCalendar } from '@/lib/google-calendar';
import { DocumentType, TimetableEvent } from '@/types/timetable';
import { validateEvent, validateIsoDate } from '@/lib/timetable-rules';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(calendarAuthOptions);
    if (!session?.accessToken || session.error || session.calendarAccess === false) {
      return NextResponse.json({ error: calendarConnectionError(session) || 'Connect Google Calendar first.' }, { status: 401 });
    }

    const body = await req.json() as {
      events?: TimetableEvent[];
      documentType?: DocumentType;
      semesterStart?: string;
      semesterEnd?: string;
      ambiguousConfirmed?: boolean;
      syncConfirmed?: boolean;
      calendarAccount?: string;
    };
    if (body.documentType !== 'class' && body.documentType !== 'cat' && body.documentType !== 'exam') {
      return NextResponse.json({ error: 'Invalid timetable type.' }, { status: 400 });
    }
    if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) {
      return NextResponse.json({ error: 'Add between 1 and 100 events.' }, { status: 400 });
    }
    if (body.syncConfirmed !== true) {
      return NextResponse.json({ error: 'Review the events and explicitly consent to this Google Calendar sync.' }, { status: 400 });
    }
    for (const [index, event] of body.events.entries()) {
      const errors = validateEvent(event, body.documentType);
      if (errors.length) return NextResponse.json({ error: `Event ${index + 1}: ${errors.join(', ')}.` }, { status: 400 });
    }
    if (body.events.some(event => event.ambiguousMatch) && !body.ambiguousConfirmed) {
      return NextResponse.json({ error: 'Confirm the highlighted combined-group rows before syncing.' }, { status: 400 });
    }
    if (body.documentType === 'class') {
      if (!body.semesterStart || !validateIsoDate(body.semesterStart) || !body.semesterEnd || !validateIsoDate(body.semesterEnd)) {
        return NextResponse.json({ error: 'Choose valid semester start and end dates.' }, { status: 400 });
      }
      if (body.semesterEnd < body.semesterStart) {
        return NextResponse.json({ error: 'Semester end must be after semester start.' }, { status: 400 });
      }
    }

    if (body.calendarAccount && body.calendarAccount !== session.user?.email) {
      return NextResponse.json({ error: 'The connected account changed. Reload TTS and confirm the destination before syncing again.' }, { status: 409 });
    }

    const result = await syncToGoogleCalendar(
      session.accessToken,
      body.events,
      body.semesterStart,
      body.documentType,
      body.semesterEnd,
    );
    const syncedEvents = result.eventIds.length;
    if (result.failure) {
      const { error, status } = result.failure;
      console.warn('Calendar sync failed', { status, syncedEvents });
      const progress = syncedEvents > 0
        ? `Google confirmed ${syncedEvents} of ${body.events.length} events. `
        : '';
      return NextResponse.json({ error: progress + error, syncedEvents }, { status });
    }
    return NextResponse.json({
      success: true,
      syncedEvents,
      calendarAccount: session.user?.email,
      eventLink: result.eventLink,
    });
  } catch (error) {
    const failure = calendarGoogleError(error);
    console.warn('Calendar sync failed', { status: failure.status });
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
