// src/app/api/parse-timetable/route.ts
// ✅ WORKING: Direct PDF to Anthropic with beta header

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

// =============================================
// 🛡️ RATE LIMITING
// =============================================

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(ip: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];
  const validRequests = requests.filter(time => now - time < windowMs);
  
  if (validRequests.length >= maxRequests) return false;
  
  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  return true;
}

// =============================================
// 🛠️ UTILITIES
// =============================================

function getFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isPDFBuffer(buffer: Buffer): boolean {
  const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
  if (buffer.length < 5) return false;
  return buffer.slice(0, 5).equals(pdfSignature);
}

function validateFile(file: File): { valid: boolean; error?: string } {
  const fileExt = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  
  if (!fileExt || fileExt !== '.pdf') {
    return { valid: false, error: `Invalid file type. Only PDF allowed.` };
  }

  if (file.type !== 'application/pdf') {
    return { valid: false, error: `Invalid file format: ${file.type}. Only PDF allowed.` };
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const MIN_SIZE = 1024; // 1KB
  
  if (file.size > MAX_SIZE) {
    return { valid: false, error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max 10MB.` };
  }
  
  if (file.size < MIN_SIZE) {
    return { valid: false, error: 'File too small or empty.' };
  }

  return { valid: true };
}

// =============================================
// 🤖 ANTHROPIC PDF PARSER (WORKING!)
// =============================================

async function parseWithAnthropic(base64Data: string): Promise<ParsedEvent[]> {
  const modelId = 'claude-sonnet-4-5-20250929';

  const headers: Record<string, string> = {
    'x-api-key': process.env.ANTHROPIC_API_KEY!.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'pdfs-2024-09-25', // ✅ CRITICAL for PDF support
    'content-type': 'application/json',
  };

  // Add org ID if it exists
  if (process.env.ANTHROPIC_ORG_ID) {
    headers['anthropic-organization'] = process.env.ANTHROPIC_ORG_ID.trim();
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { 
              type: 'base64', 
              media_type: 'application/pdf', 
              data: base64Data 
            }
          },
          {
            type: 'text',
            text: `Extract ALL classes from this university timetable PDF.

CRITICAL: If a class has TWO CONSECUTIVE slots (e.g., 8:15-9:15 AND 9:15-10:15), MERGE them into ONE entry with the combined time (8:15-10:15).

Return ONLY a valid JSON array with these EXACT field names:

[{
  "day": "Monday",
  "startTime": "08:15",
  "endTime": "10:15",
  "courseCode": "BBIT 2101",
  "subject": "Database Systems",
  "venue": "MSB 8",
  "lecturer": "Dr. Kamau"
}]

STRICT RULES:
1. Use 24-hour time format (08:15 not 8:15 AM)
2. day must be: Monday, Tuesday, Wednesday, Thursday, or Friday
3. If lecturer is missing, use ""
4. MERGE consecutive slots for the same class
5. Use EXACTLY these field names: day, startTime, endTime, courseCode, subject, venue, lecturer
6. Return ONLY the JSON array, no markdown, no explanations`
          }
        ]
      }]
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Anthropic Error:', JSON.stringify(result, null, 2));
    throw new Error(result.error?.message || 'Anthropic API Error');
  }

  const text = result.content[0].text;
  console.log('🔍 Claude response (first 300 chars):', text.substring(0, 300));
  
  // Extract JSON
  let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const jsonMatch = cleanText.match(/\[[\s\S]*?\]/);
  
  if (!jsonMatch) {
    console.error('❌ No JSON found in response');
    throw new Error('No JSON found in AI response');
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Invalid response format');
  }
  
  // Validate field names
  const requiredFields = ['day', 'startTime', 'endTime', 'courseCode', 'subject', 'venue', 'lecturer'];
  const firstEvent = parsed[0];
  const missingFields = requiredFields.filter(field => !(field in firstEvent));
  
  if (missingFields.length > 0) {
    console.error('❌ Missing fields:', missingFields);
    console.error('Received keys:', Object.keys(firstEvent));
    throw new Error(`AI returned wrong field names. Missing: ${missingFields.join(', ')}`);
  }
  
  console.log('✅ Field validation passed!');
  return parsed;
}

// =============================================
// 🚀 MAIN API ENDPOINT
// =============================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 🛡️ RATE LIMIT
    const ip = req.headers.get('x-forwarded-for') || 
               req.headers.get('x-real-ip') || 
               'unknown';
    
    if (!checkRateLimit(ip, 10, 60000)) {
      console.warn('🚫 RATE LIMIT:', ip);
      return NextResponse.json({ 
        error: 'Too many requests. Please wait 1 minute.',
        retryAfter: 60
      }, { status: 429 });
    }

    // 1️⃣ GET FILE
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ 
        error: 'No file uploaded',
        hint: 'Please upload a PDF file' 
      }, { status: 400 });
    }

    // 2️⃣ VALIDATE FILE
    const validation = validateFile(file);
    if (!validation.valid) {
      console.warn('🚫 INVALID FILE:', file.name, file.type);
      return NextResponse.json({ 
        error: validation.error,
        hint: 'Only PDF files are accepted'
      }, { status: 400 });
    }

    // 3️⃣ GET BUFFER
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 4️⃣ CHECK PDF MAGIC BYTES
    if (!isPDFBuffer(buffer)) {
      console.warn('🚫 NOT A REAL PDF:', file.name);
      return NextResponse.json({
        error: 'This is not a valid PDF file',
        hint: 'File may be corrupted or renamed from another format'
      }, { status: 400 });
    }

    const fileHash = getFileHash(buffer);

    console.log(`📄 Processing: ${file.name} (Hash: ${fileHash.substring(0, 12)})`);

    // 5️⃣ CHECK CACHE
    try {
      const cachedDoc = await adminDb.collection('parsedTimetables').doc(fileHash).get();
      
      if (cachedDoc.exists) {
        const data = cachedDoc.data();
        console.log('✅ CACHE HIT!');
        
        await adminDb.collection('parsedTimetables').doc(fileHash).update({
          parseCount: (data?.parseCount || 0) + 1,
          lastAccessedAt: new Date(),
        });
        
        return NextResponse.json({ 
          events: data?.events || [],
          cached: true,
          source: 'cache',
          processingTime: Date.now() - startTime
        });
      }
    } catch (cacheError: any) {
      console.warn('⚠️ Cache check failed:', cacheError.message);
    }

    console.log('❌ CACHE MISS - Parsing with Claude PDF...');

    // 6️⃣ CONVERT TO BASE64
    const base64Data = buffer.toString('base64');

    // 7️⃣ PARSE WITH CLAUDE (DIRECT PDF!)
    let events: ParsedEvent[] = [];
    
    try {
      console.log('🤖 Parsing PDF with Claude...');
      events = await parseWithAnthropic(base64Data);
      console.log('✅ Claude success!', events.length, 'classes found');
      console.log('📋 Sample event:', JSON.stringify(events[0], null, 2));
    } catch (claudeError: any) {
      console.error('❌ Claude failed:', claudeError.message);
      
      return NextResponse.json({
        error: 'AI parsing failed',
        details: claudeError.message,
        hint: 'Please try again or contact support.',
        cached: false
      }, { status: 500 });
    }

    // 8️⃣ VALIDATE RESULTS
    if (!events || events.length === 0) {
      return NextResponse.json({ 
        error: 'No classes found in timetable',
        hint: 'Please ensure your PDF contains a valid timetable',
        cached: false 
      }, { status: 400 });
    }

    // 9️⃣ SAVE TO CACHE
    try {
      await adminDb.collection('parsedTimetables').doc(fileHash).set({
        events,
        fileHash,
        aiSource: 'claude-pdf-beta',
        createdAt: new Date(),
        parseCount: 1,
        lastAccessedAt: new Date(),
        fileSize: buffer.length,
        fileName: file.name,
        fileType: file.type,
        processingTime: Date.now() - startTime,
        uploadIp: ip.substring(0, 15),
      });
      console.log('💾 Saved to cache - next upload FREE!');
    } catch (saveError: any) {
      console.warn('⚠️ Cache save failed:', saveError.message);
    }

    // 🔟 SUCCESS
    console.log('✅ Complete:', {
      events: events.length,
      time: `${Date.now() - startTime}ms`
    });

    return NextResponse.json({ 
      events, 
      cached: false,
      source: 'claude-pdf-beta',
      processingTime: Date.now() - startTime
    });

  } catch (error: any) {
    console.error('❌ API Error:', error.message);
    
    return NextResponse.json({ 
      error: 'Parsing failed', 
      details: error.message,
      hint: 'Please try again or contact support',
      cached: false 
    }, { status: 500 });
  }
}

// =============================================
// 📊 HEALTH CHECK
// =============================================

export async function GET() {
  return NextResponse.json({
    service: 'TTS Parse API',
    version: '5.0.0 (WORKING!)',
    status: 'PRODUCTION ✅',
    method: 'Direct PDF to Claude',
    beta: 'pdfs-2024-09-25',
    caching: 'Enabled',
    providers: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      firebase: !!process.env.FIREBASE_ADMIN_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}