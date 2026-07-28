import { GoogleGenerativeAI } from '@google/generative-ai';

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

model.generateContent('Trả lời 1 từ: thủ đô Việt Nam là gì?')
  .then((r) => console.log('Gemini OK:', r.response.text().trim()))
  .catch((e) => console.error('Gemini FAIL:', e.message));
