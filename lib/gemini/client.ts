// Singleton Gemini client. Rate limit ở tầng gọi (classify.ts) qua p-limit.
// Lazy init: check env chỉ khi gọi lần đầu (tránh crash build-time Next.js).

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

const GEMINI_TIMEOUT_MS = 55_000; // 55s — dưới Vercel maxDuration=10s thì caller tự handle; local dev: tránh treo mãi

let _genAI: GoogleGenerativeAI | null = null;
let _flashModel: GenerativeModel | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_genAI) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _genAI;
}

export function getFlashModel(): GenerativeModel {
  if (!_flashModel) {
    _flashModel = getClient().getGenerativeModel(
      {
        model: 'gemini-2.5-flash',
        // thinkingConfig chưa có trong type v0.24.1 → cast as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 2048 },
        } as any,
      },
      { timeout: GEMINI_TIMEOUT_MS }
    );
  }
  return _flashModel;
}
