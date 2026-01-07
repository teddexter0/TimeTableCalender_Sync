import pdfParse from 'pdf-parse';

interface ClassEvent {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  subject: string;
  lecturer: string;
  venue: string;
}

interface ExamEvent {
  courseCode: string;
  subject: string;
  examDate: string;
  examTime: string;
  endTime: string;
  invigilator: string;
  venue: string;
}

export async function parseClassTimetable(
  pdfBuffer: Buffer,
  courseCodes: string[],
  studentGroup: string
): Promise<ClassEvent[]> {
  const data = await pdfParse(pdfBuffer);
  const text = data.text;
  
  const events: ClassEvent[] = [];
  const lines = text.split('\n').filter((line: string) => line.trim());
  
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timePattern = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
  
  let currentDay: string | null = null;
  
  for (const line of lines) {
    // Detect day
    for (const day of days) {
      if (line.toLowerCase().includes(day.toLowerCase())) {
        currentDay = day;
      }
    }
    
    // Check for user's course codes
    const foundCode = courseCodes.find((code: string) => 
      line.toUpperCase().includes(code.toUpperCase())
    );
    
    if (foundCode && currentDay) {
      const timeMatch = line.match(timePattern);
      
      if (timeMatch) {
        // Extract lecturer (pattern: Dr. Name, Prof. Name, or Initial. Name)
        const lecturerMatch = line.match(/([A-Z]\.\s*[A-Z][a-z]+|Dr\.\s*[A-Z][a-z]+|Prof\.\s*[A-Z][a-z]+)/);
        
        // Extract venue (pattern: MSB 8, STM-B F2-01, etc.)
        const venueMatch = line.match(/(MSB|STM|SBS|F)\s*[\w-]+\s*\d*/i);
        
        // Extract subject name (longest non-code text)
        const parts = line.split(/\s{2,}/);
        const subject = parts.find((p: string) => 
          p.length > 10 && 
          !timePattern.test(p) && 
          !p.includes(foundCode)
        ) || 'Class';
        
        events.push({
          day: currentDay,
          startTime: `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`,
          endTime: `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`,
          courseCode: foundCode,
          subject: subject.trim(),
          lecturer: lecturerMatch ? lecturerMatch[1] : '',
          venue: venueMatch ? venueMatch[0] : '',
        });
      }
    }
  }
  
  return events;
}

export async function parseExamTimetable(
  pdfBuffer: Buffer,
  courseCodes: string[],
  studentGroup: string
): Promise<ExamEvent[]> {
  const data = await pdfParse(pdfBuffer);
  const text = data.text;
  
  const events: ExamEvent[] = [];
  const lines = text.split('\n').filter((line: string) => line.trim());
  
  const datePattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2})[a-z]{2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
  const timePattern = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
  
  const groupNorm = studentGroup.replace(/\s+/g, '').toUpperCase();
  let currentDate: string | null = null;
  
  for (const line of lines) {
    // Detect date
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      const monthMap: Record<string, string> = {
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12'
      };
      const month = monthMap[dateMatch[3].toLowerCase()];
      const day = dateMatch[2].padStart(2, '0');
      currentDate = `${dateMatch[4]}-${month}-${day}`;
    }
    
    // Check for course code
    const foundCode = courseCodes.find((code: string) => 
      line.toUpperCase().includes(code.toUpperCase())
    );
    
    if (foundCode && currentDate) {
      // Check group match
      const lineNorm = line.replace(/\s+/g, '').toUpperCase();
      const groupVariations = [
        groupNorm,
        groupNorm.replace('1.2A', 'A'),
        groupNorm + '25',
        'AUG25' + groupNorm.replace('BBIT', ''),
      ];
      
      const groupMatches = groupVariations.some((v: string) => lineNorm.includes(v));
      
      if (groupMatches) {
        const timeMatch = line.match(timePattern);
        
        if (timeMatch) {
          const examNameMatch = line.match(new RegExp(`${foundCode}:\\s*([^|]+)`, 'i'));
          const invigilatorMatch = line.match(/([A-Z]\.\s*[A-Z][a-z]+)$/);
          
          events.push({
            courseCode: foundCode,
            subject: examNameMatch ? examNameMatch[1].trim() : 'Exam',
            examDate: currentDate,
            examTime: `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`,
            endTime: `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`,
            invigilator: invigilatorMatch ? invigilatorMatch[1] : '',
            venue: 'Check exam card',
          });
        }
      }
    }
  }
  
  return events;
}