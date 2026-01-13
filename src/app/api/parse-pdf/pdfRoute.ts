import { NextRequest, NextResponse } from 'next/server';
import { parseClassTimetable, parseExamTimetable } from '@/lib/pdf-parse';
import { rateLimit } from '@/lib/security';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  
  if (!rateLimit(ip, 10, 60000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const courseCodes = JSON.parse(formData.get('courseCodes') as string);
    const studentGroup = formData.get('studentGroup') as string;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    const buffer = Buffer.from(await file.arrayBuffer());
    
    let events;
    if (type === 'class') {
      events = await parseClassTimetable(buffer, courseCodes, studentGroup);
    } else {
      events = await parseExamTimetable(buffer, courseCodes, studentGroup);
    }
    
    return NextResponse.json({ events });
  } catch (error) {
    console.error('PDF parsing error:', error);
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 });
  }
}