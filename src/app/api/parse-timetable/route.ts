import { NextRequest, NextResponse } from 'next/server';
import { normalizeGroupCode } from '@/lib/timetable-rules';
import { parseDigitalAssessmentPdf } from '@/lib/local-pdf-parser';
import { parseLocalClassPdf } from '@/lib/local-class-ocr-parser';
import { parseCourseReferences, parseGroupAliases } from '@/lib/timetable-profile';
import { parseEndSemesterExamPdf } from '@/lib/local-exam-pdf-parser';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PARSER_VERSION = 'profiled-local-v4';
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (rateLimitMap.get(ip) || []).filter(time => now - time < 60_000);
  if (recent.length >= 10) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).equals(Buffer.from('%PDF-'));
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

    const formData = await req.formData();
    const file = formData.get('file');
    const groupCode = normalizeGroupCode(String(formData.get('groupCode') || ''));
    const typeHint = String(formData.get('documentType') || 'auto');
    const aliasesInput = String(formData.get('groupAliases') || '');
    const courseInput = String(formData.get('courseCatalog') || '');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF first.' }, { status: 400 });
    if (!groupCode || groupCode.length > 80) return NextResponse.json({ error: 'Enter your full group code, for example BBIT 2.2 D.' }, { status: 400 });
    if (!['auto', 'class', 'cat', 'exam'].includes(typeHint)) return NextResponse.json({ error: 'Invalid timetable type.' }, { status: 400 });
    if (aliasesInput.length > 2000 || courseInput.length > 12_000) return NextResponse.json({ error: 'Semester profile is too large.' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'PDF is too large. Maximum size is 15 MB.' }, { status: 413 });

    let groupAliases: string[];
    let courseReferences: ReturnType<typeof parseCourseReferences>;
    try {
      groupAliases = parseGroupAliases(aliasesInput);
      courseReferences = parseCourseReferences(courseInput);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid semester profile.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isPdf(buffer)) return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 });

    const finalExamResult = ['auto', 'exam'].includes(typeHint) ? await parseEndSemesterExamPdf(buffer, groupCode, groupAliases, courseReferences) : null;
    const assessmentResult = !finalExamResult && ['auto', 'cat'].includes(typeHint) ? await parseDigitalAssessmentPdf(buffer, groupCode, groupAliases, courseReferences) : null;
    const classResult = !finalExamResult && !assessmentResult && ['auto', 'class'].includes(typeHint) ? await parseLocalClassPdf(buffer, groupCode, groupAliases, courseReferences) : null;
    const localResult = finalExamResult || assessmentResult || classResult;
    if (!localResult) {
      return NextResponse.json({
        error: 'This PDF does not match the supported weekly-class grid or combined CAT/exam table. Nothing was guessed or synced.',
      }, { status: 422 });
    }
    return NextResponse.json({ ...localResult, extractionMode: classResult ? 'local-ocr' : 'assessment-text' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse timetable.';
    console.error('Timetable parse error:', message);
    const status = message.startsWith('The class timetable heading does not match') ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'OK', version: PARSER_VERSION });
}
