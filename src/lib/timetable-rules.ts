import { DocumentType, TimetableEvent } from '@/types/timetable';

export const NAIROBI_TIME_ZONE = 'Africa/Nairobi';

const EXAM_REMINDERS_BEFORE_CALENDAR_BLOCK = [30, 1440, 4320, 7200, 10080];

export function reminderMinutes(documentType: DocumentType): number[] {
  if (documentType === 'class') return [30];
  return EXAM_REMINDERS_BEFORE_CALENDAR_BLOCK;
}

export function normalizeGroupCode(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function validateIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function validateEvent(event: TimetableEvent, documentType: DocumentType): string[] {
  const errors: string[] = [];
  if (!event.courseUnit.trim()) errors.push('course unit is missing');
  if (event.courseUnit.trim().length > 300) errors.push('course unit is too long');
  if (event.lecturer !== undefined && event.lecturer.trim().length > 200) errors.push('lecturer is too long');
  if (!event.venue.trim()) errors.push('venue is missing');
  if (event.venue.trim().length > 500) errors.push('venue is too long');
  if (!validateTime(event.startTime)) errors.push('start time is invalid');
  if (!validateTime(event.endTime)) errors.push('end time is invalid');
  if (validateTime(event.startTime) && validateTime(event.endTime) && minutesFromTime(event.endTime) <= minutesFromTime(event.startTime)) {
    errors.push('end time must be after start time');
  }
  if (documentType !== 'class' && (!event.date || !validateIsoDate(event.date))) {
    errors.push('exam/CAT date is missing or invalid');
  }
  if (documentType === 'class' && !event.day && !event.date) errors.push('class day/date is missing');
  if (!event.matchedGroupLabel.trim()) errors.push('matched group label is missing');
  if (event.matchedGroupLabel.trim().length > 200) errors.push('matched group label is too long');
  return errors;
}

export function firstOccurrenceForDay(semesterStart: string, day: string): string {
  if (!validateIsoDate(semesterStart)) throw new Error('A valid semester start date is required for weekly classes.');
  const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .findIndex(item => item.toLowerCase() === day.toLowerCase());
  if (dayIndex < 0) throw new Error(`Unsupported class day: ${day}`);
  const date = new Date(`${semesterStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (dayIndex - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}
