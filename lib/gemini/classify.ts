// SP3: Cognitive Classification
// Input : Batch RawQuestion[] (≤40 câu) + ClassifyOptions
// Output: ClassifiedQuestion[] với difficulty, tuỳ chọn type + answer
// Constraint:
//   - ≤ 3 concurrent (p-limit)
//   - Fail-safe: JSON hỏng → fallback unclassified, KHÔNG throw

import pLimit from 'p-limit';
import { getFlashModel } from './client';
import type { Difficulty, QuestionType, RawQuestion, ClassifiedQuestion } from '@/lib/types';

const limit = pLimit(3);
const BATCH_SIZE = 40;

export interface ClassifyOptions {
  autoType?: boolean;
  autoAnswer?: boolean;
}

interface GeminiItem {
  number: number;
  difficulty: Difficulty;
  type?: QuestionType;
  answer?: string | null;
}
interface GeminiResult { results: GeminiItem[]; }

const VALID_DIFFICULTIES = ['biet', 'hieu', 'van_dung', 'unclassified'];
const VALID_TYPES = ['multiple_choice', 'true_false', 'short_answer', 'essay'];

function buildPrompt(opts: ClassifyOptions): string {
  const fields: string[] = [];
  const formatExample: Record<string, unknown> = { number: 1, difficulty: 'biet' };

  fields.push(`- difficulty: mức độ nhận thức
  + "biet": nhận biết, tái hiện kiến thức, nhớ định nghĩa/công thức
  + "hieu": thông hiểu, giải thích, phân biệt, ví dụ minh hoạ
  + "van_dung": vận dụng, áp dụng vào bài toán mới, phân tích, tổng hợp`);

  if (opts.autoType) {
    formatExample.type = 'multiple_choice';
    fields.push(`- type: dạng câu hỏi — ưu tiên theo thứ tự sau:
  + "multiple_choice": có đúng 4 lựa chọn A/B/C/D (hoặc A. B. C. D.)
  + "true_false": có các ý nhỏ a) b) c) d) cần xét Đúng/Sai, HOẶC câu hỏi yêu cầu nhận xét một mệnh đề là đúng hay sai — DÙ không có a/b/c/d
  + "short_answer": yêu cầu điền số, đơn vị, giá trị ngắn gọn (ví dụ: "10g", "3,14", "100V"); không có lựa chọn
  + "essay": yêu cầu trình bày, chứng minh, giải thích nhiều bước, viết dài`);
  }

  if (opts.autoAnswer) {
    formatExample.answer = 'A';
    fields.push(`- answer: đáp án đúng theo dạng câu
  + multiple_choice: "A", "B", "C" hoặc "D"
  + true_false có 4 ý a/b/c/d: "a:Đúng,b:Sai,c:Đúng,d:Đúng" — ghi rõ từng ý
  + true_false 1 ý: "Đúng" hoặc "Sai"
  + short_answer: giá trị ngắn gọn như "10g", "100V", "3,14", "20,9%"
  + essay: null
  + Không xác định được: null`);
  }

  return `Phân tích các câu hỏi dưới đây và trả về JSON DUY NHẤT.

Với mỗi câu xác định:
${fields.join('\n')}

Format: {"results":[${JSON.stringify(formatExample)}, ...]}
Không thêm giải thích, không markdown, không backtick.

Câu hỏi:
`;
}

function validateSchema(data: unknown, opts: ClassifyOptions): asserts data is GeminiResult {
  if (!data || typeof data !== 'object' || !Array.isArray((data as GeminiResult).results)) {
    throw new Error('Missing "results" array');
  }
  for (const r of (data as GeminiResult).results) {
    if (typeof r.number !== 'number') throw new Error('Invalid number');
    if (!VALID_DIFFICULTIES.includes(r.difficulty)) throw new Error(`Invalid difficulty: ${r.difficulty}`);
    if (opts.autoType && r.type && !VALID_TYPES.includes(r.type)) throw new Error(`Invalid type: ${r.type}`);
  }
}

async function classifyBatch(
  batch: RawQuestion[],
  opts: ClassifyOptions,
  attempt = 0
): Promise<ClassifiedQuestion[]> {
  const prompt = buildPrompt(opts);
  const questionsText = batch.map((q) => `Câu ${q.number}: ${q.raw_content}`).join('\n\n');
  let rawResponse = '';

  try {
    const result = await getFlashModel().generateContent(prompt + questionsText);
    rawResponse = result.response.text();

    const parsed: GeminiResult = JSON.parse(rawResponse);
    validateSchema(parsed, opts);

    return batch.map((q) => {
      const found = parsed.results.find((r) => r.number === q.number);
      return {
        ...q,
        difficulty: found?.difficulty ?? 'unclassified',
        ...(opts.autoType && found?.type ? { type: found.type } : {}),
        ...(opts.autoAnswer && found !== undefined ? { answer: found.answer ?? q.answer } : {})
      };
    });
  } catch (err) {
    console.error('[SP3] Batch failed:', {
      error: err instanceof Error ? err.message : String(err),
      response: rawResponse.slice(0, 300),
      numbers: batch.map((q) => q.number),
      attempt,
    });
    // Retry 1 lần sau 1s trước khi fallback unclassified
    if (attempt === 0) {
      console.warn('[SP3] Retrying batch...');
      await new Promise((r) => setTimeout(r, 1000));
      return classifyBatch(batch, opts, 1);
    }
    return batch.map((q) => ({ ...q, difficulty: 'unclassified' as const }));
  }
}

export async function classifyAll(
  questions: RawQuestion[],
  opts: ClassifyOptions = {},
  onProgress?: (done: number, total: number) => void
): Promise<ClassifiedQuestion[]> {
  const batches: RawQuestion[][] = [];
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    batches.push(questions.slice(i, i + BATCH_SIZE));
  }

  let completed = 0;
  const results = await Promise.all(
    batches.map((b) =>
      limit(async () => {
        const result = await classifyBatch(b, opts);
        completed += b.length;
        onProgress?.(Math.min(completed, questions.length), questions.length);
        return result;
      })
    )
  );

  return results.flat();
}
