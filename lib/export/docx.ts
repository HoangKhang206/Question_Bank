// SP6: Document Generation (Word)
// Input : examName, questions[], variant, meta
// Output: Buffer .docx với định dạng chuẩn đề thi Việt Nam
// Sections: Phần I (trắc nghiệm) → Phần II (đúng/sai) → Phần III (trả lời ngắn) → Phần IV (tự luận)

import {
  Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
} from 'docx';
import type { Question, ExamMeta, QuestionType, QuestionOption } from '@/lib/types';

export type ExportVariant = 'blank' | 'with_answer';

const TYPE_ORDER: QuestionType[] = ['multiple_choice', 'true_false', 'short_answer', 'essay'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const SECTION_INSTRUCTION: Record<QuestionType, string> = {
  multiple_choice: 'Mỗi câu hỏi thí sinh chọn một phương án.',
  true_false: 'Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.',
  short_answer: 'Thí sinh điền câu trả lời ngắn vào chỗ trống.',
  essay: 'Thí sinh trình bày bài làm vào giấy thi.'
};

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};

function optionLayout(opts: QuestionOption[]): 1 | 2 | 4 {
  const maxLen = Math.max(...opts.map((o) => `${o.key}. ${o.text}`.length));
  if (maxLen <= 25) return 1;
  if (maxLen <= 55) return 2;
  return 4;
}

function makeOptionCell(o: QuestionOption, isAnswer: boolean, widthPct: number): TableCell {
  return new TableCell({
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    children: [para([
      txt(`${o.key}.`, { bold: true, underline: isAnswer ? { type: UnderlineType.SINGLE } : undefined }),
      txt(` ${o.text}`),
    ])],
  });
}

// Strip all HTML → plain text (dùng cho baseContent / fallback)
function htmlToPlain(content: string): string {
  return content
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Đọc kích thước ảnh từ buffer (PNG / JPEG) — không cần thư viện ngoài
function getImageDimensions(buf: Buffer, mime: string): { width: number; height: number } {
  try {
    if (mime.includes('png') && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if ((mime.includes('jpeg') || mime.includes('jpg')) && buf.length > 4) {
      let i = 2;
      while (i + 4 < buf.length) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* fallback bên dưới */ }
  return { width: 400, height: 300 };
}

// Scale ảnh để không vượt quá chiều rộng nội dung A4 (~480px tương đương ~12.7cm)
function fitToPage(width: number, height: number, maxW = 480): { width: number; height: number } {
  if (width <= maxW) return { width, height };
  return { width: maxW, height: Math.round(height * maxW / width) };
}

// Chuyển <img src="data:...;base64,..."> → ImageRun
function htmlImgToRun(imgTag: string): ImageRun | null {
  const srcM = imgTag.match(/src="([^"]+)"/i);
  if (!srcM) return null;
  const dataM = srcM[1].match(/^data:([^;]+);base64,(.+)$/);
  if (!dataM) return null;
  const mime = dataM[1].toLowerCase();
  const buf = Buffer.from(dataM[2], 'base64');
  const raw = getImageDimensions(buf, mime);
  const dims = fitToPage(raw.width, raw.height);
  const type = (mime.includes('jpeg') || mime.includes('jpg')) ? 'jpg'
    : mime.includes('gif') ? 'gif'
    : 'png';
  return new ImageRun({ data: buf, transformation: dims, type });
}

// Convert HTML <table> string → docx Table (có border)
function htmlTableToDocx(tableHtml: string): Table | null {
  const rows: TableRow[] = [];
  for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: TableCell[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
      const cellText = htmlToPlain(cellMatch[1]).trim();
      const isHeader = cellMatch[0].trimStart().startsWith('<th');
      cells.push(new TableCell({
        children: [para([txt(cellText, isHeader ? { bold: true } : {})])],
      }));
    }
    if (cells.length > 0) rows.push(new TableRow({ children: cells }));
  }
  if (rows.length === 0) return null;
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// Convert HTML content → mảng Paragraph/Table (xử lý bảng inline)
// leadRun: TextRun được prepend vào text block đầu tiên (VD: "Câu 1. " bold)
function htmlToDocxBlocks(
  content: string,
  leadRun?: TextRun
): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  let usedLead = false;

  const parts = content.split(/(<table[\s\S]*?<\/table>|<img[^>]*\/?>)/gi);
  for (const part of parts) {
    if (/<table/i.test(part)) {
      const table = htmlTableToDocx(part);
      if (table) result.push(table);
    } else if (/<img/i.test(part)) {
      const imgRun = htmlImgToRun(part);
      if (imgRun) result.push(para([imgRun]));
    } else {
      const text = htmlToPlain(part);
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (!usedLead && leadRun) {
          result.push(para([leadRun, txt(t)]));
          usedLead = true;
        } else {
          result.push(para([txt(t)]));
        }
      }
    }
  }

  if (leadRun && !usedLead) result.unshift(para([leadRun]));
  return result;
}

function stripQNum(content: string): string {
  return content.replace(/^Câu\s*\d+\s*[.:]\s*/u, '');
}

function stripOptions(content: string): string {
  const m = content.match(/[\s\n]+[Aa][.)]\s/);
  if (m?.index !== undefined) return content.slice(0, m.index).trim();
  return content;
}

function parseTrueFalseFromContent(content: string): { stem: string; stmts: Array<{ key: string; text: string }> } {
  const startIdx = content.search(/\s+[a-dA-D]\s*[.)]\s/);
  if (startIdx === -1) return { stem: content, stmts: [] };

  const stem = content.slice(0, startIdx).trim();
  const rest = content.slice(startIdx).trim();

  const parts = rest.split(/\s+(?=[a-dA-D][.)]\s)/);
  const stmts = parts
    .map((p) => p.match(/^([a-dA-D])[.)]\s+([\s\S]+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ key: m[1].toLowerCase(), text: m[2].trim() }));

  return { stem, stmts };
}

function parseTrueFalse(answer: string | null): Record<string, string> {
  if (!answer) return {};
  const map: Record<string, string> = {};
  for (const part of answer.split(',')) {
    const i = part.indexOf(':');
    if (i !== -1) map[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return map;
}

function txt(text: string, opts: ConstructorParameters<typeof TextRun>[0] = {}): TextRun {
  return new TextRun({ text, ...(typeof opts === 'string' ? {} : opts) });
}

function para(runs: (TextRun | ImageRun)[], opts: ConstructorParameters<typeof Paragraph>[0] = {}): Paragraph {
  return new Paragraph({ children: runs, ...(typeof opts === 'object' ? opts : {}) });
}

function empty(): Paragraph {
  return new Paragraph({ children: [] });
}

function hrLine(): Paragraph {
  return new Paragraph({
    children: [txt('─'.repeat(80), { size: 12 })],
    alignment: AlignmentType.CENTER
  });
}

export async function generateExamDocx(
  examName: string,
  questions: Question[],
  variant: ExportVariant,
  meta?: ExamMeta
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // ── Header ───────────────────────────────────────────────────────────────

  if (meta?.school) {
    children.push(para(
      [txt(meta.school, { bold: true, size: 22 })],
      { alignment: AlignmentType.LEFT }
    ));
  }

  const title = meta?.exam_title || examName;
  children.push(para(
    [txt(title, { bold: true, size: 28 })],
    { alignment: AlignmentType.CENTER }
  ));

  const subjectParts = [
    meta?.subject ? `Môn: ${meta.subject}` : null,
    meta?.date ? `Ngày thi: ${meta.date}` : null,
    meta?.duration ? `Thời gian làm bài: ${meta.duration}` : null,
  ].filter(Boolean);

  if (subjectParts.length > 0) {
    children.push(para(
      [txt(subjectParts.join(' – '), { size: 22 })],
      { alignment: AlignmentType.CENTER }
    ));
  }

  children.push(hrLine());

  // ── Thông tin thí sinh ────────────────────────────────────────────────────

  children.push(para([
    txt('Họ và tên thí sinh: '),
    txt('...............................................', { underline: { type: UnderlineType.SINGLE } }),
    txt('     Số báo danh: '),
    txt('...............', { underline: { type: UnderlineType.SINGLE } }),
  ]));

  // ── Cho biết ─────────────────────────────────────────────────────────────

  if (meta?.constants?.trim()) {
    children.push(para(
      [txt(meta.constants.trim(), { italics: true, size: 22 })],
    ));
  }

  children.push(empty());

  // ── Sections theo dạng câu ───────────────────────────────────────────────

  // Group questions by type, preserve relative order
  const grouped = new Map<QuestionType, Question[]>();
  for (const t of TYPE_ORDER) grouped.set(t, []);
  for (const q of questions) {
    const arr = grouped.get(q.type);
    if (arr) arr.push(q);
  }

  let sectionIdx = 0;

  for (const t of TYPE_ORDER) {
    const qs = grouped.get(t);
    if (!qs || qs.length === 0) continue;

    const roman = ROMAN[sectionIdx++] ?? String(sectionIdx);
    const header = `Phần ${roman}. Thí sinh trả lời từ câu 1 đến câu ${qs.length}. ${SECTION_INSTRUCTION[t]}`;

    children.push(para([txt(header, { bold: true, size: 22 })], { spacing: { before: 120 } }));
    children.push(empty());

    qs.forEach((q, idx) => {
      const isHtml = q.content.trimStart().startsWith('<');
      const baseContent = stripQNum(htmlToPlain(q.content));
      const hasStoredOptions = !!(q.options && q.options.length > 0);

      // Cho true_false không có options trong DB: parse statements từ content
      let displayStem = hasStoredOptions ? stripOptions(baseContent) : baseContent;
      let parsedTFStmts: Array<{ key: string; text: string }> = [];

      if (t === 'true_false' && !hasStoredOptions) {
        const parsed = parseTrueFalseFromContent(baseContent);
        displayStem = parsed.stem;
        parsedTFStmts = parsed.stmts;
      } else if (t === 'multiple_choice' && !hasStoredOptions) {
        displayStem = stripOptions(baseContent);
      }

      const leadRun = txt(`Câu ${idx + 1}. `, { bold: true });
      if (isHtml) {
        // html_content đã strip "Câu N." và đã loại options — render cả bảng/ảnh
        children.push(...htmlToDocxBlocks(q.content, leadRun));
      } else {
        children.push(para([leadRun, txt(displayStem)]));
      }

      if (t === 'multiple_choice') {
        const opts = q.options ?? [];
        const isAns = (key: string) => variant === 'with_answer' && key === q.answer;
        const layout = optionLayout(opts);

        if (layout === 4) {
          opts.forEach((o) => {
            children.push(para([
              txt(`${o.key}.`, { bold: true, underline: isAns(o.key) ? { type: UnderlineType.SINGLE } : undefined }),
              txt(` ${o.text}`),
            ], { indent: { left: 720 } }));
          });
        } else if (layout === 2) {
          const pairs = [[opts[0], opts[1]], [opts[2], opts[3]]];
          for (const pair of pairs) {
            children.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              rows: [new TableRow({ children: pair.filter(Boolean).map((o) => makeOptionCell(o, isAns(o.key), 50)) })],
            }));
          }
        } else {
          children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            rows: [new TableRow({ children: opts.map((o) => makeOptionCell(o, isAns(o.key), 25)) })],
          }));
        }

      } else if (t === 'true_false') {
        const answerMap = parseTrueFalse(q.answer);
        const stmts = hasStoredOptions
          ? (q.options ?? []).map((o) => ({ key: o.key, text: o.text }))
          : parsedTFStmts;

        stmts.forEach((o) => {
          const isCorrect = variant === 'with_answer' && answerMap[o.key] === 'Đúng';
          children.push(para([
            txt(o.key, { bold: true, underline: isCorrect ? { type: UnderlineType.SINGLE } : undefined }),
            txt(`) ${o.text}`),
          ], { indent: { left: 720 } }));
        });

      } else if (t === 'short_answer') {
        if (variant === 'with_answer' && q.answer) {
          children.push(para(
            [txt(`Đáp án: ${q.answer}`, { italics: true, bold: true, color: '1a56db' })],
            { indent: { left: 720 }, spacing: { before: 60 } }
          ));
        } else {
          children.push(para([txt('Trả lời: ........................................')], { indent: { left: 720 } }));
        }

      } else if (t === 'essay') {
        if (variant === 'with_answer' && q.answer) {
          children.push(para(
            [txt(`Gợi ý: ${q.answer}`, { italics: true, color: '1a56db' })],
            { indent: { left: 720 }, spacing: { before: 60 } }
          ));
        }
      }

      if (variant === 'with_answer' && q.explanation) {
        children.push(para(
          [txt('Lời giải: ', { bold: true, italics: true }), txt(q.explanation, { italics: true })],
          { indent: { left: 720 }, spacing: { before: 60 } }
        ));
      }

      children.push(empty());
    });
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return await Packer.toBuffer(doc);
}
