// SP1: Document Parsing (docx)
// Input : Buffer file .docx
// Output: HTML string giữ thứ tự nội dung (bold, italic, list preserved)
// Constraint: ≤ 2s cho file 5MB.

import mammoth from 'mammoth';

export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      // Bỏ qua ảnh — Phase 1 không hỗ trợ công thức toán/ảnh
      convertImage: mammoth.images.imgElement(() =>
        Promise.resolve({ src: '' })
      )
    }
  );

  if (result.messages.length > 0) {
    console.warn('[SP1] mammoth warnings:', result.messages);
  }

  return result.value;
}

/**
 * Convert HTML sang plain text để feed SP2 (segmentation).
 * Giữ line break để marker "Câu N" dễ detect.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
