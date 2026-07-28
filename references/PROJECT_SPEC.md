# Ngân Hàng Câu Hỏi & Trộn Đề — Project Spec

> **Tài liệu này là source of truth cho dự án.** AI đọc để hiểu và code đúng. Dev đọc để nắm được bối cảnh + các quyết định thiết kế. Cập nhật tài liệu này khi có thay đổi lớn về scope hoặc kiến trúc.

---

## 1. Tổng quan

Web app cá nhân giúp thu thập câu hỏi từ các đề (Word/PDF) do người dùng upload, dùng AI phân loại mức độ nhận thức (biết / hiểu / vận dụng), lưu vào ngân hàng câu hỏi có tổ chức theo chương, và cho phép trộn ra đề mới theo cấu hình tuỳ ý (số câu, tỉ lệ mức độ, loại câu hỏi, chương). Xuất đề ra Word/PDF, kèm bản có đáp án và bản đề trắng.

**Đối tượng sử dụng:** cá nhân người tạo dự án (self-hosted trên Vercel).

**Mục đích:** tạo đề ôn tập nhanh từ nguồn đề có sẵn, không phải đề thi chính thức — chấp nhận sai số nhỏ của AI, ưu tiên tốc độ và tính hữu dụng.

---

## 2. Phân rã bài toán (Computational Thinking framework)

### 2.1. Ill-defined → Well-defined

**Bài toán gốc (ill-defined):**
> "Tôi muốn một web app tạo đề ôn tập từ các đề Word/PDF đã có, dùng AI phân loại độ khó, rồi trộn ra đề mới theo ý mình."

**Các từ mơ hồ cần định lượng:**
- *"phân loại độ khó"* → thang 3 mức chuẩn: `biet | hieu | van_dung`. Chấp nhận AI accuracy ~70-80%, có escape hatch cho user sửa tay.
- *"trộn ra đề"* → **constrained random sampling** trên bank câu hỏi theo (chương, số câu, phân bổ mức độ, phân bổ dạng câu).
- *"theo ý mình"* → cấu hình qua form + random seed lưu lại → tái tạo được deterministic.

**Well-defined problem:**

| Thành phần | Đặc tả |
|---|---|
| **Input tổng quát** | Tập file đề `F = {f₁,...,fₙ}` (.docx / .pdf, ≤ 50MB), mỗi `fᵢ` gắn với 1 chương + cấu trúc `[{from, to, type}]` do user khai báo. Config tạo đề `C = (chapters, total, dist_difficulty, dist_type, tags?, seed)` |
| **Output** | Ngân hàng câu hỏi `Q = {qⱼ}` với `qⱼ = (content, type, difficulty, chapter, tags, answer)`; đề `E ⊆ Q` thoả `C`; file Word/PDF chứa `E` ở 2 biến thể (blank / with_answer) |
| **Operators cấp cao** | `parse, segment, classify, dedup, sample, render` (chi tiết ở Section 2.4) |
| **Evaluation (định lượng)** | Parse ≥ 95% ký tự đúng; classify accuracy ~70-80%; dedup 100% exact-match; tạo đề ≤ 5s cho 30 câu từ bank 500 câu; reproducibility 100% |
| **Hard constraints** | Vercel timeout ≤ 10s/request; Gemini free tier ≤ 1500 req/ngày & ≤ 15 req/phút; Supabase DB ≤ 500MB, Storage ≤ 1GB; chi phí 0 VND/tháng |

### 2.2. Stakeholder Mapping

| Stakeholder | Vai trò | Quan tâm chính | Priority |
|---|---|---|---|
| **Owner** (user chính) | Upload đề, quản lý bank, tạo đề, in dùng | Tốc độ, ít click, dễ sửa AI sai, đề export in ra dùng ngay | ★★★ |
| **Học sinh** (gián tiếp) | Nhận đề in để làm bài | Đề rõ ràng, đủ đáp án, format sạch | ★★ (qua Owner) |
| **Google Gemini** | AI provider | Tuân thủ rate limit, không gửi PII | ★★ |
| **Vercel** | Host | Không vượt timeout, không vượt bandwidth | ★★ |
| **Supabase** | DB + Storage | Không vượt quota free | ★★ |
| **Dev tương lai** (bao gồm AI code) | Đọc spec, extend feature | Doc rõ ràng, non-goals rõ, quyết định có ghi lại | ★★ |

### 2.3. Requirements — MoSCoW

**Must have** (Phase 1 — không có ≡ không dùng được):
- Upload .docx với khai báo cấu trúc (range → dạng câu)
- Phân loại AI mức độ nhận thức
- CRUD câu hỏi theo chương
- Dedup exact-match qua hash (feature #1)
- Lưu file gốc lên Storage (feature #2)
- Idempotent upload — hash file, không tạo trùng source_files (feature #14)
- Xử lý lỗi AI graceful — fallback `unclassified` (feature #13)
- Tạo đề với config chương + số câu + phân bổ mức độ/dạng
- Preview HTML trước export (feature #6)
- Export Word: đề trắng + đề có đáp án (feature #5)
- Lịch sử đề đã tạo, tái tạo được (feature #4)
- Auth password đơn giản

**Should have** (Phase 2):
- Support .pdf qua Gemini native input
- Export PDF
- Tags tự do + filter theo tag khi tạo đề (feature #3)
- Duplicate config đề cũ

**Could have** (Phase 3, tuỳ nhu cầu):
- Shuffle đáp án A/B/C/D khi export
- Sinh nhiều mã đề cùng bộ câu
- Import/export bank → JSON (backup)
- Dashboard thống kê phân bố câu
- Luyện tập online + spaced repetition

**Won't have** (không làm ở bất kỳ phase nào):
- OCR PDF scan / ảnh chụp
- Render công thức toán đẹp (LaTeX, MathType)
- Multi-user, sharing, permission
- Mobile app native
- Chấm điểm tự luận tự động
- Tích hợp LMS (Moodle, Classroom)

### 2.4. Decomposition theo Computational Nature

Chia bài toán thành **6 subproblem tính toán độc lập** (KHÔNG chia theo màn hình UI). Mỗi subproblem có định dạng `Input / Output / Operators / Evaluation / Constraints`.

#### SP1 — Document Parsing
Trích xuất văn bản có cấu trúc từ file binary.
- **Input:** File binary (.docx | .pdf), MIME type, kích thước
- **Output:** 
  - Với .docx: chuỗi HTML/text giữ thứ tự nội dung
  - Với .pdf: raw bytes để pass thẳng cho SP3 (Gemini)
- **Operators:** `mammoth.convertToHtml()` cho docx; pass-through cho pdf
- **Evaluation:** ≥ 95% ký tự giữ đúng thứ tự với docx sạch
- **Constraints:** ≤ 2s/file

#### SP2 — Question Segmentation
Cắt text tổng thành các câu hỏi độc lập.
- **Input:** Text từ SP1 + cấu trúc user khai báo `[{from, to, type}]`
- **Output:** Danh sách `[{number, type, raw_content}]` chưa có `difficulty`
- **Operators:** Regex pattern match marker (`Câu N`, `N.`, `N)`) → cắt block → map `number → type` theo range user cung cấp
- **Evaluation:** Deterministic, không phụ thuộc AI. Số câu tách được = số câu trong range user khai báo
- **Constraints:** ≤ 500ms

> **Trade-off cho PDF:** SP1+SP2 có thể gộp và uỷ thác cho Gemini (Gemini nhận PDF native, tự parse + segment). Đơn giản code hơn nhưng tốn AI token. Đã chọn hướng này để tránh phải xử lý PDF phức tạp local.

#### SP3 — Cognitive Classification
Phân loại mức độ nhận thức từng câu bằng AI.
- **Input:** Batch câu hỏi `[{number, content, type}]` (5-10 câu/batch)
- **Output:** `[{number, difficulty ∈ {biet, hieu, van_dung, unclassified}}]`
- **Operators:** Gemini 2.5 Flash với strict JSON prompt (chi tiết Section 8.2)
- **Evaluation:** Accuracy ~70-80% cho đề Việt Nam thường (đủ dùng cho ôn tập, không phải thi)
- **Constraints:** 
  - `≤ 3 concurrent, ≤ 15 req/phút` (dùng `p-limit`)
  - Fail-safe: JSON hỏng → tất cả câu trong batch về `unclassified`, log error, KHÔNG crash upload

#### SP4 — Content Deduplication
Chống câu trùng khi insert vào bank.
- **Input:** Câu hỏi mới `q_new`
- **Output:** Bool `is_duplicate`; nếu không trùng thì `content_hash` để lưu
- **Operators:** 
  - `normalize(text) = strip_diacritics → lowercase → remove_leading_numbering → collapse_whitespace`
  - `content_hash = SHA-256(normalize(content))`
  - Unique index trên `questions.content_hash` → insert conflict = trùng
- **Evaluation:** 100% catch exact-match sau normalize; KHÔNG catch fuzzy (chấp nhận trade-off)
- **Constraints:** O(1) lookup nhờ DB index

#### SP5 — Constrained Random Sampling
Lấy mẫu câu hỏi từ bank để tạo đề, thoả mọi ràng buộc config.
- **Input:** Bank `Q`, config `C = (chapters, total, dist_difficulty, dist_type, tags?, seed)`
- **Output:** `question_ids[]` có thứ tự cố định
- **Operators:** 
  - Với mỗi tổ hợp `(difficulty, type)` cần lấy `k` câu:
    - Query `chapter_id IN C.chapters ∧ difficulty=... ∧ type=...`
    - Lấy random `k` câu, seed cố định (deterministic RNG)
  - Union kết quả → shuffle final theo seed
  - Nếu tổ hợp nào thiếu câu → báo user rõ ràng (không silent fail)
- **Evaluation:** Cho cùng `(Q, C, seed)` → luôn ra cùng `question_ids[]` (100% deterministic — điều kiện của feature #4)
- **Constraints:** ≤ 1s cho bank 1000 câu; `total ≤ 100 câu/đề`

#### SP6 — Document Generation
Render danh sách câu hỏi ra file có thể in.
- **Input:** `question_ids[]` theo thứ tự, format `∈ {docx, pdf}`, variant `∈ {blank, with_answer}`
- **Output:** File buffer, download về client
- **Operators:** 
  - docx: `docx` npm — Paragraph/Numbering/Table
  - pdf: `@react-pdf/renderer` — component tree → PDF buffer
- **Evaluation:** File mở được ở MS Word / Adobe Reader; câu và đáp án hiển thị đúng thứ tự; không lỗi encoding tiếng Việt
- **Constraints:** ≤ 3s cho đề 30 câu; file ≤ 5MB

### 2.5. Dependency Graph

```
UPLOAD FLOW:
  file ──► SP1 (Parse) ──► SP2 (Segment) ──► SP3 (Classify, batched) ──┐
                                                                        ▼
                                                              SP4 (Dedup) ──► DB
                                                                (insert or skip)

CREATE EXAM FLOW:
  user config ──► SP5 (Sample) ──► preview UI ──► SP6 (Generate) ──► file download
                       ▲                              │
                       │                              ▼
                       └── exams table (lưu question_ids để re-export sau)
```

**Chú thích dependency:**
- `SP1 → SP2`: sequential — cần text để cắt câu
- `SP2 → SP3`: sequential — cần biết câu mới phân loại được
- `SP3 → SP4`: sequential trong cùng câu, nhưng SP3 batch song song được (tối đa 3 concurrent)
- `SP5 → SP6`: user có thể pause ở preview (edit, thay câu) trước khi generate

### 2.6. Trade-offs chính

| Quyết định | Đã chọn | Alternative | Lý do |
|---|---|---|---|
| Dedup exact vs fuzzy | Exact (hash) | Embedding similarity | Đơn giản, đủ dùng; embedding tốn AI call + phức tạp |
| Parse PDF local vs qua AI | Qua Gemini (uỷ thác SP1+SP2) | `pdf-parse` local | Chất lượng cao hơn nhiều, đặc biệt với đề 2 cột / có công thức |
| Detect type câu bằng AI vs user khai báo | User khai báo range → type | AI detect từng câu | Tiết kiệm ~50% AI call, chính xác 100%, giảm risk timeout |
| Expose random seed lên UI | Có expose | Ẩn | Cho phép user paste seed cũ để tái tạo — điều kiện feature #4 |
| Auth Supabase vs password đơn giản | Password + JWT cookie | Supabase Auth | 1 user, không cần user management |
| Preview trước export | Có | Export thẳng | Tránh export lại nhiều lần khi thấy không ưng — feature #6 |

### 2.7. Pitfalls đã né

1. **Misframing (mô tả UI thay vì bài toán tính toán):** Section 2.4 chia theo `Input/Output/Operators`, KHÔNG theo màn hình.
2. **Decomposition theo UI:** Đã né — subproblem là parse/classify/sample/generate, không phải "upload page/list page/create page".
3. **Non-measurable evaluation:** Mọi SP đều có số cụ thể (95%, ≤5s, 70-80%, O(1)...).
4. **Silent AI failure:** SP3 wrapper luôn trả `unclassified` khi lỗi + log; không được crash upload.
5. **Race condition ở dedup:** Dùng DB-level unique constraint thay vì check-then-insert ở app level.
6. **Scope creep:** Non-goals rõ ở 2.3 (Won't have) — bất kỳ request rơi vào list này đều phải confirm lại với owner.

---

## 3. Nguyên tắc thiết kế

Đây là các nguyên tắc xuyên suốt. Khi có quyết định thiết kế mâu thuẫn nhau, ưu tiên theo thứ tự này:

1. **Free hoàn toàn.** Toàn bộ dự án phải chạy trên free tier của các dịch vụ. Không được thêm dependency có phí. Nếu một tính năng đòi hỏi trả phí → cắt tính năng đó hoặc tìm workaround.
2. **Đơn giản hơn là chính xác hơn.** Đề dùng để ôn tập, không phải thi chính thức. AI phân loại sai vài % là chấp nhận được — miễn là user có thể sửa tay nhanh chóng.
3. **Không tin AI 100%.** Mọi output của AI đều phải có escape hatch: user có thể xem, sửa, xoá. AI parse sai → fallback về giá trị mặc định, không crash.
4. **Reproducibility.** Đề đã tạo phải tái tạo lại được y hệt sau này (để lấy đáp án, in lại...).
5. **Idempotency.** Upload cùng file 2 lần không tạo dữ liệu trùng. Gọi lại một action không gây side effect ngoài ý muốn.
6. **UI ít click.** App cá nhân — ưu tiên form phẳng, thao tác nhanh, tránh wizard nhiều bước.

---

## 4. Ràng buộc kỹ thuật (free tier)

| Dịch vụ | Giới hạn free | Cách né |
|---|---|---|
| Vercel Hobby | Serverless timeout 10s, 100GB bandwidth/tháng | Chunk file, batch AI call, tránh xử lý dài trong 1 request |
| Supabase Free | Postgres 500MB, Storage 1GB, upload/file ≤ 50MB | Nén JSON, tối ưu schema, đề < 50MB (thực tế < 5MB) |
| Gemini API | Model 2.5 Flash: 1500 req/ngày, ~15 req/phút | Batch câu hỏi mỗi request, throttle client-side |

**Chi phí kỳ vọng:** 0 VND/tháng cho scale cá nhân (< 50 file/tháng, < vài nghìn câu).

---

## 5. Tech stack

- **Framework:** Next.js 14+ (App Router, TypeScript)
- **Hosting:** Vercel Hobby
- **Database:** Supabase Postgres
- **File storage:** Supabase Storage
- **AI:** Google Gemini 2.5 Flash (qua `@google/generative-ai` SDK)
- **Parse Word:** `mammoth` (docx → HTML/text)
- **Parse PDF:** Gemini native PDF input (gửi thẳng file cho AI). Fallback: `pdf-parse` cho PDF text-only nếu muốn giảm AI call.
- **Export Word:** `docx` (npm)
- **Export PDF:** `@react-pdf/renderer` (nhẹ, chạy được trong Vercel serverless)
- **Auth:** Middleware Next.js + password đơn giản qua env variable + cookie session (không cần Supabase Auth)
- **Rate limiting AI:** `p-limit` hoặc queue tự viết
- **UI:** Tailwind CSS + shadcn/ui (hoặc component nhẹ tự viết)

**Không dùng:** Puppeteer (nặng), OCR (không hỗ trợ PDF scan ở Phase 1), Supabase Auth (over-kill cho 1 user).

---

## 6. Data model

Schema Postgres. Tất cả bảng có `created_at TIMESTAMPTZ DEFAULT now()`.

### Bảng `chapters`
```
id            uuid PK
name          text NOT NULL          -- "Chương 3 - Đạo hàm"
subject       text                   -- "Toán 12", "Vật lý 11"...
description   text                   -- optional, ghi chú
```

### Bảng `source_files`
File gốc user upload. Giữ lại để re-process về sau nếu cần.
```
id            uuid PK
chapter_id    uuid FK → chapters.id
filename      text NOT NULL          -- tên file gốc
storage_path  text NOT NULL          -- đường dẫn trong Supabase Storage
file_hash     text NOT NULL UNIQUE   -- SHA-256 file content, chống upload trùng (feature #14)
file_size     int
mime_type     text
structure     jsonb NOT NULL         -- config dạng câu do user khai báo, VD: [{"from":1,"to":10,"type":"multiple_choice"}]
status        text NOT NULL          -- "pending" | "processing" | "done" | "failed"
error_log     text                   -- lưu lỗi nếu status=failed (feature #13)
```

### Bảng `questions`
```
id              uuid PK
chapter_id      uuid FK → chapters.id
source_file_id  uuid FK → source_files.id
question_number int                  -- số thứ tự trong file gốc
type            text NOT NULL        -- "multiple_choice" | "short_answer" | "true_false" | "essay" | ...
difficulty      text                 -- "biet" | "hieu" | "van_dung" | "unclassified" (fallback từ AI, feature #13)
content         text NOT NULL        -- nội dung câu hỏi
options         jsonb                -- [{"key":"A","text":"..."}, ...] với trắc nghiệm; null với dạng khác
answer          text                 -- đáp án đúng (A/B/C/D hoặc text)
explanation     text                 -- lời giải (nếu có/AI sinh ra)
tags            text[] DEFAULT '{}'  -- tag tự do (feature #3): ["hàm số", "bài toán thực tế"]
content_hash    text NOT NULL        -- hash nội dung sau normalize, dùng dedup (feature #1)
```

**Index quan trọng:**
- `CREATE INDEX ON questions(chapter_id, difficulty, type);` — filter tạo đề
- `CREATE UNIQUE INDEX ON questions(content_hash);` — chống trùng (feature #1)
- `CREATE INDEX ON questions USING gin(tags);` — filter theo tag

### Bảng `exams`
Lịch sử đề đã tạo, để tái tạo (feature #4/5).
```
id            uuid PK
name          text NOT NULL          -- "Ôn thi giữa kỳ - Chương 1,2,3"
config        jsonb NOT NULL         -- config đầy đủ khi tạo: chapters, số câu, tỉ lệ, seed random
question_ids  uuid[] NOT NULL        -- danh sách câu hỏi theo thứ tự đã trộn trong đề
notes         text                   -- ghi chú tuỳ ý
```

**Ví dụ `exams.config`:**
```json
{
  "chapter_ids": ["...", "..."],
  "total_questions": 30,
  "by_difficulty": {"biet": 10, "hieu": 15, "van_dung": 5},
  "by_type": {"multiple_choice": 20, "short_answer": 10},
  "random_seed": "abc123",
  "created_at": "2026-07-20T..."
}
```

---

## 7. Các luồng chính

### 7.1. Upload đề (theo chương)

```
[User] chọn chương (hoặc tạo mới)
   ↓
[User] khai báo cấu trúc đề:
       - Dải câu 1-10:  trắc nghiệm
       - Dải câu 11-20: trả lời ngắn
       - Dải câu 21-25: tự luận
   ↓
[User] upload file .docx hoặc .pdf
   ↓
[Backend] tính SHA-256 hash file
   ↓
[Backend] check hash đã tồn tại trong source_files? 
             → CÓ: báo user "file đã upload rồi, dùng bản cũ hay ghi đè?" (feature #14)
             → KHÔNG: tiếp tục
   ↓
[Backend] upload file lên Supabase Storage (feature #2)
[Backend] tạo record source_files status="pending"
   ↓
[Backend] SP1 Parse:
    - docx → mammoth → text/html
    - pdf  → gửi thẳng cho Gemini (native PDF input)
   ↓
[Backend] SP2 Segment: chia câu theo range user khai báo (không cần AI)
   ↓
[Backend] SP3 Classify — với MỖI batch câu hỏi (5-10 câu):
    - Gọi Gemini với prompt phân loại mức độ (biết/hiểu/vận dụng)
    - Nếu Gemini fail hoặc trả JSON hỏng: 
        → set difficulty="unclassified" (feature #13)
        → log lỗi vào source_files.error_log
        → KHÔNG crash toàn bộ upload
   ↓
[Backend] SP4 Dedup — với mỗi câu hỏi:
    - Tính content_hash (normalize: bỏ dấu, lowercase, bỏ số thứ tự)
    - Check trùng trong questions:
        → CÓ: skip, ghi log "n câu trùng đã bỏ qua" (feature #1)
        → KHÔNG: insert
   ↓
[Backend] update source_files status="done"
   ↓
[Frontend] hiển thị kết quả: X câu đã thêm, Y câu trùng bỏ qua, Z câu chưa phân loại
```

**Chú ý:**
- Toàn bộ quá trình phải chạy trong < 10s (Vercel timeout). Nếu file lớn → chia làm nhiều batch AI call bất đồng bộ.
- Nếu vẫn không kịp: pattern "upload → return job_id → polling status". Nhưng ở scope cá nhân, đa số file < 30 câu nên 1 request là đủ.

### 7.2. Quản lý câu hỏi theo chương

```
[Trang: /chapters]
  Dropdown chọn chương (default: chương gần nhất mở)
    ↓
  Hiển thị list câu hỏi trong chương:
    - Filter theo: dạng câu, mức độ (kể cả "unclassified"), tag
    - Mỗi item có: badge dạng câu, badge mức độ, tags, preview 2 dòng đầu
    - Action: xem chi tiết, sửa inline, xoá, đổi mức độ, thêm/xoá tag
  Bên cạnh: list file đã upload cho chương này (có thể xoá file → xoá cascade câu hỏi)
```

### 7.3. Tạo đề mới (SP5 → preview → SP6)

```
[Trang: /exam/new]
  Bước 1: Chọn chương (multi-select)
  Bước 2: Cấu hình:
    - Tổng số câu: 30
    - Phân bổ theo mức độ: biết X, hiểu Y, vận dụng Z (validate: X+Y+Z ≤ tổng)
    - Phân bổ theo dạng câu: TN 20, ngắn 10 (validate tương tự)
    - (Optional) filter thêm theo tag
    - Random seed (auto sinh, cho phép user paste seed cũ để tái tạo — feature #4)
  Bước 3: Bấm "Xem thử"
    ↓
  [SP5 chạy] Backend query DB với constraint:
    - chapter_id IN (...)
    - random theo seed
    - lấy đúng số câu theo mỗi combo (mức độ × dạng)
    - nếu không đủ câu → báo user thiếu bao nhiêu, có thể tiếp tục với số ít hơn
    ↓
  [Preview HTML] (feature #6):
    - Hiển thị đề đầy đủ như file thật
    - Có nút: "Trộn lại", "Đổi câu này" (thay câu i bằng câu random khác cùng loại),
              "Xoá câu này", "Sửa câu này inline"
    ↓
  Khi ưng: 
    - Đặt tên đề → lưu vào exams (feature #5: lịch sử)
    - Nút Export → [SP6 chạy] chọn format (Word/PDF) + chọn "đề trắng" hay "đề + đáp án"
```

### 7.4. Xem lịch sử đề đã tạo

```
[Trang: /exams]
  Bảng list các đề đã tạo:
    - Tên, ngày tạo, số câu, chương
    - Action: xem preview lại, export lại (dùng question_ids đã lưu),
              duplicate (clone config để tạo đề tương tự), xoá
```

Vì lưu `question_ids[]` nên đề luôn tái tạo được đúng như lần đầu, kể cả sau khi bank câu hỏi thay đổi.

### 7.5. Export

- **Đề trắng:** chỉ câu hỏi + đáp án A/B/C/D (không đánh dấu đáp án đúng)
- **Đề có đáp án:** kèm đáp án + lời giải (nếu có) ở cuối file, hoặc bên cạnh

Cả 2 format: Word (`docx` lib) và PDF (`@react-pdf/renderer`).

---

## 8. AI Integration (Gemini)

### 8.1. Model
- `gemini-2.5-flash` cho phân loại (rẻ, đủ nhanh, free tier hào phóng)
- Với PDF: dùng cùng model — Gemini nhận PDF native

### 8.2. Prompt phân loại câu hỏi (batch)

Gửi 5-10 câu/lần. Yêu cầu output **JSON strict** để parse:

```
Bạn là trợ lý phân loại câu hỏi ôn tập theo thang nhận thức Việt Nam.

Với mỗi câu hỏi dưới đây, hãy phân loại mức độ:
- "biet": nhận biết, tái hiện kiến thức, nhớ định nghĩa/công thức
- "hieu": thông hiểu, giải thích, phân biệt, ví dụ minh hoạ
- "van_dung": vận dụng, áp dụng vào bài toán mới, phân tích, tổng hợp

Trả về JSON DUY NHẤT với format:
{
  "results": [
    {"number": 1, "difficulty": "biet"},
    {"number": 2, "difficulty": "hieu"},
    ...
  ]
}

Không thêm giải thích, không markdown, không backtick.

Danh sách câu hỏi:
[nội dung các câu]
```

### 8.3. Xử lý lỗi AI (feature #13)

Bắt buộc mọi AI call phải qua wrapper sau:

```typescript
async function classifyBatch(questions): Promise<Result[]> {
  try {
    const raw = await gemini.generateContent(prompt);
    const cleaned = stripMarkdown(raw);      // bỏ ```json ... ``` nếu có
    const parsed = JSON.parse(cleaned);
    validateSchema(parsed);                   // kiểm tra đúng shape
    return parsed.results;
  } catch (err) {
    logError({prompt, response: raw, error: err});
    // Fallback: tất cả câu về "unclassified", user sẽ sửa tay
    return questions.map(q => ({number: q.number, difficulty: 'unclassified'}));
  }
}
```

**Nguyên tắc:** một batch fail không được kéo cả upload fail. Câu unclassified vẫn được lưu vào DB, chỉ mất label — user filter được "chưa phân loại" trong trang quản lý để sửa sau.

### 8.4. Rate limiting

Free tier ~15 req/phút. Dùng `p-limit`:
```typescript
const limit = pLimit(3); // tối đa 3 request đồng thời
const results = await Promise.all(
  batches.map(b => limit(() => classifyBatch(b)))
);
```

Nếu upload file lớn có 60 câu (12 batch), throttle sẽ chạy tuần tự nhóm 3, tổng ~4 wave × ~2s/wave = ~8s — vẫn trong Vercel timeout.

---

## 9. Feature spec chi tiết (các quyết định đã chốt)

### Feature #1 — Deduplication câu hỏi
- Normalize content: lowercase, bỏ dấu tiếng Việt, bỏ số thứ tự đầu câu, bỏ khoảng trắng thừa
- Hash SHA-256 kết quả normalize → `content_hash`
- Unique index trên `content_hash` → insert bị conflict = câu trùng → skip
- Báo user số câu trùng đã bỏ sau khi upload xong

### Feature #2 — Lưu file gốc
- Upload lên Supabase Storage, path: `sources/{chapter_id}/{file_hash}.{ext}`
- Không xoá kể cả khi câu hỏi đã lưu xong — dùng cho re-process về sau nếu prompt AI thay đổi
- Trang quản lý cho phép xoá file → cascade xoá câu hỏi liên kết (Phase 1: hard-delete cho đơn giản)

### Feature #3 — Tags tự do
- Text array Postgres, GIN index để filter nhanh
- UI: nhập bằng input có autocomplete (gợi ý tag đã dùng trong cùng chương)
- Không có bảng tags riêng — giữ đơn giản, trim client-side để né tag " " trailing

### Feature #4 — Reproducible exam + lịch sử
- Bảng `exams` lưu `question_ids[]` theo đúng thứ tự đã trộn
- `config` lưu random seed để user có thể "tạo lại đề tương tự" (không phải giống hệt) từ config cũ
- Export lại từ `exams` luôn cho ra file y hệt lần đầu (miễn là câu hỏi chưa bị sửa/xoá)

### Feature #5 — Export đáp án riêng
- Mỗi lần export: hỏi format (Word/PDF) và loại (đề trắng / đề có đáp án)
- 2 file tách biệt, không phải toggle trong 1 file
- Đáp án gom cuối file dạng bảng gọn: `Câu 1: A | Câu 2: C | ...` để in kèm nhanh

### Feature #6 — Preview trước export
- Sau khi gen đề: hiển thị HTML render giống file cuối
- Action ngay trên preview: đổi câu, xoá câu, sửa câu (chỉ trong exam context, không đụng đến bank), trộn lại
- Chỉ khi user bấm "Lưu & Export" mới ghi vào `exams` và tạo file

### Feature #13 — Xử lý lỗi AI rõ ràng
- Mọi AI call qua wrapper try/catch
- Fallback: `difficulty = "unclassified"`
- Log lỗi vào `source_files.error_log` để debug
- UI: badge riêng cho "chưa phân loại" để user filter và sửa sau

### Feature #14 — Idempotent upload
- Trước khi upload lên storage, tính hash file
- Check `source_files.file_hash` — nếu trùng: hỏi user "file đã có sẵn, muốn dùng bản cũ hay xoá & upload lại?"
- Storage path dùng hash → 2 lần upload cùng file → ghi đè cùng file trong storage (không tốn dung lượng)

---

## 10. Auth & bảo mật

- **Single password auth** qua env variable `APP_PASSWORD`
- Middleware Next.js check cookie `auth_token` trên mọi route trừ `/login`
- Login endpoint: POST password → compare → set cookie httpOnly signed với JWT (secret trong env)
- Cookie expire 30 ngày, refresh khi user hoạt động
- Không lưu password hash trong DB, không cần user management (single user)
- **Không public bất kỳ endpoint API nào** — kể cả upload, export
- Supabase RLS: bật ở mọi bảng, chỉ cho phép truy cập qua service role key (chạy server-side)

**Env variables cần:**
```
APP_PASSWORD=...
JWT_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

Không được commit lên Git. Set trong Vercel dashboard.

---

## 11. Roadmap

### Phase 1 — MVP (mục tiêu 1-2 tuần)
- [ ] Setup Next.js + Supabase + Vercel deploy
- [ ] Auth middleware + trang login
- [ ] Schema DB + migrations
- [ ] Trang upload docx với khai báo cấu trúc + phân loại AI (SP1-SP4)
- [ ] Trang quản lý câu hỏi theo chương (list + edit + delete)
- [ ] Trang tạo đề với preview (SP5 + feature #6)
- [ ] Export Word (đề trắng + đề có đáp án) — SP6
- [ ] Trang lịch sử đề (feature #4)

**Kết thúc Phase 1 = dự án đã dùng được cho ôn tập cá nhân.**

### Phase 2 — Bổ sung
- [ ] Support PDF (qua Gemini native input)
- [ ] Export PDF
- [ ] Filter theo tag khi tạo đề
- [ ] Duplicate đề cũ để tạo đề mới nhanh

### Phase 3 — Nếu thấy cần
- [ ] Shuffle đáp án trắc nghiệm khi export
- [ ] Nhiều mã đề cùng bộ câu
- [ ] Import/export ngân hàng câu JSON (backup)
- [ ] Dashboard thống kê phân bố câu theo chương/mức độ
- [ ] Chế độ luyện tập trực tiếp trên web

---

## 12. Non-goals (KHÔNG làm)

Ghi lại rõ để tránh scope creep:

- **Không** OCR PDF scan ở bất kỳ phase nào — nếu cần, user tự chuyển sang docx trước
- **Không** hỗ trợ công thức toán render đẹp (MathType, LaTeX) — text thô là được
- **Không** làm multi-user, sharing, permission
- **Không** làm mobile app native — chỉ web responsive
- **Không** làm chấm điểm tự động cho câu tự luận
- **Không** tích hợp LMS (Moodle, Google Classroom...)
- **Không** làm marketplace hay chia sẻ đề với người khác

---

## 13. Câu hỏi mở / cần quyết định khi code

Danh sách này để tracking. Khi implement mà gặp thì quyết định và ghi lại:

- Khi xoá `source_files`, có nên soft-delete câu hỏi liên kết không? (Hiện: hard-delete)
- User có được sửa `content_hash` không khi sửa câu hỏi? (Hiện: recompute hash mỗi lần save, có thể gây conflict với câu khác — cần handle)
- Khi tạo đề mà không đủ câu theo config: dừng hay tự động giảm số câu và báo user? (Hiện: báo user và cho phép giảm)
- Random seed: hash-based hay số? UI có expose seed không? (Hiện: string ngẫu nhiên, có expose để user paste lại)
- Đề trộn có nên avoid câu đã dùng trong đề gần đây không? (Có thể là Phase 3)

---

## 14. Quick reference cho AI/dev

Khi được giao task trong dự án này, luôn:

1. **Đọc Section 2 (Phân rã bài toán)** để hiểu bài toán thuộc SP nào và ràng buộc của nó
2. **Đọc Section 3 (Nguyên tắc thiết kế)** trước khi đưa ra quyết định
3. **Check Section 4 (Ràng buộc free tier)** khi thêm dependency hoặc thiết kế flow
4. **Không thay đổi schema** ở Section 6 mà không cập nhật cả file này
5. **Không dùng bất kỳ tính năng nào ở Section 12 (Non-goals)** — nếu user request, phải confirm lại với owner trước
6. **Wrap mọi AI call** theo pattern ở Section 8.3 — không có ngoại lệ
7. **Feature nào chưa có trong Section 9** thì chưa được implement — hỏi trước

### Self-check trước khi commit code

- [ ] Task này thuộc SP nào? (SP1-6 hoặc UI/infra)
- [ ] Có vượt Vercel timeout 10s không?
- [ ] Có vượt Gemini rate limit không?
- [ ] Có escape hatch cho user sửa nếu AI sai không?
- [ ] Có deterministic không (nếu là SP5 hoặc export)?
- [ ] Có idempotent không (nếu là upload hoặc create)?
- [ ] Có nêu trade-off khi có nhiều lựa chọn không?

Nếu bất kỳ ô nào không đạt → xem lại thiết kế trước khi merge.
