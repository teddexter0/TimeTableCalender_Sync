import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { syncToGoogleCalendar } from '@/lib/google-calendar';
import { DocumentType, TimetableEvent } from '@/types/timetable';
import { validateEvent, validateIsoDate } from '@/lib/timetable-rules';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Connect Google Calendar before syncing.' }, { status: 401 });
    }
    if (session.error) {
      return NextResponse.json({ error: 'Your Google connection expired. Connect it again.' }, { status: 401 });
    }

    const body = await req.json() as {
      events?: TimetableEvent[];
      documentType?: DocumentType;
      semesterStart?: string;
      semesterEnd?: string;
      ambiguousConfirmed?: boolean;
      syncConfirmed?: boolean;
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

    const result = await syncToGoogleCalendar(
      session.accessToken,
      body.events,
      body.semesterStart,
      body.documentType,
      body.semesterEnd,
    );
    return NextResponse.json({ success: result.success, syncedEvents: result.eventIds.length });
  } catch (error) {
    console.error('Calendar sync error:', error);
    return NextResponse.json({ error: 'Google Calendar sync failed. Nothing was silently skipped; please try again.' }, { status: 500 });
  }
}
