// SP1: Document Parsing (pdf)
// Input : Buffer file .pdf (có text copy được — không hỗ trợ scan)
// Output: plain text giữ thứ tự nội dung

import { PDFParse } from 'pdf-parse';

export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
