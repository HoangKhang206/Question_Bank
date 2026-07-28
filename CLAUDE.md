# Claude Code Context

Bạn đang làm việc trong dự án **Question Bank & Exam Mixer**. Đọc file này trước khi bắt đầu bất kỳ task nào.

## Bước 1 — Đọc context bắt buộc

Đọc theo thứ tự:
1. `SKILL.md` — snapshot dự án, 6 subproblems (SP1-SP6), routing logic, pitfalls, self-check
2. `references/PROJECT_SPEC.md` — spec đầy đủ, chỉ đọc phần liên quan đến task hiện tại

## Bước 2 — Khi user giao task

- Xác định task thuộc SP nào (SP1-SP6) hay UI/infra.
- Load thêm 1 reference nếu cần:
  - Prompt Gemini → `references/prompt_library.md`
  - Free tier limit → `references/tech_constraints.md`
- Đọc code liên quan trước khi sửa (`lib/{module}/`, `app/api/{route}/route.ts`).

## Bước 3 — Trước khi commit

Chạy self-check ở cuối `SKILL.md`. Bất kỳ ô nào không đạt → sửa trước.

## Nguyên tắc bất di bất dịch

1. **Mọi AI call phải wrap try/catch + fallback `unclassified`** — không crash upload.
2. **Dedup ở DB level** (unique constraint trên `content_hash`), không check-then-insert.
3. **SP5 sample + SP6 export phải deterministic** — cùng input → cùng output.
4. **Upload phải idempotent** — hash file trước khi lưu.
5. **Non-goals ở SKILL.md tuyệt đối không làm** — nếu user request, hỏi lại.

## Khi tạo/sửa file

- Comment đầu file: nêu SP + Input + Output + Constraint (theo mẫu code có sẵn).
- TypeScript strict mode. Import type qua `import type`.
- Route Handler: `runtime = 'nodejs'`, `maxDuration = 10`, wrap try/catch, log lỗi.
- React: Server Component fetch mặc định, `'use client'` chỉ khi cần state/event.

## Tài liệu hướng dẫn build

Nếu bạn đang cần biết **bước tiếp theo** để hoàn thiện MVP, xem `BUILD_PROMPTS.md` — kịch bản prompt tuần tự từ setup đến deploy.
