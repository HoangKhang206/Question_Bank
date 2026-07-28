// SP2 helper: AI-based answer extraction from document text
// Input : plain text toàn bộ file
// Output: Map<number, string> nếu file có đáp án sẵn, null nếu không có
// Constraint: 1 Gemini call, fail-safe (trả null khi lỗi), không throw

import { getFlashModel } from './client';

const PROMPT = `Bạn được cung cấp nội dung một đề thi (có thể kèm lời giải).

Nhiệm vụ: Trích xuất đáp án của từng câu hỏi.

Nguồn đáp án (theo thứ tự ưu tiên):
1. Bảng đáp án rõ ràng: "Câu 1: B", "Chọn A.", bảng cuối file
2. Lời giải ghi tường minh: "a) Đúng", "b) Sai", "Đáp án: 20,9"
3. Lời giải hàm ý: nếu lời giải trình bày cách giải và kết quả khớp với 1 đáp án A/B/C/D, chọn đáp án đó

Nếu KHÔNG tìm được đáp án cho câu nào → bỏ câu đó khỏi "answers".
Nếu KHÔNG có đáp án nào trong toàn file → trả về hasAnswers = false.

Trả về JSON DUY NHẤT, không markdown, không giải thích:
- Nếu có: {"hasAnswers": true, "answers": {"1": "B", "2": "a:Đúng,b:Sai,c:Đúng,d:Đúng", ...}}
- Nếu không: {"hasAnswers": false, "answers": {}}

Quy tắc format đáp án (value):
- Trắc nghiệm A/B/C/D: "A", "B", "C" hoặc "D"
- Đúng/Sai 4 ý: "a:Đúng,b:Sai,c:Đúng,d:Đúng"
- Trả lời ngắn: "10g", "100V", "3,14", "20,9%"

Lưu ý: file có thể có nhiều Phần (Phần I, Phần II...) với câu đánh lại từ 1. Hãy đánh số câu theo thứ tự TOÀN CỤC (Phần I câu 1→N, Phần II tiếp tục từ N+1...).

Nội dung file:
`;

interface GeminiAnswerResult {
  hasAnswers: boolean;
  answers: Record<string, string>;
}

export async function extractAnswersWithAI(text: string): Promise<Map<number, string> | null> {
  // Giới hạn text để không vượt context (20000 ký tự — đủ cho đề thi thông thường)
  const truncated = text.slice(0, 20000);
  let rawResponse = '';

  try {
    const result = await getFlashModel().generateContent(PROMPT + truncated);
    rawResponse = result.response.text();

    const parsed: GeminiAnswerResult = JSON.parse(rawResponse);

    if (!parsed.hasAnswers || typeof parsed.answers !== 'object') {
      console.log('[extract-answers] AI: file không có đáp án sẵn');
      return null;
    }

    const map = new Map<number, string>();
    for (const [k, v] of Object.entries(parsed.answers)) {
      const num = parseInt(k, 10);
      if (!isNaN(num) && v) map.set(num, String(v).trim());
    }

    console.log(`[extract-answers] AI tìm được ${map.size} đáp án trong file`);
    return map.size > 0 ? map : null;
  } catch (err) {
    console.error('[extract-answers] AI failed:', {
      error: err instanceof Error ? err.message : String(err),
      response: rawResponse.slice(0, 200)
    });
    return null;
  }
}
