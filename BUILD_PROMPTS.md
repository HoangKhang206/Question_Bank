# Build Prompts — Kịch bản Claude Code

Tài liệu này chứa **danh sách prompt tuần tự** để paste vào Claude Code (`claude` CLI), build từ skeleton hiện tại thành MVP hoàn chỉnh chạy production.

**Ước lượng tổng**: 6-10 giờ (làm rải nhiều buổi).

**Quy ước:**
- Prompt trong khối `>` — copy nguyên, paste vào Claude Code.
- Sau mỗi prompt có **Kết quả kỳ vọng** + **Cách verify**. Không đạt → dùng **Fallback prompt** hoặc nói với Claude "kết quả chưa đạt, làm lại theo hướng ...".
- Mỗi phase tự làm được — không cần chạy tuần tự trong 1 session. Có thể ngắt giữa chừng, hôm sau tiếp.

**Trước khi bắt đầu:** Cài Claude Code CLI (`npm install -g @anthropic-ai/claude-code`), `cd` vào folder `question-bank/`, chạy `claude`. Claude Code sẽ tự đọc `CLAUDE.md` → `SKILL.md`.

---

## Phase 0 — Setup môi trường (30 phút)

### Prompt 0.1 — Verify skeleton + install

> Đọc CLAUDE.md và SKILL.md trước. Sau đó:
> 1. Chạy `npm install` và báo cáo lỗi nếu có
> 2. Chạy `npx tsc --noEmit` để check TypeScript errors
> 3. Nếu có lỗi TypeScript, fix TẤT CẢ (đừng để tôi build với warning)
> 4. Cuối cùng chạy `npm run build` verify build được

**Kết quả kỳ vọng**: `npm run build` xanh, không lỗi.

**Verify**: 
```bash
npm run build && echo "OK"
```

**Fallback nếu fail**: 
> Build vẫn fail. Đọc kỹ error message, xác định nguyên nhân, sửa và thử lại. Nếu là lỗi thiếu type declaration, tạo file `next-env.d.ts` theo Next.js docs.

---

### Prompt 0.2 — Setup Supabase project

> Hướng dẫn tôi setup Supabase project cho dự án này. Cụ thể:
> 1. Cần vào URL nào, đăng nhập/đăng ký ra sao
> 2. Tạo project mới cần điền gì (region nên chọn Singapore vì tôi ở Việt Nam)
> 3. Sau khi tạo, lấy 2 giá trị nào để điền vào .env.local (SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY)
> 4. Vào SQL Editor, paste toàn bộ db/schema.sql, chạy — hướng dẫn tôi verify 4 bảng đã tạo
> 5. Vào Storage, tạo bucket "sources" private — hướng dẫn tôi các bước UI cụ thể

**Kết quả kỳ vọng**: Bạn có 4 bảng (chapters, source_files, questions, exams) + 1 bucket "sources" private.

**Verify** (chạy trong Supabase SQL Editor):
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

---

### Prompt 0.3 — Setup env variables

> Sinh giúp tôi JWT_SECRET random 48 bytes bằng openssl. Sau đó tạo file .env.local từ .env.example, đặt sẵn JWT_SECRET này. APP_PASSWORD tôi tự đặt sau. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY để trống placeholder — tôi sẽ điền tay.

**Kết quả kỳ vọng**: File `.env.local` tồn tại, có JWT_SECRET.

**Verify**:
```bash
grep -c "JWT_SECRET" .env.local   # phải trả về 1
```

**Sau prompt này, TỰ LÀM:**
- Điền `APP_PASSWORD` (mật khẩu bạn tự chọn)
- Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` (từ Supabase dashboard)
- Điền `GEMINI_API_KEY` (lấy ở https://aistudio.google.com/apikey)

---

### Prompt 0.4 — Chạy dev + smoke test

> Chạy `npm run dev` (chạy background). Đợi 5 giây rồi curl http://localhost:3000/login xem có return HTML không. Nếu OK, dừng dev server và báo cáo.

**Kết quả kỳ vọng**: `curl` trả về HTML có chữ "Đăng nhập".

**Nếu fail**: Đọc log dev server, sửa lỗi. Common: env variable chưa load → restart dev server sau khi sửa `.env.local`.

---

## Phase 1 — Verify skeleton chạy end-to-end (1-2 giờ)

### Prompt 1.1 — Chuẩn bị file test docx đơn giản

> Tạo giúp tôi file test-simple.docx trong folder /tmp với 5 câu trắc nghiệm đơn giản môn Toán, mỗi câu có 4 đáp án A/B/C/D. Dùng thư viện `docx` npm mà project đã có. Viết một script tạm ở `scripts/gen-test-docx.ts`, chạy `npx tsx` để sinh file. Sau đó verify file tồn tại và có kích thước hợp lý.

**Kết quả kỳ vọng**: File `/tmp/test-simple.docx` tồn tại, ~5-10KB.

---

### Prompt 1.2 — Test upload thủ công

Bây giờ TỰ LÀM (không dùng Claude):
1. Chạy `npm run dev`
2. Mở http://localhost:3000 → redirect sang `/login`
3. Login với password đã đặt
4. Vào `/chapters` → tạo chương "Test 1"
5. Vào `/upload?chapter_id=xxx` → upload `/tmp/test-simple.docx`, khai báo câu 1-5 là trắc nghiệm
6. Đợi ~10 giây

**Kết quả kỳ vọng**: Hiện `✓ Đã thêm 5 câu, trùng bỏ qua 0, chưa phân loại: 0 hoặc 1-2`.

**Nếu fail**: 

### Prompt 1.3 — Debug upload nếu fail

> Upload file không thành công. Log dev server hiện: [paste log]. Kiểm tra:
> 1. Env variables đã load đúng chưa (log ra `process.env.SUPABASE_URL` để verify)
> 2. Supabase Storage bucket "sources" đã tạo chưa
> 3. Gemini API key có hoạt động không (viết 1 script test call Gemini đơn giản)
> 4. SP2 segment có tìm được marker "Câu N" không (log ra `rawQuestions.length` trước SP3)
> Debug từng bước và sửa nguyên nhân gốc.

---

### Prompt 1.4 — Test tạo đề

TỰ LÀM:
1. Vào `/exam/new`
2. Chọn chương "Test 1"
3. Đặt total = 3, biết=1, hiểu=1, vận_dụng=1, trắc_nghiệm=3
4. Bấm "Xem thử"
5. Nếu preview hiện đủ 3 câu, bấm "Export Word (đề trắng)"

**Kết quả kỳ vọng**: Download được file `.docx`, mở lên có 3 câu.

**Nếu fail**:

### Prompt 1.5 — Debug tạo đề

> Preview đề bị lỗi/thiếu câu. Kiểm tra `lib/sample/sample.ts`:
> 1. Bank có đủ câu ở tổ hợp (difficulty × type) yêu cầu không?
> 2. Logic phân bổ `by_difficulty × by_type` có đúng không?
> 3. Nếu tất cả câu là "unclassified" thì cần điều chỉnh test config để yêu cầu `unclassified` thay vì `biet/hieu/van_dung`
> Log missing[] ra console để debug.

---

## Phase 2 — Điền các phần còn thiếu (3-5 giờ)

Skeleton hiện chỉ lưu content thô. Phần này bổ sung logic parse chi tiết + UI edit.

### Prompt 2.1 — Options parser cho câu trắc nghiệm

> Nâng cấp SP2 (`lib/parse/segment.ts`): sau khi cắt câu xong, với những câu type='multiple_choice', tách thành `content` + `options[]`.
>
> Format đầu vào (raw_content) sẽ dạng như:
> ```
> Câu 1: Đạo hàm của y = x³ là:
>   A. 3x²    B. x²
>   C. 3x     D. x³/3
> ```
> hoặc mỗi đáp án 1 dòng.
>
> Output cần:
> - `content`: "Đạo hàm của y = x³ là:"
> - `options`: [{key:'A',text:'3x²'},{key:'B',text:'x²'},{key:'C',text:'3x'},{key:'D',text:'x³/3'}]
>
> Requirements:
> 1. Regex tách flexible (đáp án cùng dòng hoặc khác dòng, phân cách bằng "  " hoặc newline)
> 2. Nếu không tìm được đủ 4 đáp án → giữ nguyên content thô, options=null, log warning
> 3. Extend `RawQuestion` trong `lib/types.ts` để có optional `options` field
> 4. Update `app/api/upload/route.ts` để lưu `options` vào DB
> 5. Update `app/upload/page.tsx` không cần đổi (chỉ hiển thị số câu)
> 6. Viết unit test đơn giản trong `lib/parse/segment.test.ts` cho 3 case: đáp án cùng dòng, đáp án khác dòng, đáp án không tìm được
>
> Sau khi xong, chạy test và verify.

**Kết quả kỳ vọng**: Upload lại file test → xem trong DB (Supabase Table Editor) → cột `options` có JSON đầy đủ.

**Verify**:
```sql
-- Chạy trong Supabase SQL Editor
SELECT question_number, options FROM questions 
WHERE type = 'multiple_choice' LIMIT 5;
```

---

### Prompt 2.2 — Answer extractor (nếu đề có sẵn đáp án)

> Một số đề có sẵn đáp án ở cuối file (dạng bảng "Câu 1: A, Câu 2: C..."). Nâng cấp pipeline để extract:
>
> 1. Sau SP2 (segment), thêm bước `extractAnswers(text)` trong `lib/parse/segment.ts` — regex tìm pattern "Câu N: X" ở cuối file
> 2. Map answer về từng câu hỏi tương ứng theo number
> 3. Update `app/api/upload/route.ts` insert cả `answer` vào DB
> 4. Nếu không tìm được đáp án cho câu nào → để null, không throw
> 5. Thêm log rõ ràng "Tìm được X đáp án / Y câu"
>
> Test với file docx có sẵn đáp án ở cuối.

**Kết quả kỳ vọng**: DB có cột `answer` đầy đủ khi đề có sẵn.

---

### Prompt 2.3 — Edit câu hỏi inline UI

> Nâng cấp `app/chapters/chapter-view.tsx` để user edit câu hỏi inline:
>
> 1. Click vào một câu → mở modal/panel edit
> 2. Form edit gồm: content (textarea), difficulty (select), type (select), options (nếu multiple_choice — list input A/B/C/D), answer (input), tags (input chuỗi phân cách bằng dấu phẩy)
> 3. Nút "Lưu" → PATCH /api/questions/[id] với body chỉ chứa field đã sửa
> 4. Nút "Xoá" → DELETE /api/questions/[id], confirm bằng window.confirm
> 5. Sau khi save/delete thành công → refresh list mà không reload trang
> 6. Handle error 409 (dedup conflict khi sửa content trùng câu khác) — hiển thị message rõ
>
> Ưu tiên UX gọn: modal không nên full-screen, form phẳng, không nhiều bước.

**Kết quả kỳ vọng**: Click câu → edit → lưu → thấy update ngay trong list.

---

### Prompt 2.4 — Xoá source file (cascade)

> Trong `app/chapters/chapter-view.tsx`, thêm phần bên phải hiển thị danh sách source_files của chương đang chọn:
>
> 1. Server component (hoặc useEffect fetch) load list từ `/api/source-files?chapter_id=xxx` (endpoint mới cần tạo)
> 2. Mỗi item hiển thị: filename, số câu đã trích xuất, status, ngày upload
> 3. Nút "Xoá" trên mỗi item → DELETE `/api/source-files/[id]` (endpoint mới cần tạo)
> 4. Delete cascade: xoá source_files → DB tự cascade xoá questions liên kết (FK ON DELETE CASCADE đã set trong schema)
> 5. Cũng xoá file gốc trên Supabase Storage bằng `sb.storage.from('sources').remove([path])`
> 6. Confirm dialog trước khi xoá

**Kết quả kỳ vọng**: Xoá source file → cả file trong Storage + tất cả câu hỏi từ file đó biến mất.

---

### Prompt 2.5 — Tags autocomplete

> Trong form edit câu hỏi (Prompt 2.3), nâng cấp tags input:
>
> 1. Thêm endpoint `/api/tags?chapter_id=xxx` trả về distinct tags trong chương (Postgres: SELECT DISTINCT unnest(tags) FROM questions WHERE chapter_id=...)
> 2. Trong form, khi user gõ tag mới, hiện dropdown gợi ý các tag đã có trong chương
> 3. Cho phép chọn multiple (Enter để thêm, x để xoá)
> 4. Không cần bảng tags riêng — chỉ query distinct từ mảng tags có sẵn

**Kết quả kỳ vọng**: Gõ "hàm" → gợi ý "hàm số" nếu tag đã dùng trước.

---

### Prompt 2.6 — Loading + empty + error states

> Rà soát toàn bộ trang UI, thêm state đầy đủ:
>
> 1. Loading state: skeleton hoặc spinner khi đang fetch (không dùng "Đang tải..." trống trơn)
> 2. Empty state: khi list rỗng, hiện text hướng dẫn + CTA (VD: "Chưa có câu hỏi. [Upload đề đầu tiên]")
> 3. Error state: khi fetch fail, hiện toast/banner đỏ với retry button
> 4. Nút submit disabled khi form invalid + hiện lý do (VD: "Chọn ít nhất 1 chương trước khi tạo đề")
> 5. Toast success khi thao tác thành công (không dùng alert() vì xấu)
>
> Dùng component tự viết đơn giản, không cần thư viện toast.

**Kết quả kỳ vọng**: UI mượt, ít click hụt, ít alert() nhức mắt.

---

## Phase 3 — Test end-to-end với đề thật (1-2 giờ)

### Prompt 3.1 — Chuẩn bị test data

TỰ LÀM: Chuẩn bị 3 file docx thật của bạn:
- **file_a.docx**: đề trắc nghiệm 20 câu (đã có sẵn A/B/C/D)
- **file_b.docx**: đề trộn 10 trắc nghiệm + 5 trả lời ngắn + 3 tự luận
- **file_c.docx**: đề có đáp án ở cuối

Đặt vào `/tmp/`.

### Prompt 3.2 — Full flow

TỰ LÀM: 
1. Login → tạo 2 chương: "Toán 12 - Chương 1", "Toán 12 - Chương 2"
2. Upload file_a vào chương 1
3. Upload file_b vào chương 2 (khai báo cấu trúc đúng: câu 1-10 trắc nghiệm, 11-15 ngắn, 16-18 tự luận)
4. Upload file_c vào chương 1 (khai báo cấu trúc)
5. Vào `/chapters` xem — kiểm tra options + answer có đúng không
6. Sửa 1-2 câu bị AI phân loại sai
7. Vào `/exam/new` chọn cả 2 chương, tổng 20 câu, phân bổ (biết=7, hiểu=8, vận_dụng=5), (TN=15, ngắn=5)
8. Xem preview, đổi 1 câu không ưng, đặt tên đề, export cả 2 variant
9. Vào `/exams`, verify có đề vừa tạo, export lại 1 lần nữa

### Prompt 3.3 — Fix edge cases phát hiện

> Trong quá trình test tôi thấy [bug cụ thể]. Ví dụ:
> - Có câu bị cắt sai (dính 2 câu làm 1)
> - Có câu options bị thiếu 1 đáp án
> - Có câu content dài quá bị cắt trong export
>
> Debug và sửa. Với mỗi bug: xác định thuộc SP nào, sửa ở đúng file đó, viết test case nếu có thể tái hiện.

---

## Phase 4 — Deploy Vercel (30 phút)

### Prompt 4.1 — Chuẩn bị GitHub repo

> Chuẩn bị commit lên GitHub:
> 1. Verify `.gitignore` có `.env.local`, `.env`, `node_modules`, `.next`
> 2. Chạy `git init` nếu chưa có
> 3. `git status` — check không có file secret nào bị track
> 4. Nếu clean, `git add . && git commit -m "Initial working MVP"`
> 5. Hướng dẫn tôi tạo repo trên GitHub và `git remote add origin ... && git push -u origin main`

**Verify**: 
```bash
git log --oneline    # phải thấy commit
grep -r "SUPABASE_SERVICE" --include="*.ts" --include="*.tsx" | grep -v ".env"
# ↑ không được có key hardcode trong code
```

---

### Prompt 4.2 — Deploy Vercel

TỰ LÀM:
1. Vào https://vercel.com → New Project → Import repo GitHub
2. Framework preset: Next.js (auto-detect)
3. Environment variables — copy y hệt từ `.env.local`, thêm từng biến:
   - `APP_PASSWORD`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`
4. Deploy → đợi ~2 phút

### Prompt 4.3 — Verify prod

TỰ LÀM: 
- Truy cập URL Vercel (dạng `xxx.vercel.app`)
- Login → kiểm tra các chương và câu hỏi đã có (vì cùng Supabase DB)
- Upload thử 1 file mới → verify chạy được

**Nếu fail**:

### Prompt 4.4 — Debug prod

> Prod bị lỗi [paste error từ Vercel logs]. Kiểm tra:
> 1. Env variables đã set đủ chưa (vào Vercel Project Settings > Environment Variables)
> 2. Function timeout — nếu upload lỗi timeout, kiểm tra file size + số câu
> 3. Middleware có block route nào không đáng không
> 4. CORS / cookie sameSite — nếu login không giữ session, check secure flag

---

## Phase 5 — Optional: Phase 2 features (2-3 giờ mỗi feature)

### Prompt 5.1 — PDF support qua Gemini

> Bổ sung parse PDF theo pattern trong `references/prompt_library.md` prompt #2:
>
> 1. Tạo `lib/parse/pdf.ts` — hàm `parsePdfViaGemini(buffer)` gọi Gemini native với PDF, trả về text extracted (không segment)
> 2. Update `app/api/upload/route.ts`: nếu file.name.endsWith('.pdf') → gọi parsePdfViaGemini thay vì parseDocx
> 3. Update `app/upload/page.tsx`: accept="\.docx,.pdf"
> 4. Test với file PDF thật
>
> Chú ý: PDF có 2 cột hoặc công thức toán, output từ Gemini có thể lộn xộn — chấp nhận trade-off này.

---

### Prompt 5.2 — Export PDF

> Bổ sung export PDF:
> 1. Tạo `lib/export/pdf.tsx` với `@react-pdf/renderer` — mirror API của `lib/export/docx.ts`
> 2. Update `app/api/exam/export/route.ts` bỏ điều kiện `format === 'pdf'` → gọi generateExamPdf
> 3. Add nút "Export PDF" trong UI `/exam/new` và `/exams`
> 4. Test file PDF mở được ở Adobe Reader, không lỗi font tiếng Việt
>
> Cảnh báo: @react-pdf/renderer nặng, chỉ import trong route API, không import trong client component.

---

### Prompt 5.3 — Filter theo tag khi tạo đề

> Nâng cấp `/exam/new` để user filter thêm theo tag:
> 1. Thêm input tag ở phần config (multi-tag, autocomplete từ endpoint /api/tags)
> 2. Đưa `tags` vào ExamConfig gửi tới /api/exam/preview
> 3. SP5 sample đã hỗ trợ filter theo tag (xem `lib/sample/sample.ts`) — chỉ cần verify pass tags vào
> 4. Nếu tags rỗng → không filter (behavior mặc định)

---

## Phase 6 — Bảo trì (làm khi cần)

### Prompt 6.1 — Backup DB → JSON

> Tạo endpoint `/api/backup` (POST, có auth):
> 1. Export toàn bộ 4 bảng ra JSON: {chapters:[], source_files:[], questions:[], exams:[]}
> 2. Trả về file .json download
> 3. Thêm nút "Backup" trong nav header

Ngược lại `/api/restore` upload JSON → truncate + insert. Chỉ làm khi bạn cần chuyển máy.

---

### Prompt 6.2 — Dashboard thống kê

> Tạo trang `/dashboard`:
> 1. Card: tổng số chương, tổng câu, tổng đề đã tạo
> 2. Bar chart phân bổ câu theo difficulty (biết/hiểu/vận_dụng/unclassified) — dùng SVG thô, không cần chart library
> 3. Bảng: mỗi chương có bao nhiêu câu, phân bổ mức độ
> 4. Chart câu chưa phân loại theo tuần (giúp thấy khi nào cần sửa)

---

## Nguyên tắc dùng Claude Code hiệu quả

1. **Ngắn gọn nhưng cụ thể** — Claude Code làm tốt khi biết rõ file nào cần sửa. Prompt "sửa upload logic" quá mơ hồ; "sửa `app/api/upload/route.ts` để handle case docx > 30 câu" mới cụ thể.

2. **Đưa acceptance criteria** — cuối mỗi prompt nói rõ "làm xong verify bằng cách chạy X và thấy Y". Claude Code sẽ tự chạy và tự verify.

3. **Chấp nhận Claude tự chạy lệnh** — cho phép chạy `npm`, `git`, `curl`, đọc log, sửa. Nhanh hơn bạn chạy tay rồi paste lại.

4. **Khi bug nhiều, chia nhỏ** — không paste 10 bug 1 lúc. Sửa từng cái, test xong mới chuyển cái tiếp.

5. **Đọc SKILL.md thường xuyên** — mỗi 5-10 prompt, nhắc Claude "re-read SKILL.md self-check". Tránh drift khỏi nguyên tắc.

6. **Không cho Claude chạy `rm -rf` hoặc destructive commands** — luôn xác nhận trước.

7. **Commit thường xuyên** — mỗi phase xong commit 1 lần với message rõ ràng. Dễ revert khi Claude làm hỏng.

---

## Ước lượng thời gian tổng

| Phase | Thời gian | Có bắt buộc? |
|---|---|---|
| 0 — Setup | 30 phút | ✓ |
| 1 — Verify skeleton | 1-2 giờ | ✓ |
| 2 — Điền phần thiếu | 3-5 giờ | ✓ để MVP dùng được |
| 3 — Test end-to-end | 1-2 giờ | ✓ |
| 4 — Deploy | 30 phút | ✓ nếu muốn public |
| 5 — Phase 2 features | 2-3 giờ/feature | Optional |
| 6 — Bảo trì | Không định | Khi cần |

**Path tối thiểu để có sản phẩm dùng được cá nhân: Phase 0 → 1 → 2.1 → 2.3 → 3 → 4** (~6 giờ).

Chúc build vui.
