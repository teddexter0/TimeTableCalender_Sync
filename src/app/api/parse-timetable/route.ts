// src/app/api/parse-timetable/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

// ✅ FIXED: Using the standard require but with a robust check below
const pdfParse = require('pdf-parse');

// ✅ FIXED: Added missing interface
interface ParsedEvent {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  subject: string;
  venue: string;
  lecturer: string;
}

// =============================================
// 🛠️ PDF EXTRACTION ENGINE
// =============================================

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // ✅ THE NUCLEAR FIX: 
    // This checks all 3 ways Next.js/Webpack wraps this specific library
    const parse = pdfParse.default?.default || pdfParse.default || pdfParse;
    
    if (typeof parse !== 'function') {
       console.error("DEBUG - pdfParse is actually:", typeof pdfParse);
       console.log("DEBUG - Keys available:", Object.keys(pdfParse));
       throw new Error("PDF parser logic not found. Ensure 'pdf-parse' is installed.");
    }
    
    // Use custom pagerender to avoid 'fs' module dependency crashes
    const options = {
      pagerender: (pageData: any) => pageData.getTextContent()
        .then((content: any) => content.items.map((i: any) => i.str).join(' '))
    };

    const data = await parse(buffer, options);
    return data.text;
  } catch (error: any) {
    console.error("❌ Extraction Error:", error.message);
    throw error;
  }
}

// =============================================
// 🛡️ RATE LIMITING
// =============================================

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

function getFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 12);
}

// =============================================
// 🚀 MAIN POST HANDLER
// =============================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const ip = req.headers.get('x-forwarded-for') || 'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many uploads. Try again in a minute.' }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = getFileHash(buffer);

    console.log(`📄 Processing: ${file.name} (Hash: ${fileHash})`);

    // 1. Check Firestore Cache
    const cacheDoc = await adminDb.collection('parsedTimetables').doc(fileHash).get();
    if (cacheDoc.exists) {
      console.log('✨ CACHE HIT - Returning saved data');
      return NextResponse.json({ 
        events: cacheDoc.data()?.events, 
        cached: true 
      });
    }

    // 2. Extract Text
    console.log('❌ CACHE MISS - Extracting text...');
    const extractedText = await extractTextFromPDF(buffer);

    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error("The PDF seems to be empty or contains no readable text.");
    }

    // 3. Logic Placeholder 
    // (This is where the parsed text would normally be sent to Claude/Regex)
    const events: ParsedEvent[] = []; 

    // 4. Save to Cache
    await adminDb.collection('parsedTimetables').doc(fileHash).set({
      events,
      fileName: file.name,
      createdAt: new Date(),
    });

    return NextResponse.json({ 
      events, 
      cached: false,
      textPreview: extractedText.substring(0, 200) + "..." 
    });

  } catch (error: any) {
    console.error('❌ API Error:', error.message);
    return NextResponse.json({ 
      error: 'Failed to process PDF', 
      details: error.message 
    }, { status: 500 });
  }
}