import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

function getFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileHash = getFileHash(buffer);

    console.log('📄 Processing PDF with hash:', fileHash.substring(0, 8) + '...');

    // 1️⃣ Check Firebase cache
    try {
      const cachedDoc = await adminDb.collection('parsedTimetables').doc(fileHash).get();
      if (cachedDoc.exists) {
        const data = cachedDoc.data();
        console.log('✅ Cache HIT! Returning cached result');
        await adminDb.collection('parsedTimetables').doc(fileHash).update({
          parseCount: (data?.parseCount || 0) + 1,
          lastAccessedAt: new Date(),
        });
        return NextResponse.json({ events: data?.events || [], cached: true });
      }
    } catch (cacheError: any) {
      console.warn('⚠️ Cache check failed:', cacheError.message);
    }

    console.log('❌ Cache MISS - Parsing with Gemini AI...');

    const base64Data = buffer.toString('base64');

    // 2️⃣ Call Gemini Chat API (text-only, safe for v1.35.0)
    const chat = await genAI.chats.create({
      model: 'chat-bison-001', // safe text model
      input: `You are a university timetable parser.
Extract ALL classes from this PDF (base64: ${base64Data}) and return ONLY a valid JSON array in this format:
[{
  "day": "Monday",
  "startTime": "08:00",
  "endTime": "10:00",
  "courseCode": "BBIT 2101",
  "subject": "Database Systems",
  "venue": "MSB 8",
  "lecturer": "Dr. Kamau"
}]
- 24-hour time format
- day must be Monday-Friday
- if lecturer missing, use empty string
- RETURN ONLY JSON ARRAY, nothing else`
    });

    const text = chat.output_text || ''; // v1.35.0 text property

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse timetable structure', cached: false }, { status: 400 });
    }

    const events = JSON.parse(jsonMatch[0]);

    // 3️⃣ Save to Firebase cache
    try {
      await adminDb.collection('parsedTimetables').doc(fileHash).set({
        events,
        fileHash,
        createdAt: new Date(),
        parseCount: 1,
        lastAccessedAt: new Date(),
        fileSize: buffer.length,
        fileName: file.name,
      });
      console.log('💾 Saved to Firebase cache');
    } catch (saveError: any) {
      console.warn('⚠️ Could not save cache:', saveError.message);
    }

    return NextResponse.json({ events, cached: false });

  } catch (error: any) {
    console.error('❌ Parse error:', error);
    return NextResponse.json({ error: 'Parsing failed', details: error.message, cached: false }, { status: 500 });
  }
}
