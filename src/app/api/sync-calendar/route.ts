import { NextRequest, NextResponse } from 'next/server';

interface CalendarEvent {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  subject: string;
  venue: string;
  lecturer?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { events, email, semesterStart } = await req.json();
    
    if (!events || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }
    
    // Generate .ics file content
    const icsContent = generateICSFile(events, semesterStart);
    
    // Return as downloadable file
    return new Response(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="timetable.ics"',
      },
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
    return NextResponse.json({ error: 'Failed to generate calendar' }, { status: 500 });
  }
}

function generateICSFile(events: CalendarEvent[], semesterStart: string): string {
  const now = new Date();
  const icsTimestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TTS Production//Timetable Sync//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:University Timetable
X-WR-TIMEZONE:Africa/Nairobi
X-WR-CALDESC:Automated class schedule from TTS

`;

  // Map days to numbers (Monday = 1, Sunday = 7)
  const dayMap: Record<string, number> = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
    'Sunday': 7
  };
  
  // Generate recurring events for the semester (16 weeks)
  events.forEach((event, index) => {
    const dayNum = dayMap[event.day];
    
    // Calculate first occurrence
    const startDate = new Date(semesterStart);
    const daysDiff = (dayNum - startDate.getDay() + 7) % 7;
    startDate.setDate(startDate.getDate() + daysDiff);
    
    // Parse times
    const [startHour, startMin] = event.startTime.split(':').map(Number);
    const [endHour, endMin] = event.endTime.split(':').map(Number);
    
    startDate.setHours(startHour, startMin, 0);
    const endDate = new Date(startDate);
    endDate.setHours(endHour, endMin, 0);
    
    // Format for iCalendar (YYYYMMDDTHHMMSS)
    const dtstart = formatICSDate(startDate);
    const dtend = formatICSDate(endDate);
    
    // End of semester (16 weeks from start)
    const semesterEnd = new Date(semesterStart);
    semesterEnd.setDate(semesterEnd.getDate() + (16 * 7));
    const until = formatICSDate(semesterEnd).split('T')[0];
    
    icsContent += `BEGIN:VEVENT
UID:tts-${index}-${icsTimestamp}@timetablesync.co.ke
DTSTAMP:${icsTimestamp}
DTSTART:${dtstart}
DTEND:${dtend}
RRULE:FREQ=WEEKLY;UNTIL=${until};BYDAY=${getDayAbbr(event.day)}
SUMMARY:${event.courseCode}: ${event.subject}
LOCATION:${event.venue}
DESCRIPTION:Course: ${event.courseCode}\\nLecturer: ${event.lecturer || 'TBA'}\\nVenue: ${event.venue}
STATUS:CONFIRMED
TRANSP:OPAQUE
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Class in 30 minutes: ${event.subject}
END:VALARM
END:VEVENT

`;
  });
  
  icsContent += 'END:VCALENDAR';
  
  return icsContent;
}

function formatICSDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function getDayAbbr(day: string): string {
  const abbr: Record<string, string> = {
    'Monday': 'MO',
    'Tuesday': 'TU',
    'Wednesday': 'WE',
    'Thursday': 'TH',
    'Friday': 'FR',
    'Saturday': 'SA',
    'Sunday': 'SU'
  };
  return abbr[day] || 'MO';
}
