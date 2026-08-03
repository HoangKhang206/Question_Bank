// SP2 helper: Answer Format Auto-Detection
// Input : buffer (.docx), html (from mammoth), text (plain)
// Output: Map<number, string> — câu số → đáp án (A/B/C/D hoặc text)
// Constraint: Deterministic, không gọi AI.
//
// Thứ tự ưu tiên:
//   1. Underline (<u> trong HTML của mammoth)
//   2. Color (w:color trong XML docx qua jszip)
//   3. Text patterns (Chọn X. / Câu X: A / Đáp án: X)
//   4. none → caller dùng Gemini auto_answer

import JSZip from 'jszip';

export type AnswerFormat = 'underline' | 'color' | 'text' | 'none';

// ─── Format detection ──────────────────────────────────────────────────────────

/**
 * Heuristic: nếu có ít nhất 3 <u>A</u>/<u>B</u>/<u>C</u>/<u>D</u> → underline mode.
 */
function hasUnderlineAnswers(html: string): boolean {
  // Match <u>A</u>, <u>B.</u>, <u>A.</u> hoặc X.<u>text</u> ngay sau option label
  const hits = Array.from(html.matchAll(/<u>[^<]*\b([ABCD])\b[^<]*<\/u>/gi));
  return hits.length >= 3;
}

/**
 * Detect + extract color answers trong một lần JSZip load.
 * Trả về null nếu không phát hiện color format, trả về Map nếu có.
 */
async function extractColorAnswersIfPresent(buffer: Buffer): Promise<Map<number, string> | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return null;

    // Quick check: đủ số colored runs chứa A/B/C/D không?
    const runs = Array.from(docXml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g));
    let quickHits = 0;
    for (const r of runs) {
      const run = r[0];
      const colorM = run.match(/<w:color\s+w:val="([^"]+)"/);
      if (!colorM) continue;
      const val = colorM[1].toLowerCase();
      if (val === '000000' || val === 'auto') continue;
      const textM = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
      if (!textM) continue;
      if (/\b[ABCD]\b/.test(textM[1])) quickHits++;
    }
    if (quickHits < 3) return null;

    // Đủ signal → extract theo paragraph
    const map = new Map<number, string>();
    const paragraphs = Array.from(docXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g));

    const getText = (p: string) =>
      Array.from(p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)).map(m => m[1]).join('');

    const getColoredAnswer = (p: string): string | null => {
      for (const runM of p.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)) {
        const run = runM[0];
        if (!/<w:color/.test(run)) continue;
        const colorM = run.match(/<w:color\s+w:val="([^"]+)"/);
        if (!colorM || colorM[1] === '000000' || colorM[1].toLowerCase() === 'auto') continue;
        const textM = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
        if (!textM) continue;
        const t = textM[1].trim();
        if (/^[ABCD][.)]?\s*$/.test(t)) return t[0];
        const inside = t.match(/\b([ABCD])\b/);
        if (inside) return inside[1];
      }
      return null;
    };

    let currentNum: number | null = null;
    for (const pm of paragraphs) {
      const p = pm[0];
      const txt = getText(p);
      const cauM = txt.match(/^(?:Câu\s+)?(\d+)\s*[.):]/);
      if (cauM) currentNum = parseInt(cauM[1], 10);
      if (currentNum !== null && !map.has(currentNum)) {
        const ans = getColoredAnswer(p);
        if (ans) map.set(currentNum, ans);
      }
    }
    return map.size >= 3 ? map : null;
  } catch (e) {
    console.warn('[answer-detect] color extraction failed:', e);
    return null;
  }
}

/**
 * Heuristic: có ít nhất 3 pattern text-based (Câu X: A hoặc Chọn X.)
 */
function hasTextAnswers(text: string): boolean {
  const table = Array.from(text.matchAll(/Câu\s+\d+\s*[.:)]\s*[ABCD]\b/g));
  const chon = Array.from(text.matchAll(/Chọn\s+[ABCD][.\s]/g));
  return table.length + chon.length >= 3;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

/**
 * Underline extractor: quét HTML, tìm <u>...</u> gần marker câu.
 * Chiến lược: với mỗi block câu (từ "Câu N" đến "Câu N+1"),
 * tìm <u> tag chứa A/B/C/D đơn lẻ hoặc là chính option đó.
 */
export function extractAnswersFromUnderline(html: string): Map<number, string> {
  const map = new Map<number, string>();

  // Tìm tất cả vị trí "Câu N" trong HTML
  const cauMatches = Array.from(html.matchAll(/(?:Câu\s+)?(\d+)\s*[.):\s]/g));
  // Lọc chỉ những cái là câu hỏi (số từ 1 đến 999)
  const qMarkers: Array<{ num: number; idx: number }> = [];
  for (const m of cauMatches) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 999) {
      qMarkers.push({ num: n, idx: m.index! });
    }
  }

  // Với mỗi câu, lấy đoạn HTML từ câu này đến câu sau
  for (let i = 0; i < qMarkers.length; i++) {
    const start = qMarkers[i].idx;
    const end = i + 1 < qMarkers.length ? qMarkers[i + 1].idx : html.length;
    const block = html.slice(start, end);
    const num = qMarkers[i].num;

    // Tìm <u> tag trong block chứa A/B/C/D
    // Pattern: <u>A</u>, <u>B.</u>, <u>A. text</u>
    const uMatch = block.match(/<u>([^<]*\b([ABCD])\b[^<]*)<\/u>/i);
    if (uMatch) {
      map.set(num, uMatch[2] as string);
    }
  }

  return map;
}

/**
 * Text extractor: dùng lại logic từ segment.ts (Chọn X. / Câu X: A / Đáp án: X).
 * Extracted here to avoid circular dep — segment.ts sẽ import từ đây nếu cần.
 */
export function extractAnswersFromText(text: string): Map<number, string> {
  const map = new Map<number, string>();

  // Format 1: bảng đáp án "Câu 1: A"
  for (const m of text.matchAll(/Câu\s+(\d+)\s*[.:)]\s*([ABCD])\b/g)) {
    map.set(parseInt(m[1], 10), m[2]);
  }

  // Format 2: "Chọn X." sau "Câu N"
  const cauPositions = Array.from(text.matchAll(/Câu\s+(\d+)/g));
  const chonMatches = Array.from(text.matchAll(/Chọn\s+([ABCD])[.\s]/g));
  for (const chon of chonMatches) {
    const chonPos = chon.index!;
    const prevCau = cauPositions.filter(m => m.index! < chonPos).at(-1);
    if (prevCau) map.set(parseInt(prevCau[1], 10), chon[1]);
  }

  // Format 3: "Đáp án: X" sau "Câu N"
  for (const m of text.matchAll(/Câu\s+(\d+)[\s\S]{0,500}?Đáp án:\s*([^\n.]+)[.\n]/g)) {
    const num = parseInt(m[1], 10);
    const val = m[2].trim();
    if (val && !map.has(num)) map.set(num, val);
  }

  return map;
}

// ─── Main auto-detect entry ───────────────────────────────────────────────────

export interface AnswerDetectResult {
  format: AnswerFormat;
  answers: Map<number, string>;
}

/**
 * Auto-detect answer format và extract đáp án.
 * buffer: chỉ cần cho .docx (color detection); pdf truyền null.
 */
export async function extractAnswersAuto(
  buffer: Buffer | null,
  html: string,
  text: string
): Promise<AnswerDetectResult> {
  // 1. Underline (HTML-based — nhanh)
  if (hasUnderlineAnswers(html)) {
    const answers = extractAnswersFromUnderline(html);
    if (answers.size >= 3) {
      console.log(`[answer-detect] format=underline, ${answers.size} đáp án`);
      return { format: 'underline', answers };
    }
  }

  // 2. Color (docx XML — cần buffer, single JSZip load)
  if (buffer) {
    const colorAnswers = await extractColorAnswersIfPresent(buffer);
    if (colorAnswers) {
      console.log(`[answer-detect] format=color, ${colorAnswers.size} đáp án`);
      return { format: 'color', answers: colorAnswers };
    }
  }

  // 3. Text patterns
  if (hasTextAnswers(text)) {
    const answers = extractAnswersFromText(text);
    if (answers.size >= 3) {
      console.log(`[answer-detect] format=text, ${answers.size} đáp án`);
      return { format: 'text', answers };
    }
  }

  // 4. Không detect được → caller dùng Gemini
  console.log('[answer-detect] format=none, không tìm được đáp án');
  return { format: 'none', answers: new Map() };
}
