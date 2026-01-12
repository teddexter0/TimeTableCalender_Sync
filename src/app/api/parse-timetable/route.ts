// src/app/api/parse-timetable/route.ts
import { NextRequest, NextResponse } from 'next/server';
// src/app/api/parse-timetable/route.ts
// @ts-ignore: pdfjs-dist has no type declarations
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

import admin from 'firebase-admin';

// Firebase Admin init
if (!admin.apps.length) {
  if (!process.env.FIREBASE_ADMIN_KEY) {
    throw new Error('Missing FIREBASE_ADMIN_KEY in .env.local');
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

// Helper: extract text from PDF
async function extractText(buffer: Buffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    text += pageText + '\n';
  }

  return text;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer);

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    await db.collection('timetables').add({
      text,
      lines,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'PDF parsed successfully', lines });
  } catch (err: any) {
    console.error('PDF Parsing Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
