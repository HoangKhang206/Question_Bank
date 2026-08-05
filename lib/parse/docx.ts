// SP1: Document Parsing (docx)
// Input : Buffer file .docx
// Output: { html: string, text: string }
//   html — HTML với ảnh inline base64 và toán học đã render thành KaTeX spans
//   text — plain text (dùng để segment/detect options/answers)
// Constraint: ≤ 2s cho file 5MB.

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { extractOmmlBlocks, replaceMathPlaceholders } from './omml';

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', 'n': 'ⁿ', 'i': 'ⁱ',
};
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋',
};
function mapScripts(content: string, map: Record<string, string>): string {
  return [...content].map((c) => map[c] ?? c).join('');
}

// WMF images không hiển thị được trên browser — dùng SVG placeholder base64.
// QUAN TRỌNG: phải dùng base64 (không dùng raw SVG trong src) để tránh ký tự
// <, > trong data URL phá vỡ cấu trúc HTML và khiến regex <img[^>]*> bị lỗi.
const WMF_PLACEHOLDER = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24">' +
  '<rect width="80" height="24" fill="#f3f4f6" rx="4" stroke="#d1d5db" stroke-width="1"/>' +
  '<text x="40" y="16" font-size="11" text-anchor="middle" font-family="sans-serif" fill="#6b7280">[Hình vẽ]</text>' +
  '</svg>'
).toString('base64');

async function preprocessOmml(buffer: Buffer): Promise<{ buffer: Buffer; mathEntries: ReturnType<typeof extractOmmlBlocks>['mathEntries'] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { buffer, mathEntries: [] };
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) return { buffer, mathEntries: [] };

  const xml = await docFile.async('string');
  if (!xml.includes('<m:oMath')) return { buffer, mathEntries: [] };

  const { processedXml, mathEntries } = extractOmmlBlocks(xml);
  if (mathEntries.length === 0) return { buffer, mathEntries: [] };

  zip.file('word/document.xml', processedXml);
  // STORE (không nén) thay DEFLATE — nhanh hơn ~200ms, buffer chỉ dùng nội bộ cho mammoth
  const newBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }));
  return { buffer: newBuffer, mathEntries };
}

export async function parseDocx(buffer: Buffer): Promise<{ html: string; text: string }> {
  const { buffer: processedBuffer, mathEntries } = await preprocessOmml(buffer);

  const result = await mammoth.convertToHtml(
    { buffer: processedBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        if (image.contentType === 'image/x-wmf' || image.contentType === 'image/wmf') {
          return { src: WMF_PLACEHOLDER };
        }
        const imgBuffer = await image.read();
        const base64 = imgBuffer.toString('base64');
        return { src: `data:${image.contentType};base64,${base64}` };
      })
    }
  );

  if (result.messages.some((m) => m.type === 'error')) {
    console.warn('[SP1] mammoth errors:', result.messages.filter((m) => m.type === 'error'));
  }

  let html = result.value;
  if (mathEntries.length > 0) {
    html = replaceMathPlaceholders(html, mathEntries);
  }

  const text = htmlToText(html);
  return { html, text };
}

/**
 * Convert HTML sang plain text để feed SP2 (segmentation).
 * Giữ line break để marker "Câu N" dễ detect.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '[Hình vẽ]')
    .replace(/<span class="math-(?:inline|display)">[^<]*<\/span>/gi, ' [MATH] ')
    .replace(/<sup>([^<]*)<\/sup>/gi, (_, c) => mapScripts(c, SUPERSCRIPT_MAP))
    .replace(/<sub>([^<]*)<\/sub>/gi, (_, c) => mapScripts(c, SUBSCRIPT_MAP))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
