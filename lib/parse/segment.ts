// SP2: Question Segmentation
// Input : text từ SP1 + danh sách range [{from, to, type}]
// Output: [{number, type, raw_content, options?}]
// Constraint: Deterministic, ≤ 500ms. Không gọi AI.
//
// Hỗ trợ 2 cấu trúc:
//   Flat   : câu đánh số liên tục 1→N
//   PHẦN   : nhiều phần, mỗi phần đánh lại từ 1 → offset tự động

import type { QuestionRange, QuestionOption, RawQuestion, QuestionType } from '@/lib/types';

// Match "Câu 1.", "Câu 1:", "Câu 1)" HOẶC "1.", "1)" ở đầu dòng
const QUESTION_MARKER = /^(?:Câu\s+)?(\d+)\s*[.):]/gm;

// Tách đáp án A/B/C/D (trắc nghiệm)
// Multi-line: \s*\n\s*[ABCD][.)]  |  Inline: \s+[ABCD][.)]  |  Double-space: \s{2,}
// Stop early nếu gặp "Lời giải" / "Hướng dẫn" / "Chọn X." để tránh D nuốt lời giải
const OPTION_PATTERN = /\b([ABCD])\s*[.)]\s*(.+?)(?=\s{2,}|\s*\n\s*[ABCD]\s*[.)]|\s+[ABCD][.)]|\n\s*(?:Lời giải|Hướng dẫn|Giải|Chọn\s+[ABCD])\b|$)/gs;

// Tách sub-statement a/b/c/d (đúng/sai 4 ý)
const STATEMENT_PATTERN = /(?:^|\n)\s*([abcd])\s*[.)]\s*(.+?)(?=\n\s*[abcd]\s*[.)]|$)/gs;

// Detect "Phần I", "PHẦN II", "Phần III"... (hỗ trợ cả viết hoa lẫn viết thường)
const PHAN_PATTERN = /[Pp][Hh][ầẦ][Nn]\s+([IVX]+)/g;

// ─── Parse options (trắc nghiệm A/B/C/D) ─────────────────────────────────────

export function parseOptions(raw: string): QuestionOption[] | null {
  const matches = Array.from(raw.matchAll(OPTION_PATTERN));
  if (matches.length < 4) return null;

  const opts: QuestionOption[] = [];
  for (const m of matches) {
    const key = m[1] as 'A' | 'B' | 'C' | 'D';
    const text = m[2].trim();
    if (text) opts.push({ key, text });
  }

  if (opts.length < 4) return null;
  return opts.slice(0, 4);
}

// ─── Parse statements (đúng/sai a/b/c/d) ─────────────────────────────────────

export function parseTrueFalseStatements(raw: string): QuestionOption[] | null {
  const matches = Array.from(raw.matchAll(new RegExp(STATEMENT_PATTERN.source, 'gs')));
  if (matches.length < 2) return null;

  const opts: QuestionOption[] = [];
  for (const m of matches) {
    const key = m[1] as 'a' | 'b' | 'c' | 'd';
    const text = m[2].trim();
    if (text) opts.push({ key, text });
  }

  if (opts.length < 2) return null;
  return opts.slice(0, 4);
}

// ─── Extract answers ──────────────────────────────────────────────────────────

export function extractAnswers(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const cauPositions = Array.from(text.matchAll(/Câu\s+(\d+)/g));

  // Format 1: "Câu 1: A", "Câu 1. B" (bảng đáp án cổ điển)
  for (const m of text.matchAll(/Câu\s+(\d+)\s*[.:)]\s*([ABCD])\b/g)) {
    map.set(parseInt(m[1], 10), m[2]);
  }

  // Format 2: "Chọn B." sau "Câu X" (phần giải trắc nghiệm)
  for (const chon of text.matchAll(/Chọn\s+([ABCD])[.\s]/g)) {
    const prevCau = cauPositions.filter((m) => m.index! < chon.index!).at(-1);
    if (prevCau) map.set(parseInt(prevCau[1], 10), chon[1]);
  }

  // Format 3: "Đáp án: X" (trả lời ngắn / tự luận) — nearest Câu, không giới hạn khoảng cách
  for (const da of text.matchAll(/Đáp án:\s*([^\n.]+)/g)) {
    const prevCau = cauPositions.filter((m) => m.index! < da.index!).at(-1);
    if (prevCau) {
      const num = parseInt(prevCau[1], 10);
      const val = da[1].trim();
      if (val && !map.has(num)) map.set(num, val);
    }
  }

  // Format 4: true_false "a) Đúng/Sai, b) Đúng/Sai..." từ Lời giải
  for (const lg of text.matchAll(/(?:Lời giải|Hướng dẫn)\b[^\n]*\n([\s\S]{1,800}?)(?=\nCâu\s+\d+|$)/gi)) {
    const prevCau = cauPositions.filter((m) => m.index! < lg.index!).at(-1);
    if (!prevCau) continue;
    const num = parseInt(prevCau[1], 10);
    if (map.has(num)) continue;
    const parts: string[] = [];
    for (const sm of lg[1].matchAll(/\b([abcd])\s*[)]\s*(Đúng|Sai)\b/gi)) {
      parts.push(`${sm[1].toLowerCase()}:${sm[2]}`);
    }
    if (parts.length >= 2) map.set(num, parts.join(','));
  }

  return map;
}

// ─── PHẦN detection ───────────────────────────────────────────────────────────

interface PhanSection { start: number; end: number }

/**
 * Tìm vị trí bắt đầu phần giải/đáp án.
 * Heuristic: khi PHẦN I xuất hiện lại sau khi đã thấy PHẦN II trở lên
 * → đó là đầu phần giải.
 */
function findContentBoundary(text: string): number {
  const matches = Array.from(text.matchAll(new RegExp(PHAN_PATTERN.source, 'g')));
  let seenNonFirst = false;
  for (const m of matches) {
    if (m[1] !== 'I') seenNonFirst = true;
    if (m[1] === 'I' && seenNonFirst) return m.index!;
  }
  return text.length;
}

/**
 * Trả về các PHẦN sections trong phần câu hỏi (trước phần giải).
 * Trả về null nếu file không có cấu trúc nhiều PHẦN.
 */
function detectPhans(text: string, boundary: number): PhanSection[] | null {
  const contentText = text.slice(0, boundary);
  const matches = Array.from(contentText.matchAll(new RegExp(PHAN_PATTERN.source, 'g')));
  if (matches.length <= 1) return null;

  return matches.map((m, i) => ({
    start: m.index!,
    end: i + 1 < matches.length ? matches[i + 1].index! : boundary
  }));
}

// ─── Core segmentation block ──────────────────────────────────────────────────

/**
 * Segment câu hỏi từ 1 đoạn text với offset số câu.
 * numberOffset: cộng thêm vào số câu để ra số toàn cục (dùng cho range lookup + DB ordering).
 * localAnswerMap: đáp án theo số câu cục bộ trong đoạn này.
 */
function segmentBlock(
  text: string,
  ranges: QuestionRange[],
  numberOffset: number,
  localAnswerMap: Map<number, string>,
  fullAnswerMap?: Map<number, string>
): RawQuestion[] {
  const marker = new RegExp(QUESTION_MARKER.source, 'gm');
  const matches = Array.from(text.matchAll(marker));
  if (matches.length === 0) return [];

  const questions: RawQuestion[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const localNumber = parseInt(match[1], 10);
    const globalNumber = localNumber + numberOffset;
    const startIdx = match.index!;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : text.length;

    const fullSlice = text.slice(startIdx, endIdx).trim();

    // Extract inline explanation trước khi lấy raw_content
    // Tìm "Lời giải", "Hướng dẫn", "Giải" xuất hiện trong khối câu hỏi
    const explInlineMatch = fullSlice.match(
      /\n\s*(?:Lời giải|Hướng dẫn(?: giải)?|Giải)\s*[:\-–]?\s*([\s\S]+)$/iu
    );
    const inlineExplanation = explInlineMatch
      ? explInlineMatch[1].trim() || null
      : null;

    // raw_content: bỏ phần lời giải inline để tránh option D nuốt text
    const raw_content = explInlineMatch
      ? fullSlice.slice(0, explInlineMatch.index!).trim()
      : fullSlice;

    // Dùng globalNumber để tra range → đảm bảo user khai báo range theo thứ tự thực
    const type = mapNumberToType(globalNumber, ranges);
    if (type === null) {
      console.warn(`[SP2] Câu ${globalNumber} (local ${localNumber}) ngoài range, skip`);
      continue;
    }

    let options: QuestionOption[] | null | undefined = undefined;
    let resolvedType = type;
    if (type === 'multiple_choice') {
      options = parseOptions(raw_content);
      if (!options) {
        // Fallback: kiểm tra xem có phải đúng/sai (a/b/c/d) không
        const tfOpts = parseTrueFalseStatements(raw_content);
        if (tfOpts) {
          resolvedType = 'true_false';
          options = tfOpts;
        } else {
          console.warn(`[SP2] Câu ${globalNumber}: không tách được đủ 4 đáp án`);
        }
      }
    } else if (type === 'true_false') {
      options = parseTrueFalseStatements(raw_content);
    }
    // short_answer / essay: không có options

    // Ưu tiên: local (per-section) → global → AI (keyed by global) → AI (keyed by local, fallback cuối)
    const answer =
      localAnswerMap.get(localNumber) ??
      localAnswerMap.get(globalNumber) ??
      fullAnswerMap?.get(globalNumber) ??
      fullAnswerMap?.get(localNumber) ??
      null;

    questions.push({
      number: globalNumber,
      type: resolvedType,
      raw_content,
      answer,
      ...(options !== undefined ? { options } : {}),
      ...(inlineExplanation ? { explanation: inlineExplanation } : {})
    });
  }

  return questions;
}

// ─── Explanation extraction ───────────────────────────────────────────────────

function extractExplanationsFromBlock(text: string, offset: number): Map<number, string> {
  const marker = new RegExp(QUESTION_MARKER.source, 'gm');
  const matches = Array.from(text.matchAll(marker));
  const map = new Map<number, string>();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const globalNum = parseInt(m[1], 10) + offset;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const raw = text.slice(start, end).trim();
    // Strip nhãn "Lời giải:" / "Giải:" nếu có
    const expl = raw.replace(/^(?:Lời giải|Hướng dẫn(?: giải)?|Giải)\s*[:\-–]?\s*/iu, '').trim();
    if (expl) map.set(globalNum, expl);
  }

  return map;
}

function extractExplanationMap(
  text: string,
  boundary: number,
  questionPhans: PhanSection[] | null,
  phanOffsets: number[]
): Map<number, string> {
  if (boundary >= text.length) return new Map();
  const explText = text.slice(boundary);

  if (!questionPhans) {
    return extractExplanationsFromBlock(explText, 0);
  }

  // Thử detect PHẦN trong phần giải
  const explPhans = detectPhans(explText, explText.length);

  if (!explPhans || explPhans.length !== questionPhans.length) {
    // Fallback: flat (phần giải dùng số câu toàn cục)
    return extractExplanationsFromBlock(explText, 0);
  }

  const map = new Map<number, string>();
  for (let i = 0; i < explPhans.length; i++) {
    const block = explText.slice(explPhans[i].start, explPhans[i].end);
    for (const [k, v] of extractExplanationsFromBlock(block, phanOffsets[i] ?? 0)) {
      map.set(k, v);
    }
  }
  return map;
}

// ─── HTML slice map (cho ảnh inline và phân số trong đáp án) ─────────────────

function blockToText(block: string): string {
  return block
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Trích inner HTML của 1 block option (bỏ tag <p> bao ngoài và nhãn "A. ")
function extractOptionInner(blocks: string[], label: string): string {
  return blocks
    .map((block, i) => {
      const inner = block
        .replace(/^<p(?:[^>]*)?>/i, '')
        .replace(/<\/p>$/i, '')
        .trim();
      if (i === 0) {
        // Xoá nhãn "A. " / "a) " ở đầu block đầu tiên
        return inner.replace(new RegExp(`^${label}\\s*[.):]\\s*`, 'i'), '').trim();
      }
      return inner;
    })
    .join(' ')
    .trim();
}

function hasRichContent(html: string): boolean {
  return html.includes('math-inline') || html.includes('math-display') || html.includes('<img');
}

export interface HtmlEntry {
  stem?: string;                      // HTML thân câu hỏi (nếu có ảnh/bảng)
  optHtml?: Record<string, string>;   // HTML nội dung từng đáp án (nếu có math/ảnh)
}

/**
 * Tách HTML thành Map<localQuestionNumber, HtmlEntry>.
 * stem = HTML trước options (bao gồm ảnh, bảng, phương trình).
 * optHtml = HTML bên trong từng đáp án A/B/C/D (nếu có phân số, ảnh).
 * Chỉ lưu entry khi có nội dung phong phú (math span, img, table).
 */
export function buildHtmlSliceMap(html: string): Map<number, HtmlEntry> {
  if (!hasRichContent(html) && !html.includes('<table')) return new Map();

  const map = new Map<number, HtmlEntry>();
  const blockRe = /<p(?:\s[^>]*)?>[\s\S]*?<\/p>|<img(?:\s[^>]*)?\/?>|<table[\s\S]*?<\/table>|<(?:ul|ol)[\s\S]*?<\/(?:ul|ol)>/gi;

  const blocks: string[] = [];
  let lastIdx = 0;
  for (const m of Array.from(html.matchAll(blockRe))) {
    const before = html.slice(lastIdx, m.index!).trim();
    if (before) blocks.push(before);
    blocks.push(m[0]);
    lastIdx = m.index! + m[0].length;
  }
  const tail = html.slice(lastIdx).trim();
  if (tail) blocks.push(tail);

  // Group blocks theo số câu
  const groups = new Map<number, string[]>();
  let currentNum: number | null = null;

  for (const block of blocks) {
    const text = blockToText(block);
    const m = text.match(/^(?:Câu\s+)?(\d+)\s*[.):]/);
    if (m) {
      currentNum = parseInt(m[1], 10);
      if (!groups.has(currentNum)) groups.set(currentNum, []);
      groups.get(currentNum)!.push(block);
    } else if (currentNum !== null) {
      groups.get(currentNum)!.push(block);
    }
  }

  for (const [num, questionBlocks] of groups) {
    const stemBlocks: string[] = [];
    const optAccum: Record<string, string[]> = {};
    let currentOptKey: string | null = null;

    for (const block of questionBlocks) {
      const text = blockToText(block);
      if (/^(?:Lời giải|Hướng dẫn|Giải)\b/iu.test(text)) break;

      // Bảng chứa nhiều đáp án (layout 4 cột phổ biến trong đề thi VN)
      // → tách từng ô thay vì gán cả bảng vào 1 đáp án
      if (/<table/i.test(block)) {
        const cells: Array<{ key: string; html: string }> = [];
        for (const cm of block.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)) {
          const ct = blockToText(cm[1]).trim();
          const om = ct.match(/^([ABCDabcd])[.)]\s/);
          if (om) cells.push({ key: om[1], html: cm[1] });
        }
        if (cells.length > 1) {
          for (const { key, html } of cells) {
            if (!optAccum[key]) optAccum[key] = [];
            optAccum[key].push(html);
            currentOptKey = key;
          }
          continue;
        }
      }

      const optMatch = text.match(/^([ABCDabcd])[.)]\s/);
      if (optMatch) {
        currentOptKey = optMatch[1];
        if (!optAccum[currentOptKey]) optAccum[currentOptKey] = [];
        optAccum[currentOptKey].push(block);
      } else if (currentOptKey) {
        optAccum[currentOptKey].push(block);
      } else {
        stemBlocks.push(block);
      }
    }

    const entry: HtmlEntry = {};

    // Stem: chỉ lưu nếu có ảnh hoặc bảng
    const stemHtml = stemBlocks.join('');
    if (stemHtml.includes('<img') || stemHtml.includes('<table')) {
      entry.stem = stemHtml.replace(
        /(<p(?:[^>]*)?>)\s*(?:Câu\s+)?\d+\s*[.):]\s*/u,
        '$1'
      );
    }

    // Options: lưu nếu có math span hoặc ảnh (PNG).
    // SVG placeholder (WMF) cũng được lưu nhưng hiển thị ô "[Hình vẽ]".
    for (const [key, optBlocks] of Object.entries(optAccum)) {
      const raw = optBlocks.join('');
      if (hasRichContent(raw)) {
        if (!entry.optHtml) entry.optHtml = {};
        entry.optHtml[key] = extractOptionInner(optBlocks, key);
      }
    }

    if (entry.stem || entry.optHtml) {
      map.set(num, entry);
    }
  }

  return map;
}

// ─── Apply HtmlEntry → questions ─────────────────────────────────────────────

/**
 * Gán stem HTML và optHtml (phân số/ảnh trong đáp án) vào danh sách câu hỏi.
 * numberOffset: cộng thêm để chuyển local → global (dùng cho PHẦN mode).
 */
function applyHtmlEntries(
  questions: RawQuestion[],
  htmlMap: Map<number, HtmlEntry>,
  baseOffset: number,
  endOffset?: number
): void {
  for (const q of questions) {
    if (baseOffset > 0 && (q.number <= baseOffset || (endOffset !== undefined && q.number > endOffset))) continue;
    const localNum = q.number - baseOffset;
    const entry = htmlMap.get(localNum);
    if (!entry) continue;
    if (entry.stem) q.html_content = entry.stem;
    if (entry.optHtml && q.options) {
      q.options = q.options.map((opt) => {
        const html = entry.optHtml![opt.key] ?? entry.optHtml![opt.key.toUpperCase()];
        return html ? { ...opt, text: html } : opt;
      });
    }
  }
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function segmentQuestions(
  text: string,
  ranges: QuestionRange[],
  precomputedAnswers?: Map<number, string>,
  htmlSource?: string
): RawQuestion[] {
  const boundary = findContentBoundary(text);
  const phanSections = detectPhans(text, boundary);
  const fullAnswerMap = precomputedAnswers ?? extractAnswers(text);

  let questions: RawQuestion[];
  const phanOffsets: number[] = [];

  if (!phanSections) {
    phanOffsets.push(0);
    questions = segmentBlock(text.slice(0, boundary), ranges, 0, fullAnswerMap);

    if (questions.length === 0) {
      throw new Error('[SP2] Không tìm thấy marker câu hỏi nào trong file');
    }

    // Gán html_content (stem) và optHtml (phân số/ảnh trong đáp án)
    if (htmlSource) {
      const htmlMap = buildHtmlSliceMap(htmlSource);
      if (htmlMap.size > 0) {
        applyHtmlEntries(questions, htmlMap, 0);
        console.log(`[SP2] html_content (ảnh/bảng) gán cho ${questions.filter((q) => q.html_content).length} câu`);
      }
    }

    const foundAnswers = questions.filter((q) => q.answer).length;
    console.log(`[SP2] Flat mode: ${questions.length} câu, ${foundAnswers} đáp án`);
  } else {
    let offset = 0;
    questions = [];

    for (let i = 0; i < phanSections.length; i++) {
      phanOffsets.push(offset);
      const section = phanSections[i];
      const sectionText = text.slice(section.start, section.end);
      const localAnswerMap = extractAnswers(sectionText);
      const sectionQuestions = segmentBlock(sectionText, ranges, offset, localAnswerMap, fullAnswerMap);
      console.log(`[SP2] PHẦN ${i + 1}: ${sectionQuestions.length} câu (offset ${offset})`);
      offset += sectionQuestions.length;
      questions.push(...sectionQuestions);
    }

    if (questions.length === 0) {
      throw new Error('[SP2] Không tìm thấy câu hỏi nào trong file');
    }

    const foundAnswers = questions.filter((q) => q.answer).length;
    console.log(`[SP2] PHẦN mode: ${questions.length} câu từ ${phanSections.length} phần, ${foundAnswers} đáp án`);

    // Gán html_content (ảnh/bảng) trong PHẦN mode
    // Tách HTML theo PHẦN → build map cục bộ → map local→global qua phanOffsets
    if (htmlSource) {
      const htmlPhanMs = Array.from(
        htmlSource.matchAll(new RegExp(PHAN_PATTERN.source, 'g'))
      );
      if (htmlPhanMs.length >= phanSections.length) {
        let htmlAssigned = 0;
        for (let i = 0; i < phanSections.length; i++) {
          const hStart = htmlPhanMs[i].index!;
          const hEnd = i + 1 < htmlPhanMs.length
            ? htmlPhanMs[i + 1].index!
            : htmlSource.length;
          const htmlMap = buildHtmlSliceMap(htmlSource.slice(hStart, hEnd));
          if (htmlMap.size === 0) continue;
          const baseOffset = phanOffsets[i];
          const endOffset = i + 1 < phanOffsets.length ? phanOffsets[i + 1] : questions.length;
          const before = questions.filter((q) => q.html_content).length;
          applyHtmlEntries(questions, htmlMap, baseOffset, endOffset);
          htmlAssigned += questions.filter((q) => q.html_content).length - before;
        }
        if (htmlAssigned > 0) {
          console.log(`[SP2] PHẦN mode: html_content (ảnh/bảng) gán cho ${htmlAssigned} câu`);
        }
      }
    }
  }

  // Gán lời giải từ phần sau boundary
  const explMap = extractExplanationMap(text, boundary, phanSections, phanOffsets);
  if (explMap.size > 0) {
    for (const q of questions) q.explanation = explMap.get(q.number) ?? null;
    console.log(`[SP2] Tìm được ${explMap.size} lời giải`);
  }

  return questions;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function mapNumberToType(number: number, ranges: QuestionRange[]): QuestionType | null {
  for (const r of ranges) {
    if (number >= r.from && number <= r.to) return r.type;
  }
  return null;
}
