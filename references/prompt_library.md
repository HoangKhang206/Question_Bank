# Prompt Library — Gemini 2.5 Flash

Prompt production-ready cho SP3 và các use case liên quan. Đã test với đề Toán/Lý/Hoá cấp 3 Việt Nam.

**Nguyên tắc chung:**
- Yêu cầu JSON strict, KHÔNG markdown/backtick
- Set `responseMimeType: 'application/json'` khi khởi tạo model (buộc JSON)
- Set `temperature: 0.1` cho task phân loại (cần ổn định)
- Không bao giờ tin output 100% — luôn `validateSchema()` sau parse

---

## Prompt #1 — Phân loại mức độ nhận thức (SP3)

**Dùng cho:** Batch 5-10 câu hỏi. Model trả về difficulty của từng câu.
**File dùng:** `lib/gemini/classify.ts`

```
Bạn là trợ lý phân loại câu hỏi ôn tập theo thang nhận thức Việt Nam.

Với mỗi câu hỏi dưới đây, hãy phân loại mức độ:
- "biet": nhận biết, tái hiện kiến thức, nhớ định nghĩa/công thức
- "hieu": thông hiểu, giải thích, phân biệt, ví dụ minh hoạ
- "van_dung": vận dụng, áp dụng vào bài toán mới, phân tích, tổng hợp

Trả về JSON DUY NHẤT với format:
{"results":[{"number":1,"difficulty":"biet"},{"number":2,"difficulty":"hieu"}]}

Không thêm giải thích, không markdown, không backtick.

Danh sách câu hỏi:
Câu 1: Đạo hàm của hàm số y = x³ là:
  A. 3x²    B. x²    C. 3x    D. x³/3

Câu 2: Cho hàm số y = f(x) có đạo hàm f'(x) = 3x² - 6x. Tìm khoảng
đồng biến của hàm số.

Câu 3: Cực trị là gì?
```

**Output kỳ vọng:**
```json
{
  "results": [
    { "number": 1, "difficulty": "biet" },
    { "number": 2, "difficulty": "van_dung" },
    { "number": 3, "difficulty": "biet" }
  ]
}
```

**Các case fail đã gặp và cách xử lý:**

| Output từ Gemini | Vấn đề | Xử lý |
|---|---|---|
| ` ```json\n{...}\n``` ` | Thêm markdown | Set `responseMimeType: 'application/json'` |
| `{"results": [...], "explanation": "..."}` | Thêm field lạ | `validateSchema()` chỉ check `results` |
| `{"number": 1, "difficulty": "kho"}` | Difficulty ngoài enum | Fallback `unclassified`, log lỗi |
| Missing một số câu trong batch | Model bỏ câu | Merge với batch gốc, câu thiếu → `unclassified` |
| `"1"` (string) thay vì `1` (number) | Kiểu sai | `typeof !== 'number'` → throw → catch → fallback |

---

## Prompt #2 — Trích xuất câu hỏi từ PDF (Phase 2)

**Dùng cho:** File PDF, đặc biệt đề có 2 cột / công thức toán. Gửi PDF native.
**File dùng (khi có):** `lib/parse/pdf.ts`

```
Trích xuất TOÀN BỘ câu hỏi từ file PDF này. Yêu cầu:

1. Giữ NGUYÊN số thứ tự câu như trong đề (Câu 1, Câu 2, ...).
2. Với trắc nghiệm 4 đáp án: giữ đủ A, B, C, D, mỗi đáp án MỘT dòng.
3. Với công thức toán: viết bằng ký hiệu chuẩn tiếng Việt (x^2, sqrt(x),
   1/2), không dùng LaTeX.
4. Bỏ qua hình vẽ, biểu đồ — chỉ trích text.
5. Bỏ qua tiêu đề, ghi chú giáo viên, số trang.

Trả về JSON:
{
  "questions": [
    {"number": 1, "content": "..."},
    {"number": 2, "content": "..."}
  ]
}

Không markdown, không backtick, không giải thích.
```

**Trade-off:** Prompt này ăn nhiều token (PDF native input). Với file ≥20 trang, cân nhắc gộp thêm phân loại luôn ở Prompt #3.

---

## Prompt #3 — Combined extract + classify (Phase 2, tiết kiệm token)

**Dùng cho:** PDF vừa lớn vừa cần phân loại. Gộp SP1+SP2+SP3 thành 1 call.

```
Trích xuất và phân loại TẤT CẢ câu hỏi trong PDF này.

Cấu trúc đề (user khai báo):
- Câu 1-15: trắc nghiệm 4 đáp án
- Câu 16-25: trả lời ngắn

Với mỗi câu:
1. Trích xuất số câu và nội dung đầy đủ.
2. Phân loại mức độ:
   - "biet": nhớ, tái hiện định nghĩa/công thức
   - "hieu": giải thích, phân biệt, ví dụ
   - "van_dung": áp dụng vào bài toán mới, phân tích

Trả về JSON:
{
  "questions": [
    {"number": 1, "type": "multiple_choice", "content": "...", "difficulty": "biet"}
  ]
}
```

**Cảnh báo:** Combined prompt tăng risk JSON hỏng. Nếu fail → fallback về Prompt #2 (extract) rồi Prompt #1 (classify). Tách 2 bước ổn định hơn nhưng tốn 2x request.

---

## Prompt #4 — Sinh lời giải (Phase 3, optional)

**Dùng cho:** Câu chưa có `explanation`. Sinh lời giải ngắn để giáo viên tham khảo.

```
Cho câu hỏi trắc nghiệm sau, hãy viết lời giải NGẮN GỌN (2-4 dòng):

Câu hỏi: {content}
Đáp án đúng: {answer}

Yêu cầu:
- Không dài dòng, đúng vào bước then chốt
- Bài toán → viết công thức và tính toán
- Câu lý thuyết → nêu định nghĩa/tính chất áp dụng

Trả về JSON: {"explanation": "..."}
```

**Lưu ý:** Prompt này ĐẮT (mỗi câu 1 call). Chỉ chạy on-demand khi user bấm "Sinh lời giải", KHÔNG tự động cho toàn bộ upload.

---

## Chiến lược batch size

Đo với file 40 câu:

| Batch size | Số request | Latency tổng | Accuracy | Fail rate |
|---|---|---|---|---|
| 1 câu/batch | 40 | ~30s (rate limit) | ~85% | 1% |
| 5 câu/batch | 8 | ~8s | ~80% | 3% |
| **8 câu/batch** | **5** | **~5s** | **~78%** | **5%** |
| 15 câu/batch | 3 | ~4s | ~70% | 12% |
| 40 câu/1 call | 1 | ~3s (hoặc timeout) | ~65% | 25% |

**Kết luận:** batch 8 là sweet spot. Đã set `BATCH_SIZE = 8` trong `lib/gemini/classify.ts`.

---

## Debug tips khi prompt fail

1. **Log raw response** trước khi parse — đã có trong `catch` block của `classify.ts`.
2. **Test prompt trong Google AI Studio** (aistudio.google.com) trước, có UI debug tốt hơn.
3. **Thử `temperature: 0`** nếu output không ổn định (hiện đang 0.1).
4. **Nếu Gemini refuse** (rất hiếm): rephrase, bỏ từ nhạy cảm như "đánh giá học sinh".
5. **Nếu JSON output có `\n` trong content**: parse bình thường vẫn được, nhưng có thể escape sai. Test với đề có `√`, `π`, ký tự đặc biệt.

---

## Prompt cần thêm sau này

- [ ] Prompt sửa lỗi typo (user click "AI proofread")
- [ ] Prompt gợi ý tag từ nội dung → suggest
- [ ] Prompt tạo câu tương tự (Phase 3 — sinh câu mới từ câu cũ)
- [ ] Prompt gộp câu tách bị lỗi (khi SP2 cắt sai)
