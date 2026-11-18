import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions, isGoogleUnauthorized } from '@/lib/auth';
import { NAIROBI_TIME_ZONE, validateIsoDate } from '@/lib/timetable-rules';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.error) {
      return NextResponse.json({ error: 'Your Google connection expired. Connect it again.' }, { status: 401 });
    }
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Connect Google Calendar to compare your existing schedule.' }, { status: 401 });
    }

    const start = req.nextUrl.searchParams.get('start') || '';
    const end = req.nextUrl.searchParams.get('end') || '';
    if (!validateIsoDate(start) || !validateIsoDate(end) || end < start) {
      return NextResponse.json({ error: 'Choose a valid calendar comparison range.' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${start}T00:00:00+03:00`,
      timeMax: `${end}T23:59:59+03:00`,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      timeZone: NAIROBI_TIME_ZONE,
    });

    const events = (response.data.items || []).map(event => ({
      id: event.id || '',
      summary: event.summary || '(Untitled event)',
      location: event.location || '',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      allDay: Boolean(event.start?.date),
    }));
    return NextResponse.json({ events, range: { start, end } });
  } catch (error) {
    if (isGoogleUnauthorized(error)) {
      return NextResponse.json({ error: 'Google rejected the calendar connection. Reconnect to compare your schedule.' }, { status: 401 });
    }
    console.error('Calendar preview error:', error);
    return NextResponse.json({ error: 'Could not read your calendar comparison. Nothing was changed.' }, { status: 500 });
  }
}
