import { describe, it, expect } from 'vitest';
import { parseOptions, segmentQuestions, extractAnswers } from './segment';

describe('parseOptions', () => {
  it('đáp án cùng dòng, phân cách 2 space', () => {
    const raw = `Câu 1: Đạo hàm của y = x³ là:
  A. 3x²  B. x²  C. 3x  D. x³/3`;
    const opts = parseOptions(raw);
    expect(opts).not.toBeNull();
    expect(opts).toHaveLength(4);
    expect(opts![0]).toEqual({ key: 'A', text: '3x²' });
    expect(opts![1]).toEqual({ key: 'B', text: 'x²' });
    expect(opts![2]).toEqual({ key: 'C', text: '3x' });
    expect(opts![3]).toEqual({ key: 'D', text: 'x³/3' });
  });

  it('đáp án mỗi đáp án 1 dòng', () => {
    const raw = `Câu 2: Thủ đô Việt Nam là?
A. TP.HCM
B. Đà Nẵng
C. Hà Nội
D. Huế`;
    const opts = parseOptions(raw);
    expect(opts).not.toBeNull();
    expect(opts).toHaveLength(4);
    expect(opts![2]).toEqual({ key: 'C', text: 'Hà Nội' });
  });

  it('không tìm được đủ 4 đáp án → trả về null', () => {
    const raw = `Câu 3: Câu hỏi tự luận, không có đáp án.`;
    const opts = parseOptions(raw);
    expect(opts).toBeNull();
  });
});

describe('segmentQuestions', () => {
  const ranges = [{ from: 1, to: 5, type: 'multiple_choice' as const }];

  it('gán options cho multiple_choice khi tìm được đáp án', () => {
    const text = `Câu 1: 1 + 1 = ?
A. 1
B. 2
C. 3
D. 4

Câu 2: 2 × 3 = ?
A. 4
B. 5
C. 6
D. 7`;
    const result = segmentQuestions(text, ranges);
    expect(result).toHaveLength(2);
    expect(result[0].options).not.toBeNull();
    expect(result[0].options).toHaveLength(4);
    expect(result[1].options![2]).toEqual({ key: 'C', text: '6' });
  });

  it('options = null khi không tách được đáp án', () => {
    const text = `Câu 1: Câu hỏi không có đáp án rõ ràng trong văn bản.`;
    const result = segmentQuestions(text, ranges);
    expect(result).toHaveLength(1);
    expect(result[0].options).toBeNull();
  });

  it('map answer từ bảng đáp án cuối file', () => {
    const text = `Câu 1: 1 + 1 = ?
A. 1
B. 2
C. 3
D. 4

Câu 2: Thủ đô VN?
A. TP.HCM
B. Hà Nội
C. Đà Nẵng
D. Huế

ĐÁP ÁN
Câu 1: B    Câu 2: B`;
    const result = segmentQuestions(text, ranges);
    expect(result[0].answer).toBe('B');
    expect(result[1].answer).toBe('B');
  });
});

describe('extractAnswers', () => {
  it('đọc nhiều đáp án trên 1 dòng', () => {
    const text = 'Câu 1: A    Câu 2: C    Câu 3: B';
    const map = extractAnswers(text);
    expect(map.get(1)).toBe('A');
    expect(map.get(2)).toBe('C');
    expect(map.get(3)).toBe('B');
  });

  it('occurrence cuối thắng (answer key ở cuối file)', () => {
    // "Câu 1: A" xuất hiện trong body câu hỏi nhưng "Câu 1: C" ở cuối → C thắng
    const text = `Câu 1: A là đúng hay sai?
A. Đúng
B. Sai
C. Không xác định
D. Tất cả sai

ĐÁP ÁN: Câu 1: C`;
    const map = extractAnswers(text);
    expect(map.get(1)).toBe('C');
  });

  it('trả về map rỗng nếu không có đáp án', () => {
    const map = extractAnswers('Nội dung không có đáp án nào.');
    expect(map.size).toBe(0);
  });
});
