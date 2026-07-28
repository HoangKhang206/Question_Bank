import { Document, Packer, Paragraph, TextRun } from 'docx';
import { writeFileSync } from 'fs';

const questions = [
  {
    q: 'Câu 1: Giá trị của 15 × 4 bằng?',
    opts: ['A. 50', 'B. 60', 'C. 70', 'D. 80'],
  },
  {
    q: 'Câu 2: Căn bậc hai của 144 là?',
    opts: ['A. 10', 'B. 11', 'C. 12', 'D. 13'],
  },
  {
    q: 'Câu 3: Phương trình x² - 5x + 6 = 0 có nghiệm là?',
    opts: ['A. x = 1 và x = 6', 'B. x = 2 và x = 3', 'C. x = -2 và x = -3', 'D. x = 1 và x = -6'],
  },
  {
    q: 'Câu 4: Diện tích hình tròn bán kính 5 cm bằng? (π ≈ 3.14)',
    opts: ['A. 31.4 cm²', 'B. 62.8 cm²', 'C. 78.5 cm²', 'D. 157 cm²'],
  },
  {
    q: 'Câu 5: Logarithm cơ số 10 của 1000 bằng?',
    opts: ['A. 2', 'B. 3', 'C. 4', 'D. 10'],
  },
];

const children: Paragraph[] = [];

children.push(
  new Paragraph({
    children: [new TextRun({ text: 'ĐỀ KIỂM TRA TOÁN — TEST', bold: true, size: 28 })],
    spacing: { after: 400 },
  })
);

for (const { q, opts } of questions) {
  children.push(
    new Paragraph({ children: [new TextRun({ text: q, bold: true })], spacing: { before: 200, after: 100 } })
  );
  for (const opt of opts) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `    ${opt}` })], spacing: { after: 60 } })
    );
  }
}

const doc = new Document({ sections: [{ children }] });

Packer.toBuffer(doc).then((buffer) => {
  writeFileSync('/tmp/test-simple.docx', buffer);
  console.log('Done: /tmp/test-simple.docx');
});
