import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// --- INLINE TYPES PATCH (No new files needed) ---
interface CreateChatParameters {
  input: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface ChatResult {
  result?: {
    output_text?: string;
  };
}

// ---------------------------------------------

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY, // Put your real Gemini API key in .env.local
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert PDF to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');

    // Gemini chat request
    const chat: ChatResult = await client.chats.create({
      model: 'chat-bison-001', // Gemini text model
      input: `
You are a university timetable parser.
I will provide a PDF as base64.
Extract ALL classes and return ONLY valid JSON array like this:

[{
  "day": "Monday|Tuesday|Wednesday|Thursday|Friday",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "courseCode": "BBIT 2101",
  "subject": "Database Systems",
  "venue": "MSB 8",
  "lecturer": "Dr. Kamau"
}]

Be thorough. Extract every class.
PDF (base64): ${base64}
`,
      temperature: 0,
      maxOutputTokens: 2048,
    } as CreateChatParameters); // cast to patched type

    const text = chat.result?.output_text || '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse timetable' }, { status: 400 });
    }

    const events = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ events });

  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json({ error: 'Parsing failed', details: error }, { status: 500 });
  }
}
