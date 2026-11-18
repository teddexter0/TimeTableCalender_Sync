import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface ExamGridRow {
  date: string;
  time: string;
  course: string;
  group: string;
  venue: string;
  lecturer: string;
}

interface PositionedText {
  text: string;
  x: number;
  y: number;
  right: number;
}

function cellText(items: PositionedText[], top: number, bottom: number): string {
  const words = items.filter(item => item.y < top && item.y > bottom)
    .sort((a, b) => Math.abs(a.y - b.y) < 1 ? a.x - b.x : b.y - a.y);
  return words.reduce((value, word, index) => {
    const previous = words[index - 1];
    const separator = previous && (Math.abs(previous.y - word.y) >= 1 || word.x - previous.right > 0.8) ? ' ' : '';
    return value + separator + word.text;
  }, '').replace(/\s+/g, ' ').trim();
}

function cellAt(items: PositionedText[], boundaries: number[], y: number): string {
  const below = boundaries.findIndex(boundary => boundary < y);
  return below > 0 ? cellText(items, boundaries[below - 1], boundaries[below]) : '';
}

async function readPage(page: PDFPageProxy, pathOperator: number, fills: Set<number>): Promise<ExamGridRow[] | null> {
  const content = await page.getTextContent();
  const text = content.items.flatMap(item => 'str' in item && item.str.trim() ? [{
    text: item.str, x: item.transform[4], y: item.transform[5], right: item.transform[4] + item.width,
  }] : []);
  const names = ['DATE', 'TIME', 'EXAMINATION', 'GROUP', 'NO', 'VENUE', 'LECTURER'];
  const dateHeader = text.find(item => item.text.trim() === 'DATE');
  if (!dateHeader) return text.some(item => /OTES TO STUDENTS/i.test(item.text)) ? [] : null;
  const header = names.map(name => text.find(item => Math.abs(item.y - dateHeader.y) < 2 && item.text.trim() === name));
  if (!header.every((item): item is PositionedText => Boolean(item))) return null;

  const { fnArray, argsArray } = await page.getOperatorList();
  const borders = fnArray.flatMap((operator, index) => {
    if (operator !== pathOperator) return [];
    const [paint, , bounds] = argsArray[index] || [];
    if (!bounds || !fills.has(paint) || bounds[3] - bounds[1] > 2 || bounds[2] - bounds[0] < 12) return [];
    return [{ left: bounds[0] as number, right: bounds[2] as number, y: (bounds[1] + bounds[3]) / 2 }];
  });
  const columns = header.map((item, index) => ({
    items: text.filter(word => word.y < dateHeader.y - 3 && word.x >= item.x - 3 && word.x < (header[index + 1]?.x ?? Infinity) - 3),
    boundaries: [...new Set(borders.filter(border => border.y < dateHeader.y && border.left <= item.x && border.right >= item.x + 6)
      .map(border => Math.round(border.y * 2) / 2))].sort((a, b) => b - a),
  }));
  const groups = columns[3];
  if (columns.some(column => column.boundaries.length < 2)) return null;
  return groups.boundaries.slice(1).flatMap((bottom, index) => {
    const top = groups.boundaries[index];
    const group = cellText(groups.items, top, bottom);
    if (!group) return [];
    const [date, time, course, , , venue, lecturer] = columns.map(column => cellAt(column.items, column.boundaries, (top + bottom) / 2));
    return [{ date, time, course, group, venue, lecturer }];
  });
}

export async function readExamGrid(buffer: Buffer): Promise<ExamGridRow[] | null> {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
  let document: PDFDocumentProxy;
  try {
    document = await loading.promise;
    const rows: ExamGridRow[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const pageRows = await readPage(page, OPS.constructPath, new Set([OPS.fill, OPS.eoFill]));
      page.cleanup();
      if (!pageRows) return null;
      rows.push(...pageRows);
    }
    return rows;
  } finally {
    await loading.destroy();
  }
}
