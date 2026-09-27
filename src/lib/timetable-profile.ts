import { CourseReference } from '@/types/timetable';

export function normalizeCourseCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function parseCourseReferences(value: string): CourseReference[] {
  const references: CourseReference[] = [];
  for (const [index, rawLine] of value.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split('|').map(part => part.trim());
    const codeMatch = parts[0].match(/\b([A-Z]{2,6}\s*[A-Z]?\d{3,5}[A-Z]?)\b/i);
    const explicitlyCodeLess = /^(?:NO\s*CODE|CODELESS|-)$/i.test(parts[0]);
    if (!codeMatch && !explicitlyCodeLess) throw new Error(`Unit line ${index + 1} needs a course code, or start with NO CODE for units such as Maisha/electives.`);
    const code = codeMatch ? normalizeCourseCode(codeMatch[1]) : undefined;
    const inlineName = parts[0].replace(codeMatch?.[0] || '', '').replace(/^\s*[:\-]\s*/, '').trim();
    const name = parts[1] || (explicitlyCodeLess ? '' : inlineName);
    if (!name) throw new Error(`Unit line ${index + 1} needs the exact course name after |.`);
    references.push({ code, name, lecturer: parts[2] || undefined });
  }
  return references;
}

export function parseGroupAliases(value: string): string[] {
  return [...new Set(value.split(/[,\r\n]+/).map(alias => alias.trim()).filter(Boolean))];
}

export function findCourseReference(code: string, references: CourseReference[]): CourseReference | undefined {
  const normalized = normalizeCourseCode(code);
  return references.find(reference => reference.code && normalizeCourseCode(reference.code) === normalized);
}

export function findCodeLessCourseReference(text: string, references: CourseReference[]): CourseReference | undefined {
  const normalizedText = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return references.find(reference => {
    if (reference.code) return false;
    const normalizedName = reference.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalizedName.length >= 4 && normalizedText.includes(normalizedName);
  });
}

export function canonicalCourseName(reference: CourseReference): string {
  return `${reference.code || ''} ${reference.name}`.replace(/\s+/g, ' ').trim();
}
