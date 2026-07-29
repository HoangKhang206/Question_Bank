// SP1: Document Parsing (docx)
// Input : Buffer file .docx
// Output: { html: string, text: string }
//   html — HTML với ảnh inline base64 (dùng để lưu content câu hỏi)
//   text — plain text (dùng để segment/detect options/answers)
// Constraint: ≤ 2s cho file 5MB.

import mammoth from 'mammoth';

export async function parseDocx(buffer: Buffer): Promise<{ html: string; text: string }> {
  const result = await mammoth.convertToHtml(
    { buffer },
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

  const html = result.value;
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
