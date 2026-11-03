import { CourseReference, ParsedTimetable, TimetableEvent } from '@/types/timetable';
import { canonicalCourseName, findCourseReference } from '@/lib/timetable-profile';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};
const WEEKDAYS = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;
const TIME = /(\d{1,2})[.:](\d{2})\s*(am|pm)\s*-\s*(\d{1,2})[.:](\d{2})\s*(am|pm)/i;
const COURSE = /\b([A-Z]{2,6}\s*\d{3,5}[A-Z]?\s*:\s*.*)/i;

function convertTime(hourText: string, minute: string, meridiem: string): string {
  let hour = Number(hourText);
  if (meridiem.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function targetParts(groupCode: string): { base: string; subgroup: string | null } | null {
  const match = groupCode.match(/^([A-Z]+\s+\d+\.\d+)(?:\s*([A-Z]))?$/i);
  return match ? { base: match[1].replace(/\s+/g, ' ').toUpperCase(), subgroup: match[2]?.toUpperCase() || null } : null;
}

function groupApplies(label: string, target: { base: string; subgroup: string | null }): boolean {
  const normalized = label.replace(/\s+/g, ' ').toUpperCase();
  if (!normalized.startsWith(target.base)) return false;
  if (!target.subgroup) return true;
  const suffix = normalized.slice(target.base.length).trim();
  return /ALL\s+GRPS?/.test(suffix) || new RegExp(`\\b${target.subgroup}\\b`).test(suffix);
}

function anyGroupApplies(label: string, target: { base: string; subgroup: string | null }, aliases: string[]): boolean {
  const normalized = label.replace(/\s+/g, ' ').trim().toUpperCase();
  return groupApplies(label, target) || aliases.some(alias => alias.replace(/\s+/g, ' ').trim().toUpperCase() === normalized);
}

function findGroupPosition(line: string, target: { base: string }, aliases: string[]): number {
  const upper = line.toUpperCase();
  const positions = [target.base, ...aliases]
    .map(candidate => upper.indexOf(candidate.replace(/\s+/g, ' ').trim().toUpperCase()))
    .filter(position => position >= 0);
  return positions.length ? Math.min(...positions) : -1;
}

function cleanCourse(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+$/, '').trim();
}

function cleanVenue(value: string, nextLine: string): string {
  let venue = value.trim();
  if (venue.endsWith('-') && /^EXAM\b/i.test(nextLine.trim())) venue += 'EXAM';
  return venue.replace(/\s+/g, ' ').trim();
}

export async function parseDigitalAssessmentPdf(
  buffer: Buffer,
  groupCode: string,
  groupAliases: string[] = [],
  courseReferences: CourseReference[] = [],
): Promise<ParsedTimetable | null> {
  // pdf-parse v2 ships runtime types that conflict with the legacy declaration in
  // this repository, so load its current class API dynamically.
  const { PDFParse } = require('pdf-parse') as { PDFParse: new (options: { data: Buffer }) => { getText(): Promise<{ pages: Array<{ text: string }> }>; destroy(): Promise<void> } };
  const parser = new PDFParse({ data: buffer });
  let pages: Array<{ text: string }>;
  try {
    pages = (await parser.getText()).pages;
  } finally {
    await parser.destroy();
  }
  const fullText = pages.map(page => page.text).join('\n');
  if (!/\b(CAT|EXAM(?:INATION)?)\s+TIMETABLE\b/i.test(fullText)) return null;
  const target = targetParts(groupCode);
  if (!target) return null;

  const lines = pages.flatMap(page => page.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  const events: TimetableEvent[] = [];
  let currentDate: string | null = null;
  let currentDay: string | null = null;
  let currentStart = '';
  let currentEnd = '';
  let currentCourse = '';
  let collectingCourse = false;
  let matchedGroupRowCount = 0;
  let excludedCourseRowCount = 0;
  let incompleteRowCount = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (WEEKDAYS.test(line)) {
      const ordinal = lines[index + 1]?.match(/^(\d{1,2})(?:st|nd|rd|th)$/i);
      const month = MONTHS[lines[index + 2]?.toLowerCase()];
      const year = lines[index + 3]?.match(/^\d{4}$/)?.[0];
      if (ordinal && month && year) {
        currentDay = line[0].toUpperCase() + line.slice(1).toLowerCase();
        currentDate = `${year}-${month}-${ordinal[1].padStart(2, '0')}`;
      }
      collectingCourse = false;
      continue;
    }

    const time = line.match(TIME);
    if (time) {
      currentStart = convertTime(time[1], time[2], time[3]);
      currentEnd = convertTime(time[4], time[5], time[6]);
    }

    const basePosition = findGroupPosition(line, target, groupAliases);
    const courseMatch = line.match(COURSE);
    if (courseMatch) {
      const rawCourse = basePosition >= 0 ? line.slice(line.search(COURSE), basePosition) : courseMatch[1];
      currentCourse = cleanCourse(rawCourse.replace(TIME, '').replace(/\t/g, ' '));
      collectingCourse = basePosition < 0;
    } else if (collectingCourse) {
      if (basePosition >= 0) {
        currentCourse = cleanCourse(`${currentCourse} ${line.slice(0, basePosition).replace(/\t/g, ' ')}`);
      } else if (!TIME.test(line) && !/^[A-Z]{2,6}\s+\d/i.test(line)) {
        currentCourse = cleanCourse(`${currentCourse} ${line}`);
      }
    }

    if (basePosition < 0) continue;
    collectingCourse = false;
    const afterBase = line.slice(basePosition);
    const fields = afterBase.split(/\t+/).map(field => field.trim()).filter(Boolean);
    const groupLabel = fields[0].replace(/\s+/g, ' ').trim();
    if (!anyGroupApplies(groupLabel, target, groupAliases)) continue;
    matchedGroupRowCount += 1;
    const venue = cleanVenue(fields[1] || '', lines[index + 1] || '');
    if (!currentDate || !currentStart || !currentEnd || !currentCourse || !venue) {
      incompleteRowCount += 1;
      continue;
    }
    const courseCode = currentCourse.match(/\b[A-Z]{2,6}\s*\d{3,5}[A-Z]?\b/i)?.[0] || '';
    const reference = courseCode ? findCourseReference(courseCode, courseReferences) : undefined;
    if (courseReferences.length && !reference) {
      excludedCourseRowCount += 1;
      continue;
    }
    const suffix = groupLabel.toUpperCase().slice(target.base.length).trim();
    const ambiguous = !target.subgroup || suffix !== target.subgroup || /[,/]/.test(venue);
    events.push({
      courseUnit: reference ? canonicalCourseName(reference) : currentCourse,
      lecturer: reference?.lecturer,
      venue,
      date: currentDate,
      day: currentDay,
      startTime: currentStart,
      endTime: currentEnd,
      matchedGroupLabel: groupLabel,
      ambiguousMatch: ambiguous,
    });
  }

  if (!events.length && courseReferences.length) {
    throw new Error('This is a recognized CAT/exam timetable, but none of the supplied semester units matched. Check the unit codes and try again.');
  }
  if (!events.length) return null;
  return {
    documentType: 'cat',
    formatId: 'kca_assessment_table_v1',
    formatLabel: 'Combined CAT assessment table',
    groupSearched: groupCode,
    events,
    warnings: [
      `Found ${matchedGroupRowCount} group rows; ${events.length} matched the semester profile, ${excludedCourseRowCount} other-unit rows were excluded, and ${incompleteRowCount} incomplete rows were not imported.`,
      'Parsed from the PDF text layer. Verify every highlighted combined-group or multi-venue row before syncing.',
    ],
  };
}
