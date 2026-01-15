// src/app/api/parse-timetable/route.ts
// 🏆 FINAL: 4-Phase with conflict resolution + defensive normalization

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

interface ParsedEvent {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  subject: string;
  venue: string;
  lecturer: string;
}

// 🤖 PHASE 1: RAW EXTRACTION
async function extractRawGrid(base64Data: string): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY!.trim();

  const phase1Prompt = `Extract RAW timetable data from this VISUAL GRID.

🎯 CRITICAL RULES:

**MERGED CELLS:**
- Some classes span multiple time slots (e.g., 8:15-10:15 is TWO slots: 8:15-9:15 + 9:15-10:15)
- If you see a class spanning multiple slots, capture the FULL duration
- DO NOT split merged cells into separate entries

**NO OVERLAPS:**
- For the SAME subject on the SAME day:
  - DO NOT output overlapping time ranges
  - Example: If you see both "08:15-10:15" and "09:15-11:15" for the same class, choose the LARGER span (08:15-11:15)

**What to extract:**
- day: Monday-Friday
- timeSlot: Full duration (e.g., "8:15-10:15", "2:15-4:15")
- rawText: EVERYTHING in that block (course codes, subject, venue, lecturer)

EXAMPLE:
[
  {
    "day": "Friday",
    "timeSlot": "8:15-10:15",
    "rawText": "Business Finance\\nBBT1204\\nSBS 1\\nDr. Erastus Mbithi"
  }
]

Return ONLY JSON array.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
          },
          { type: 'text', text: phase1Prompt }
        ]
      }]
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Phase 1 failed');

  const text = result.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) throw new Error('No JSON in Phase 1');
  
  return JSON.parse(jsonMatch[0]);
}

// 🧠 PHASE 2: NORMALIZATION
async function normalizeRawData(rawBlocks: any[]): Promise<ParsedEvent[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY!.trim();

  const phase2Prompt = `Normalize these blocks. STRATHMORE-SPECIFIC CORRECTIONS:

RAW DATA:
${JSON.stringify(rawBlocks, null, 2)}

🎯 EXTRACTION + CORRECTION RULES:

1. **courseCode**: Extract as written (BBT1204, HED1201, etc.)

2. **subject**: Keep as written BUT correct known OCR errors:
   - "Iosios" → "iOS"
   - "LadPro" → "Ladies Program"

3. **venue**: CRITICAL STRATHMORE CORRECTIONS:
   - "STM-8" → "STM-B" (B looks like 8 in OCR)
   - "STM 8" → "STM-B"
   - Keep: "MSB 8", "MSB 5", "SBS 1" (these are correct)
   - Pattern: If it's "STM" followed by "-8" or " 8" WITHOUT additional numbers, it's "STM-B"

4. **lecturer**: Extract as written

5. **time**: Convert to 24h format
   - 8:15 → 08:15, 2:15 → 14:15, etc.

EXAMPLE:
[
  {
    "day": "Friday",
    "startTime": "08:15",
    "endTime": "10:15",
    "courseCode": "BBT1204",
    "subject": "Business Finance",
    "venue": "SBS 1",
    "lecturer": "Dr. Erastus Mbithi"
  }
]

Return ONLY JSON array.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [{ type: 'text', text: phase2Prompt }] }]
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Phase 2 failed');

  const text = result.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) throw new Error('No JSON in Phase 2');
  
  return JSON.parse(jsonMatch[0]);
}

// 🛡️ PHASE 3: DEFENSIVE NORMALIZATION (Catch what AI missed)
function defensiveNormalization(events: ParsedEvent[]): ParsedEvent[] {
  return events.map(event => {
    // Fix STM-8 → STM-B (OCR error)
    if (event.venue) {
      event.venue = event.venue
        .replace(/\bSTM-8\b/gi, 'STM-B')
        .replace(/\bSTM 8\b/gi, 'STM-B')
        .replace(/\bBBS\b/gi, 'SBS'); // Another common OCR error
    }

    // Fix subject OCR errors
    if (event.subject) {
      event.subject = event.subject
        .replace(/Iosios/gi, 'iOS')
        .replace(/LadPro/gi, 'Ladies Program')
        .replace(/Meshanje/gi, 'Machanje')
        .replace(/Kavagira/gi, 'Kavugira')
        .replace(/Maguiri/gi, 'Maigari')
        .replace(/Ochiboho/gi, 'Oshisanya');
    }

    // Fix lecturer OCR errors
    if (event.lecturer) {
      event.lecturer = event.lecturer
        .replace(/Meshanje/gi, 'Machanje')
        .replace(/Kavagira/gi, 'Kavugira')
        .replace(/Maguiri/gi, 'Maigari')
        .replace(/Ochiboho/gi, 'Oshisanya');
    }

    // Format times
    if (event.startTime) {
      const [h, m] = event.startTime.split(':');
      event.startTime = `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
    }
    if (event.endTime) {
      const [h, m] = event.endTime.split(':');
      event.endTime = `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
    }

    return event;
  });
}

// 🔗 PHASE 4: CONFLICT RESOLUTION
function resolveConflicts(events: ParsedEvent[]): ParsedEvent[] {
  // Sort by day and time
  const sorted = events.sort((a, b) => {
    const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
    const dayDiff = (dayOrder[a.day as keyof typeof dayOrder] || 0) - (dayOrder[b.day as keyof typeof dayOrder] || 0);
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });

  const resolved: ParsedEvent[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    
    // Filter out SPORTS/CLUBS
    if (current.subject?.toUpperCase().includes('SPORTS') || 
        current.subject?.toUpperCase().includes('CLUBS')) {
      console.log(`🗑️  Filtered: ${current.subject}`);
      continue;
    }

    // Check if this overlaps with previous event
    if (resolved.length > 0) {
      const prev = resolved[resolved.length - 1];
      
      // Same day + overlapping times
      if (prev.day === current.day && 
          current.startTime < prev.endTime) {
        
        // Same subject → merge
        if (prev.subject.toLowerCase() === current.subject.toLowerCase()) {
          console.log(`🔗 Merging: ${current.subject} ${prev.startTime}-${prev.endTime} + ${current.startTime}-${current.endTime}`);
          
          // Extend previous event's end time
          prev.endTime = current.endTime > prev.endTime ? current.endTime : prev.endTime;
          
          // Update course code if current has one and prev doesn't
          if (current.courseCode && !prev.courseCode) {
            prev.courseCode = current.courseCode;
          }
          
          // If venues differ, show both
          if (current.venue && prev.venue && current.venue !== prev.venue) {
            prev.venue = `${prev.venue} / ${current.venue}`;
          }
          
          continue; // Skip adding current
        }
        // Different subjects overlapping → keep the one with more info
        else {
          const prevScore = (prev.courseCode ? 1 : 0) + (prev.venue ? 1 : 0) + (prev.lecturer ? 1 : 0);
          const currScore = (current.courseCode ? 1 : 0) + (current.venue ? 1 : 0) + (current.lecturer ? 1 : 0);
          
          if (currScore > prevScore) {
            console.log(`⚠️  Conflict: Replacing ${prev.subject} with ${current.subject} (better data)`);
            resolved[resolved.length - 1] = current;
            continue;
          } else {
            console.log(`⚠️  Conflict: Keeping ${prev.subject}, skipping ${current.subject}`);
            continue;
          }
        }
      }
    }
    
    resolved.push(current);
  }

  return resolved;
}

// 🔧 UTILITIES
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];
  const valid = requests.filter(t => now - t < 60000);
  if (valid.length >= 10) return false;
  valid.push(now);
  rateLimitMap.set(ip, valid);
  return true;
}

function getFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isPDFBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.slice(0, 5).equals(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]));
}

// 🚀 MAIN API
export async function POST(req: NextRequest) {
  const start = Date.now();
  
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isPDFBuffer(buffer)) {
      return NextResponse.json({ error: 'Not a PDF' }, { status: 400 });
    }

    const hash = getFileHash(buffer);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📄 ${file.name}`);
    console.log(`🔑 Hash: ${hash.substring(0, 12)}`);

    // Check cache
    try {
      const cached = await adminDb.collection('parsedTimetables').doc(hash).get();
      if (cached.exists) {
        console.log('✅ CACHE HIT (0 tokens)');
        console.log(`${'='.repeat(70)}\n`);
        return NextResponse.json({ 
          events: cached.data()?.events || [],
          cached: true
        });
      }
    } catch (e) {}

    console.log('❌ CACHE MISS\n');

    const base64 = buffer.toString('base64');

    // PHASE 1
    console.log('⏳ Phase 1: Extracting...');
    const rawBlocks = await extractRawGrid(base64);
    console.log(`✅ Phase 1: ${rawBlocks.length} blocks\n`);

    // PHASE 2
    console.log('⏳ Phase 2: Normalizing...');
    let events = await normalizeRawData(rawBlocks);
    console.log(`✅ Phase 2: ${events.length} events\n`);

    // PHASE 3
    console.log('⏳ Phase 3: Defensive fixes...');
    events = defensiveNormalization(events);
    console.log(`✅ Phase 3: OCR corrections applied\n`);

    // PHASE 4
    console.log('⏳ Phase 4: Resolving conflicts...');
    const beforeResolve = events.length;
    events = resolveConflicts(events);
    console.log(`✅ Phase 4: ${beforeResolve} → ${events.length} events\n`);

    console.log(`${'='.repeat(70)}`);
    console.log(`✅ FINAL: ${events.length} events in ${Date.now() - start}ms`);
    console.log(`${'='.repeat(70)}\n`);

    // Cache
    try {
      await adminDb.collection('parsedTimetables').doc(hash).set({
        events,
        hash,
        fileName: file.name,
        createdAt: new Date()
      });
    } catch (e) {}

    return NextResponse.json({ 
      events,
      cached: false,
      time: Date.now() - start
    });

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message, '\n');
    return NextResponse.json({ 
      error: 'Failed',
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'OK',
    version: '8.0-final-with-phase4',
    features: ['4-phase', 'ocr-correction', 'conflict-resolution', 'merge-duplicates']
  });
}