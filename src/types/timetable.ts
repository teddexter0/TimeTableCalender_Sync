
export type DocumentType = 'class' | 'cat' | 'exam';

export interface CourseReference {
  code?: string;
  name: string;
  lecturer?: string;
}

export interface TimetableProfile {
  groupCode: string;
  groupAliases: string[];
  courses: CourseReference[];
  semesterStart: string;
  semesterEnd: string;
}

export interface TimetableEvent {
  id?: string;
  courseUnit: string;
  lecturer?: string;
  venue: string;
  date: string | null;
  day: string | null;
  startTime: string;
  endTime: string;
  matchedGroupLabel: string;
  ambiguousMatch: boolean;
  googleEventId?: string;
}

export interface ParsedTimetable {
  documentType: DocumentType;
  formatId: 'kca_weekly_grid_v1' | 'kca_assessment_table_v1' | 'strathmore_end_semester_exam_v1';
  formatLabel: string;
  groupSearched: string;
  events: TimetableEvent[];
  warnings: string[];
}

export function formatTimeRange(event: TimetableEvent): string {
  return `${event.startTime}-${event.endTime}`;
}
