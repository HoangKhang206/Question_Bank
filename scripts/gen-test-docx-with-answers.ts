import { Document, Packer, Paragraph, TextRun } from 'docx';
import { writeFileSync } from 'fs';

const questions = [
  { n: 1, q: 'Đạo hàm của y = x³ là:', opts: ['3x²', 'x²', '3x', 'x³/3'], ans: 'A' },
  { n: 2, q: 'Căn bậc hai của 144 là:', opts: ['10', '11', '12', '13'], ans: 'C' },
  { n: 3, q: 'Giới hạn lim(x→0) sin(x)/x bằng:', opts: ['0', '1', '∞', 'không tồn tại'], ans: 'B' },
  { n: 4, q: 'Tích phân ∫x dx bằng:', opts: ['x', 'x²', 'x²/2 + C', '2x'], ans: 'C' },
  { n: 5, q: 'Phương trình x² - 4 = 0 có nghiệm là:', opts: ['x = 2', 'x = ±2', 'x = -2', 'x = 4'], ans: 'B' },
];

const children: Paragraph[] = [];

children.push(new Paragraph({
  children: [new TextRun({ text: 'ĐỀ KIỂM TRA TOÁN (CÓ ĐÁP ÁN)', bold: true, size: 28 })],
  spacing: { after: 400 },
}));

for (const { n, q, opts } of questions) {
  children.push(new Paragraph({
    children: [new TextRun({ text: `Câu ${n}: ${q}`, bold: true })],
    spacing: { before: 200, after: 80 },
  }));
  for (const [i, opt] of opts.entries()) {
    const key = ['A', 'B', 'C', 'D'][i];
    children.push(new Paragraph({
      children: [new TextRun({ text: `    ${key}. ${opt}` })],
      spacing: { after: 40 },
    }));
  }
}

// Bảng đáp án ở cuối file
children.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 400 } }));
children.push(new Paragraph({
  children: [new TextRun({ text: 'ĐÁP ÁN', bold: true })],
  spacing: { after: 100 },
}));
children.push(new Paragraph({
  children: [new TextRun({
    text: questions.map(({ n, ans }) => `Câu ${n}: ${ans}`).join('    '),
  })],
}));

const doc = new Document({ sections: [{ children }] });

Packer.toBuffer(doc).then((buf) => {
  writeFileSync('/tmp/test-with-answers.docx', buf);
  console.log('Done: /tmp/test-with-answers.docx');
});
