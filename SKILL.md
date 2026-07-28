---
name: question-bank
description: "Use this skill when working on the Question Bank & Exam Mixer project — a Next.js/Supabase/Gemini web app for personal use to collect exam questions from uploaded Word/PDF files, classify cognitive difficulty (biết/hiểu/vận dụng) via AI, and generate new mixed exams. Triggers: mentions of 'ngân hàng câu hỏi', 'trộn đề', 'exam mixer', 'question bank', or requests to (1) write TypeScript/Next.js/Supabase code for the six subproblems SP1-SP6 (parse, segment, classify, dedup, sample, generate); (2) design UI pages for chapter management, exam creation, or exam history; (3) write Gemini prompts for Vietnamese question classification; (4) update PROJECT_SPEC.md decisions. Do NOT use for unrelated Next.js questions."
version: 1.0.0
---

# Question Bank & Exam Mixer — Skill

File always-on context. Load references/ theo bảng routing bên dưới khi cần.

## Project Snapshot

```
=== QUESTION BANK PROJECT CONTEXT ===
App      : Web app cá nhân (self-hosted Vercel Hobby)
Purpose  : Upload đề Word/PDF → AI phân loại độ khó → trộn đề mới → export
Stack    : Next.js 14 App Router + TypeScript
DB       : Supabase Postgres (500MB free) + Storage (1GB free)
AI       : Gemini 2.5 Flash (1500 req/ngày free)
Export   : docx (npm) + @react-pdf/renderer (Phase 2)
Auth     : Password đơn giản qua env + JWT cookie
Cost     : 0 VND/tháng

Hard constraints:
- Vercel serverless timeout ≤ 10s/request
- Gemini rate limit ≤ 15 req/phút → p-limit(3)
- Mọi AI call PHẢI wrap try/catch, fallback "unclassified"
- Dedup ở DB level (unique index), KHÔNG check-then-insert
- SP5 sample + export PHẢI deterministic

Data model (4 bảng):
- chapters       : id, name, subject, description
- source_files   : id, chapter_id, file_hash UNIQUE, storage_path, structure JSONB, status
- questions      : id, chapter_id, content, type, difficulty, options JSONB, answer,
                   tags TEXT[], content_hash UNIQUE
- exams          : id, name, config JSONB, question_ids UUID[]
=== END CONTEXT ===
```

## 6 Subproblems (chia theo computational nature, KHÔNG theo UI)

| # | Module | File code | Threshold |
|---|---|---|---|
| SP1 | Document Parsing | `lib/parse/docx.ts` | mammoth cho docx; Gemini native cho PDF (Phase 2) |
| SP2 | Segmentation | `lib/parse/segment.ts` | Regex marker, deterministic, ≤500ms |
| SP3 | Cognitive Classification | `lib/gemini/classify.ts` | Batch 8 câu, fallback `unclassified` |
| SP4 | Content Dedup | `lib/dedup/hash.ts` | SHA-256 sau normalize, DB unique index |
| SP5 | Constrained Sampling | `lib/sample/sample.ts` | Mulberry32 seeded, 100% reproducible |
| SP6 | Document Generation | `lib/export/docx.ts` | ≤3s cho 30 câu |

## Routing — Load reference nào cho câu hỏi nào

| Nếu user hỏi về... | Load file |
|---|---|
| Chi tiết bài toán, phân rã CT, workflow đầy đủ | `references/PROJECT_SPEC.md` |
| Prompt Gemini phân loại / trích PDF | `references/prompt_library.md` |
| Free tier limits, cost, workaround | `references/tech_constraints.md` |
| Context ngắn paste sang LLM khác | `assets/master_context.txt` |
| Ví dụ ExamConfig để test SP5 | `assets/example_config.json` |

Quy tắc: **chỉ load 1 reference cần thiết** để tiết kiệm token. Load nhiều file chỉ khi câu hỏi giao thoa.

## 6 Pitfalls chặn ngay (theo slide LN02 CT framework)

1. **Misframing** — mô tả app & UI thay vì bài toán tính toán → quy về `Input / Output / Operators / Evaluation / Constraints`.
2. **Decomposition theo màn hình** — sai. SP chia theo *computational nature*: parse, segment, classify, dedup, sample, generate.
3. **Non-measurable** — "nhanh", "chuẩn" → định lượng (ms, %, req/phút, ≥95%).
4. **Silent AI failure** — Gemini fail mà crash upload → luôn wrap try/catch, fallback `unclassified`.
5. **Race condition dedup** — check-then-insert sai → dùng DB unique index trên `content_hash`.
6. **Scope creep** — request rơi vào Non-goals (OCR, LaTeX, multi-user, LMS) → confirm với Owner trước.

## Cấu trúc thư mục

```
question-bank/
├── SKILL.md                          ← file này (always-on)
├── README.md                         ← setup 5 bước
├── PROJECT_SPEC.md (tuỳ chọn)        ← copy nếu cần đọc thẳng ở root
│
├── references/                       ← lazy-load
│   ├── PROJECT_SPEC.md               ← spec đầy đủ, CT framework
│   ├── prompt_library.md             ← Gemini prompts
│   └── tech_constraints.md           ← free tier limits chi tiết
│
├── assets/                           ← paste-nhanh
│   ├── master_context.txt            ← context ngắn cho LLM khác
│   └── example_config.json           ← ví dụ ExamConfig
│
├── package.json, tsconfig.json,      ← Next.js config
│   next.config.js, tailwind.config.ts,
│   postcss.config.js, .gitignore,
│   .env.example, middleware.ts
│
├── app/                              ← Next.js App Router
│   ├── layout.tsx, globals.css, page.tsx
│   ├── login/, chapters/, upload/, exam/new/, exams/
│   └── api/
│       ├── auth/{login,logout}/route.ts
│       ├── upload/route.ts           ← SP1→SP4 pipeline
│       ├── chapters/, questions/[id]/, exams/
│       └── exam/{preview,save,export}/route.ts
│
├── lib/                              ← Logic theo SP
│   ├── types.ts
│   ├── supabase/server.ts
│   ├── parse/{docx,segment}.ts       ← SP1, SP2
│   ├── gemini/{client,classify}.ts   ← SP3
│   ├── dedup/hash.ts                 ← SP4
│   ├── sample/{rng,sample}.ts        ← SP5
│   └── export/docx.ts                ← SP6
│
└── db/schema.sql                     ← migration Postgres
```

## Output style

- **Ngôn ngữ**: Tiếng Việt cho giải thích, English cho thuật ngữ kỹ thuật & code.
- **Code**: TypeScript strict, ES modules, Next.js 14 convention. Comment đầu file nêu SP + Input/Output/Constraint.
- **Không throw** ở nhánh AI — luôn fallback + log.
- **Nêu trade-off** khi có nhiều lựa chọn.

## Self-check trước khi trả lời

- [ ] Task này thuộc SP nào (SP1-6) hay UI/infra?
- [ ] Có vượt Vercel timeout 10s không?
- [ ] Có vượt Gemini rate limit không?
- [ ] AI call có wrapper try/catch + fallback `unclassified` chưa?
- [ ] Có escape hatch cho user sửa nếu AI sai không?
- [ ] SP5 & export có deterministic không?
- [ ] Upload có idempotent (hash file) không?
- [ ] Có rơi vào Non-goals (OCR, LaTeX, multi-user, LMS) không?

Nếu bất kỳ ô nào không đạt → sửa trước khi trả lời user.
