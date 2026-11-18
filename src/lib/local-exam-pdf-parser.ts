import { CourseReference, ParsedTimetable, TimetableEvent } from '@/types/timetable';
import { canonicalCourseName, findCourseReference } from '@/lib/timetable-profile';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};
const DATE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\b\.?/i;
const TIME = /^(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})\s+(.+)$/;
const COURSE_START = /^([A-Z]{2,6}\s*\d{3,5}[A-Z]?\s*:\s*.+)$/i;
const GROUP_START = /\s+(?=(?:BBIT|BICS|BCOM|BCNS|CNS|SDS)\b)/i;
const VENUE = /\b(?:FORGE(?:\s+(?:GF|F\d)(?:-\d{2})?)?|BLUESKY|LT\s*\d+|MSB\s*\d+|KINDARUMA|ZUMARIDI)\b/gi;

function groupPattern(groupCode: string): RegExp | null {
  const match = groupCode.trim().match(/^([A-Z]+)\s+(\d+\.\d+)\s*([A-Z])?$/i);
  if (!match) return null;
  const level = match[2].replace('.', '\\.');
  return new RegExp(`\\b${match[1]}\\s*${level}${match[3] ? `\\s*${match[3]}` : ''}\\b`, 'i');
}

function findTarget(line: string, groupCode: string, aliases: string[]): RegExpMatchArray | null {
  const primary = groupPattern(groupCode);
  const match = primary ? line.match(primary) : null;
  if (match) return match;
  const compactLine = line.toUpperCase().replace(/\s+/g, ' ').trim();
  for (const alias of aliases) {
    const normalized = alias.toUpperCase().replace(/\s+/g, ' ').trim();
    const index = compactLine.indexOf(normalized);
    if (index >= 0) {
      const synthetic = [line.slice(index, index + normalized.length)] as unknown as RegExpMatchArray;
      synthetic.index = index;
      synthetic.input = line;
      return synthetic;
    }
  }
  return null;
}

function venuesIn(value: string): string[] {
  VENUE.lastIndex = 0;
  return [...value.matchAll(VENUE)].map(match => match[0].replace(/\s+/g, ' ').trim());
}

function normalizeCourse(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+([,:])/g, '$1').trim();
}

export async function parseEndSemesterExamPdf(
  buffer: Buffer,
  groupCode: string,
  groupAliases: string[] = [],
  courseReferences: CourseReference[] = [],
): Promise<ParsedTimetable | null> {
  const { PDFParse } = require('pdf-parse') as { PDFParse: new (options: { data: Buffer }) => { getText(): Promise<{ pages: Array<{ text: string }> }>; destroy(): Promise<void> } };
  const parser = new PDFParse({ data: buffer });
  let pages: Array<{ text: string }>;
  try {
    pages = (await parser.getText()).pages;
  } finally {
    await parser.destroy();
  }
  const fullText = pages.map(page => page.text).join('\n');
  if (!/END OF SEMESTER EXAMINATIONS TIMETABLE/i.test(fullText)) return null;
  const header = fullText.match(/\bDATE\s+TIME\s+EXAMINATION\s+GROUP\s+NO\s+(VENUE\s+)?(?:CHIEF\s+INVIGILATOR|LECTURER)\b/i);
  if (!header) return null;
  const hasVenueColumn = Boolean(header[1]);
  if (!groupPattern(groupCode) && !groupAliases.length) return null;

  const events: TimetableEvent[] = [];
  let currentDate: string | null = null;
  let currentDay: string | null = null;
  let currentStart = '';
  let currentEnd = '';
  let currentCourse = '';
  let currentVenue = '';
  let targetRows = 0;
  let excludedRows = 0;
  let incompleteRows = 0;

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      let line = lines[index];
      const dateText = lines.slice(index, index + 3).join(' ');
      const date = dateText.match(DATE);
      if (date) {
        currentDay = date[1][0].toUpperCase() + date[1].slice(1).toLowerCase();
        const month = MONTHS[date[3].toLowerCase()];
        currentDate = month ? `${date[4]}-${month}-${date[2].padStart(2, '0')}` : null;
        currentStart = '';
        currentEnd = '';
        currentCourse = '';
        currentVenue = '';
        // The final PDF sometimes starts the next exam on the last line of a wrapped date.
        let dateLength = date[0].length;
        while (dateLength > line.length) {
          dateLength -= line.length + 1;
          line = lines[++index];
        }
        line = line.slice(dateLength).trim();
      }

      const time = line.match(TIME);
      if (time) {
        currentStart = `${time[1].padStart(2, '0')}:${time[2]}`;
        currentEnd = `${time[3].padStart(2, '0')}:${time[4]}`;
        const rawCourse = time[5].match(COURSE_START)?.[1] || '';
        currentVenue = '';
        if (rawCourse) {
          const groupIndex = rawCourse.search(GROUP_START);
          currentCourse = normalizeCourse(groupIndex >= 0 ? rawCourse.slice(0, groupIndex) : rawCourse);
        }
      }

      const target = findTarget(line, groupCode, groupAliases);
      if (!target || target.index === undefined) {
        const seenVenues = venuesIn(line);
        if (seenVenues.length && currentCourse) currentVenue = seenVenues[seenVenues.length - 1];
        continue;
      }

      targetRows += 1;
      const prefixVenues = venuesIn(line.slice(0, target.index));
      if (prefixVenues.length) currentVenue = prefixVenues[prefixVenues.length - 1];
      const tail = line.slice(target.index).trim();
      const directVenues = venuesIn(tail);
      const directVenue = directVenues[0] || '';
      const beforeVenue = directVenue ? tail.slice(0, tail.toUpperCase().indexOf(directVenue.toUpperCase())).trim() : tail;
      const numbers = [...beforeVenue.matchAll(/\b\d{1,3}\b/g)];
      const candidate = numbers.at(-1);
      const matchedGroupLabel = candidate?.index === undefined ? tail : beforeVenue.slice(0, candidate.index).trim();
      const venue = hasVenueColumn ? directVenue || currentVenue : 'Check exam card';
      if (directVenue) currentVenue = directVenue;
      if (!currentDate || !currentDay || !currentStart || !currentEnd || !currentCourse || !venue) {
        incompleteRows += 1;
        continue;
      }

      const courseCode = currentCourse.match(/\b[A-Z]{2,6}\s*\d{3,5}[A-Z]?\b/i)?.[0] || '';
      const reference = courseCode ? findCourseReference(courseCode, courseReferences) : undefined;
      if (courseReferences.length && !reference) {
        excludedRows += 1;
        continue;
      }
      events.push({
        courseUnit: reference ? canonicalCourseName(reference) : currentCourse,
        lecturer: reference?.lecturer,
        venue,
        date: currentDate,
        day: currentDay,
        startTime: currentStart,
        endTime: currentEnd,
        matchedGroupLabel,
        ambiguousMatch: !directVenue,
      });
    }
  }

  if (!events.length && courseReferences.length) {
    throw new Error('This is a recognized end-of-semester exam timetable, but none of the supplied semester units matched. Check the unit codes and try again.');
  }
  if (!events.length) return null;
  const matchedCourseNames = new Set(events.map(event => event.courseUnit));
  const unmatchedCourses = courseReferences.filter(reference => !matchedCourseNames.has(canonicalCourseName(reference)));
  return {
    documentType: 'exam',
    formatId: 'strathmore_end_semester_exam_v1',
    formatLabel: 'Strathmore end-of-semester examination table',
    groupSearched: groupCode,
    events,
    warnings: [
      `Found ${targetRows} group rows; ${events.length} matched the semester profile, ${excludedRows} other-unit rows were excluded, and ${incompleteRows} incomplete rows were not imported.`,
      ...(unmatchedCourses.length ? [
        `No matching exam row for ${unmatchedCourses.map(canonicalCourseName).join('; ')}. Check the course codes and add any separate group labels from the PDF to your semester profile.`,
      ] : []),
      hasVenueColumn
        ? 'Rows whose venue is inherited from a merged venue cell are highlighted. Compare them with the official exam card before syncing.'
        : 'This draft omits venues. Check the official exam card for each room.',
    ],
  };
}
