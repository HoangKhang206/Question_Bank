// SP1: Document Parsing (docx)
// Input : Buffer file .docx
// Output: { html: string, text: string }
//   html — HTML với ảnh inline base64 và toán học đã render thành KaTeX spans
//   text — plain text (dùng để segment/detect options/answers)
// Constraint: ≤ 2s cho file 5MB.

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { extractOmmlBlocks, replaceMathPlaceholders } from './omml';

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
  const newBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { buffer: newBuffer, mathEntries };
}

export async function parseDocx(buffer: Buffer): Promise<{ html: string; text: string }> {
  const { buffer: processedBuffer, mathEntries } = await preprocessOmml(buffer);

  const result = await mammoth.convertToHtml(
    { buffer: processedBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
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
    .replace(/<img[^>]*>/gi, '')
    .replace(/<span class="math-(?:inline|display)">[^<]*<\/span>/gi, ' [MATH] ')
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
