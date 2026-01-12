import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

// 🛠️ FIX: Using require because pdf-parse doesn't have a default ESM export
// This fixes the "Attempted import error" and "Object.defineProperty" crash.
const pdf = require('pdf-parse');

interface ParsedEvent {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  subject: string;
  venue: string;
  lecturer: string;
}

// 🛡️ Rate Limiting
const rateLimitMap = new Map<string, number[]>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];
  const validRequests = requests.filter(time => now - time < 60000);
  if (validRequests.length >= 10) return false;
  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  return true;
}

// 🤖 CLAUDE TEXT PARSER
async function parseTextWithClaude(rawText: string): Promise<ParsedEvent[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a university timetable extractor. Convert the following raw text into a clean JSON array of classes. 
        
        RULES:
        1. If a class has two consecutive slots (e.g. 8:15-9:15 and 9:15-10:15), MERGE them into one (8:15-10:15).
        2. Use 24-hour time format (HH:MM).
        3. Day must be: Monday, Tuesday, Wednesday, Thursday, or Friday.
        4. Return ONLY a JSON array. No text, no markdown.

        RAW TEXT:
        ${rawText}`
      }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Claude API failed');
  }

  const data = await response.json();
  const text = data.content[0].text;
  
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) throw new Error('AI failed to generate valid JSON');
  
  return JSON.parse(jsonMatch[0]);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 1️⃣ CACHE CHECK
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const cachedDoc = await adminDb.collection('parsedTimetables').doc(fileHash).get();
    if (cachedDoc.exists) {
      return NextResponse.json({ events: cachedDoc.data()?.events, cached: true });
    }

    // 2️⃣ EXTRACT TEXT (Now using the safe require)
    const pdfData = await pdf(buffer);
    
    // 3️⃣ AI PARSE
    const events = await parseTextWithClaude(pdfData.text);

    // 4️⃣ SAVE CACHE
    await adminDb.collection('parsedTimetables').doc(fileHash).set({
      events,
      fileName: file.name,
      createdAt: new Date()
    });

    return NextResponse.json({ events, cached: false });

  } catch (error: any) {
    console.error('SERVER ERROR:', error);
    return NextResponse.json({ error: error.message || 'Parsing failed' }, { status: 500 });
  }
}