// Test pipeline SP1→SP2 + answer-detect trên demau.docx
// Chạy: npx tsx --env-file=.env.local scripts/test-demau.ts

import { readFileSync } from 'fs';
import mammoth from 'mammoth';
import { extractAnswersAuto } from '../lib/parse/answer-detect';
import { extractAnswersWithAI } from '../lib/gemini/extract-answers';
import { segmentQuestions } from '../lib/parse/segment';

const DOCX_PATH = '/Users/hoangkhang/Downloads/demau.docx';
const STRUCTURE = [
  { from: 1, to: 18, type: 'multiple_choice' as const },
  { from: 19, to: 22, type: 'true_false' as const },
  { from: 23, to: 28, type: 'short_answer' as const },
];

async function main() {
  console.log('=== TEST PIPELINE demau.docx ===\n');

  const buffer = readFileSync(DOCX_PATH);

  // SP1: Parse
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;
  const text = html
    .replace(/<\/(p|div|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  console.log(`[SP1] text length: ${text.length} ký tự`);
  console.log('[SP1] 500 ký tự đầu:\n', text.slice(0, 500), '\n');

  // Answer detect: format
  console.log('--- Auto-detect format ---');
  const detected = await extractAnswersAuto(buffer, html, text);
  console.log(`format: ${detected.format}, ${detected.answers.size} đáp án`);
  if (detected.answers.size > 0) {
    console.log('Đáp án detect được:', Object.fromEntries(detected.answers));
  }

  // Answer detect: AI fallback
  let precomputedAnswers: Map<number, string> | undefined;
  if (detected.format !== 'none') {
    precomputedAnswers = detected.answers;
  } else {
    console.log('\n--- AI check: file có đáp án không? ---');
    const aiAnswers = await extractAnswersWithAI(text);
    if (aiAnswers !== null) {
      console.log(`AI tìm được ${aiAnswers.size} đáp án:`, Object.fromEntries(aiAnswers));
      precomputedAnswers = aiAnswers;
    } else {
      console.log('AI: không có đáp án trong file');
    }
  }

  // SP2: Segment
  console.log('\n--- SP2: Segmentation ---');
  const questions = segmentQuestions(text, STRUCTURE, precomputedAnswers);
  console.log(`Tổng: ${questions.length} câu\n`);

  for (const q of questions) {
    const ansLabel = q.answer ? `→ ${q.answer}` : '→ (không có đáp án)';
    const optCount = q.options ? `[${q.options.length} options]` : '';
    console.log(`Câu ${q.number} [${q.type}] ${optCount} ${ansLabel}`);
    if (q.options) {
      for (const o of q.options) console.log(`   ${o.key}. ${o.text.slice(0, 60)}`);
    }
  }

  const withAnswer = questions.filter(q => q.answer).length;
  console.log(`\nKết quả: ${questions.length} câu, ${withAnswer} có đáp án, ${questions.length - withAnswer} chưa có`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
