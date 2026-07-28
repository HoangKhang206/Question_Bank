// Singleton Gemini client. Rate limit ở tầng gọi (classify.ts) qua p-limit.
// Lazy init: check env chỉ khi gọi lần đầu (tránh crash build-time Next.js).

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

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
    _flashModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });
  }
  return _flashModel;
}
