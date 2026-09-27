import { CourseReference, ParsedTimetable, TimetableEvent } from '@/types/timetable';
import { canonicalCourseName, findCodeLessCourseReference, findCourseReference } from '@/lib/timetable-profile';

type Canvas = {
  width: number;
  height: number;
  getContext(type: '2d'): any;
  toBuffer(type: 'image/png'): Buffer;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOT_TIMES = ['08:15', '09:15', '10:15', '11:15', '12:15', '13:15', '14:15', '15:15', '16:15', '17:15'];
function clusters(values: number[]): number[] {
  const groups: number[][] = [];
  for (const value of values) {
    if (!groups.length || value > groups[groups.length - 1][groups[groups.length - 1].length - 1] + 1) groups.push([value]);
    else groups[groups.length - 1].push(value);
  }
  return groups.map(group => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length));
}

function colorDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

function rotateForReading(image: any, createCanvas: (width: number, height: number) => Canvas): Canvas {
  if (image.width >= image.height) {
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas;
  }
  const canvas = createCanvas(image.height, image.width);
  const context = canvas.getContext('2d');
  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(image, 0, 0);
  return canvas;
}

function detectGrid(canvas: Canvas): { dayLines: number[]; timeLines: number[] } | null {
  const context = canvas.getContext('2d');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data as Uint8ClampedArray;
  const dark = (x: number, y: number) => {
    const offset = (y * canvas.width + x) * 4;
    return Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 80;
  };
  const rowCandidates: number[] = [];
  for (let y = 0; y < canvas.height; y++) {
    let count = 0;
    for (let x = 0; x < canvas.width; x++) if (dark(x, y)) count++;
    if (count > canvas.width * 0.45) rowCandidates.push(y);
  }
  const rows = clusters(rowCandidates);
  if (rows.length < 17) return null;
  const dayLines = rows.slice(-16);
  const headerTop = rows[rows.length - 17];
  if (!headerTop || dayLines[0] <= headerTop) return null;

  const columnCandidates: number[] = [];
  const bandHeight = dayLines[0] - headerTop;
  for (let x = 0; x < canvas.width; x++) {
    let count = 0;
    for (let y = headerTop; y <= dayLines[0]; y++) if (dark(x, y)) count++;
    if (count > bandHeight * 0.65) columnCandidates.push(x);
  }
  const columns = clusters(columnCandidates);
  if (columns.length < 10) return null;
  const timeLines = columns.slice(-10);
  if (timeLines.some((value, index) => index > 0 && value - timeLines[index - 1] < 25)) return null;
  return { dayLines, timeLines };
}

function cellColor(canvas: Canvas, left: number, right: number, top: number, bottom: number): number[] {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data as Uint8ClampedArray;
  const frequencies = new Map<string, number>();
  const stepX = Math.max(4, Math.floor((right - left) / 20));
  const stepY = Math.max(4, Math.floor((bottom - top) / 12));
  for (let y = top + stepY; y < bottom - stepY; y += stepY) {
    for (let x = left + stepX; x < right - stepX; x += stepX) {
      const offset = (y * canvas.width + x) * 4;
      const color = [data[offset], data[offset + 1], data[offset + 2]].map(channel => Math.round(channel / 8) * 8);
      const key = color.join(',');
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
    }
  }
  const mode = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '255,255,255';
  return mode.split(',').map(Number);
}

function occupiedGroups(canvas: Canvas, grid: { dayLines: number[]; timeLines: number[] }, dayIndex: number): Array<[number, number]> {
  const top = grid.dayLines[dayIndex * 3 + 1];
  const bottom = grid.dayLines[dayIndex * 3 + 2];
  const colors = Array.from({ length: 9 }, (_, slot) => cellColor(canvas, grid.timeLines[slot], grid.timeLines[slot + 1], top, bottom));
  const groups: Array<[number, number]> = [];
  let start: number | null = null;
  for (let slot = 0; slot < colors.length; slot++) {
    const filled = colors[slot].some(channel => channel < 240);
    if (!filled) {
      if (start !== null) groups.push([start, slot]);
      start = null;
      continue;
    }
    if (start === null) start = slot;
    else if (colorDistance(colors[slot - 1], colors[slot]) > 45) {
      groups.push([start, slot]);
      start = slot;
    }
  }
  if (start !== null) groups.push([start, colors.length]);
  return groups;
}

function extractDetails(
  rawText: string,
  lecturerStripText: string,
  courseReferences: CourseReference[],
): { courseUnit: string; lecturer?: string; venue: string } | null {
  const text = rawText.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || /SPORTS\s*\/\s*CLUBS/i.test(text)) return null;
  const codeMatch = text.match(/\b[A-Z]{2,6}\s*[A-Z]?[0-9OILX]{3,5}[A-Z]?\b/i);
  let code = codeMatch?.[0].replace(/\s+/g, '').toUpperCase() || '';
  if (code === 'HED220') code = 'HED220X';
  const titleForMatching = text
    .replace(codeMatch?.[0] || '', ' ')
    .replace(/Meeting\s*(?:ID|1D|TD)?\s*:?/i, ' ')
    .replace(/Passcode[\s\S]*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const reference = code
    ? findCourseReference(code, courseReferences)
    : findCodeLessCourseReference(titleForMatching.replace(/Progrant/gi, 'Program'), courseReferences);
  if (courseReferences.length && !reference) return null;
  const meetingLabel = /Meeting\s*(?:ID|1D|TD)?\s*:?/i;
  const meetingPosition = text.search(meetingLabel);
  const meetingTail = meetingPosition >= 0 ? text.slice(meetingPosition).replace(meetingLabel, '') : '';
  const meetingId = meetingTail.split(/Passcode/i)[0].match(/[0-9OIL][0-9OIL ]{5,}/i)?.[0];
  const passcodeMatch = text.match(/Passcode\s*:?\s*([^\s]+)/i);
  const physicalVenue = text.match(/\bSTM(?:-?B)?\s+F\d+-\d+\b/i)?.[0]
    || text.match(/\bSTM(?:-?B)?\s+[A-Z]-[0-9O]{2}\b/i)?.[0]
    || text.match(/\bRM\s*[0-9OIL¢]+/i)?.[0]
    || text.match(/\b(?:STM(?:-?B)?|MSB|RM)\s*\d+[A-Z]?\b/i)?.[0]
    || text.match(/\bZumaridi\b/i)?.[0];
  const venue = meetingId
    ? `Online - Meeting ID ${meetingId.replace(/[OIL]/gi, character => ({ O: '0', I: '1', L: '1' }[character.toUpperCase()]!)).replace(/\s+/g, ' ').trim()}${passcodeMatch ? ` - Passcode ${passcodeMatch[1]}` : ''}`
    : physicalVenue || 'Venue needs confirmation';
  const titleSource = text.split(meetingLabel)[0];
  let title = titleSource
    .replace(codeMatch?.[0] || '', ' ')
    .replace(physicalVenue || '', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!code) title = title.replace(/^[A-Z]{1,3}\s+/, '');
  title = title.replace(/Progrant/i, 'Program');
  if (!title) title = code || 'Class name needs confirmation';
  const lecturerText = lecturerStripText.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lecturerCode = lecturerText.match(/\b[A-Z]{2,6}\s*[A-Z]?[0-9OILX]{3,5}[A-Z]?\b/i)?.[0] || '';
  const detectedLecturer = lecturerText
    .replace(lecturerCode, ' ')
    .replace(/[^A-Za-z.' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    courseUnit: reference ? canonicalCourseName(reference) : cleanOcr(`${code} ${title}`),
    lecturer: reference?.lecturer || detectedLecturer || undefined,
    venue: cleanOcr(venue.replace(/¢/g, '6').replace(/\b([BF])-O(\d)\b/gi, '$1-0$2')),
  };
}

function cleanOcr(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+([,.:])/g, '$1').trim();
}

function expectedClassIdentity(groupCode: string): { program: string; level: string; subgroup?: string } | null {
  const match = groupCode.trim().toUpperCase().match(/^([A-Z]+)\s+(\d+\.\d+)\s*([A-Z])?$/);
  if (!match) return null;
  return { program: match[1], level: match[2], subgroup: match[3] };
}

function headerMatchesOneGroup(headerText: string, groupCode: string): boolean {
  const expected = expectedClassIdentity(groupCode);
  if (!expected) return false;
  const compact = headerText.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  const identity = `${expected.program}${expected.level}${expected.subgroup || ''}`;
  const yearIdentity = `${expected.program}YEAR${expected.level}${expected.subgroup || ''}`;
  return compact.includes(identity) || compact.includes(yearIdentity);
}

function headerMatchesGroup(headerText: string, groupCode: string, groupAliases: string[]): boolean {
  return [groupCode, ...groupAliases].some(candidate => headerMatchesOneGroup(headerText, candidate));
}

function blackInkCopy(source: Canvas, createCanvas: (width: number, height: number) => Canvas): Canvas {
  const target = createCanvas(source.width, source.height);
  const context = target.getContext('2d');
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, target.width, target.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const ink = Math.max(image.data[index], image.data[index + 1], image.data[index + 2]) < 120;
    const value = ink ? 0 : 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return target;
}

export async function parseLocalClassPdf(
  buffer: Buffer,
  groupCode: string,
  groupAliases: string[] = [],
  courseReferences: CourseReference[] = [],
): Promise<ParsedTimetable | null> {
  const { PDFParse } = require('pdf-parse') as any;
  const { createCanvas, loadImage } = require('@napi-rs/canvas') as any;
  const { createWorker, PSM } = require('tesseract.js') as any;
  const language = require('@tesseract.js-data/eng') as { langPath: string; gzip: boolean };
  const parser = new PDFParse({ data: buffer });
  let screenshot: Buffer | undefined;
  try {
    const rendered = await parser.getScreenshot({ first: 1, last: 1, scale: 3, imageDataUrl: false, imageBuffer: true });
    screenshot = rendered.pages?.[0]?.data;
  } finally {
    await parser.destroy();
  }
  if (!screenshot) return null;
  const image = await loadImage(screenshot);
  const canvas = rotateForReading(image, createCanvas);
  const grid = detectGrid(canvas);
  if (!grid) return null;

  const worker = await createWorker('eng', 1, {
    langPath: language.langPath,
    gzip: language.gzip,
    cacheMethod: 'none',
  });
  const events: TimetableEvent[] = [];
  let occupiedCellCount = 0;
  let excludedCellCount = 0;
  try {
    const headerHeight = Math.max(40, grid.dayLines[0]);
    const header = createCanvas(canvas.width, headerHeight);
    header.getContext('2d').drawImage(canvas, 0, 0, canvas.width, headerHeight, 0, 0, canvas.width, headerHeight);
    const headerRecognition = await worker.recognize(header.toBuffer('image/png'), { tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    if (!headerMatchesGroup(headerRecognition.data.text || '', groupCode, groupAliases)) {
      throw new Error(`The class timetable heading does not match ${groupCode}. Check the group code or choose the correct PDF.`);
    }
    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
      const codeTop = grid.dayLines[dayIndex * 3];
      const contentTop = grid.dayLines[dayIndex * 3 + 1];
      const contentBottom = grid.dayLines[dayIndex * 3 + 2];
      const lecturerBottom = grid.dayLines[dayIndex * 3 + 3];
      for (const [startSlot, endSlot] of occupiedGroups(canvas, grid, dayIndex)) {
        occupiedCellCount += 1;
        const left = grid.timeLines[startSlot] + 4;
        const top = contentTop + 4;
        const width = grid.timeLines[endSlot] - left - 4;
        const height = contentBottom - top - 4;
        const crop = createCanvas(width, height);
        crop.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
        const codeCrop = createCanvas(width, Math.max(12, contentTop - codeTop - 6));
        codeCrop.getContext('2d').drawImage(canvas, left, codeTop + 3, width, codeCrop.height, 0, 0, width, codeCrop.height);
        const lecturerCrop = createCanvas(width, Math.max(12, lecturerBottom - contentBottom - 6));
        lecturerCrop.getContext('2d').drawImage(canvas, left, contentBottom + 3, width, lecturerCrop.height, 0, 0, width, lecturerCrop.height);
        const codeRecognition = await worker.recognize(codeCrop.toBuffer('image/png'), {
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        });
        const lecturerRecognition = await worker.recognize(lecturerCrop.toBuffer('image/png'), { tessedit_pageseg_mode: PSM.SINGLE_LINE });
        const originalRecognition = await worker.recognize(crop.toBuffer('image/png'), { tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const thresholded = blackInkCopy(crop, createCanvas);
        const inkRecognition = await worker.recognize(thresholded.toBuffer('image/png'), { tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const originalText = originalRecognition.data.text || '';
        const inkText = inkRecognition.data.text || '';
        const contentText = inkText.replace(/\s/g, '').length >= originalText.replace(/\s/g, '').length ? inkText : originalText;
        const recognizedText = `${codeRecognition.data.text || ''}\n${contentText}`;
        const details = extractDetails(recognizedText, lecturerRecognition.data.text || '', courseReferences);
        if (!details) {
          excludedCellCount += 1;
          continue;
        }
        events.push({
          ...details,
          date: null,
          day: DAYS[dayIndex],
          startTime: SLOT_TIMES[startSlot],
          endTime: SLOT_TIMES[endSlot],
          matchedGroupLabel: groupCode,
          ambiguousMatch: true,
        });
      }
    }
  } finally {
    await worker.terminate();
  }
  if (!events.length && courseReferences.length) {
    throw new Error('This is a recognized class timetable, but none of the supplied semester units matched. Check the unit codes and try again.');
  }
  if (!events.length) return null;
  return {
    documentType: 'class',
    formatId: 'kca_weekly_grid_v1',
    formatLabel: 'Weekly coloured class grid',
    groupSearched: groupCode,
    events,
    warnings: [
      `Detected ${occupiedCellCount} occupied grid blocks; ${events.length} matched the semester profile and ${excludedCellCount} non-matching/non-class blocks were excluded.`,
      'This class PDF has no text layer, so TTS used free local OCR. Verify every highlighted course, lecturer, venue, and time before syncing.',
      'OCR can confuse similar characters such as J/{, I/1, O/0, B/8, and S/5. Check every course code character and even one-letter lecturer-name differences against the PDF.',
      'Units without a printed code (for example Maisha or an elective) should be added to the semester profile as: NO CODE | Exact unit name | Exact lecturer.',
    ],
  };
}
