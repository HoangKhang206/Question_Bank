# Ngân Hàng Câu Hỏi & Trộn Đề

Web app cá nhân: upload đề Word/PDF → AI phân loại độ khó → trộn ra đề ôn tập mới → export Word/PDF.

Xem [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) cho spec đầy đủ và [`docs/SKILL.md`](docs/SKILL.md) cho context AI.

## Setup

### 1. Cài dependencies
```bash
npm install
```

### 2. Tạo project Supabase
- Vào https://supabase.com → New Project
- Copy URL và `service_role` key vào `.env.local` (xem `.env.example`)
- Vào SQL Editor → paste toàn bộ `db/schema.sql` → Run
- Vào Storage → tạo bucket `sources` (Private)

### 3. Lấy Gemini API key
- Vào https://aistudio.google.com/apikey → Create API key
- Copy vào `.env.local`

### 4. Sinh JWT secret + đặt password
```bash
openssl rand -base64 48   # copy output vào JWT_SECRET
```
Đặt `APP_PASSWORD` bất kỳ (dài, phức tạp).

### 5. Chạy dev
```bash
npm run dev
```

Truy cập http://localhost:3000 → sẽ redirect sang `/login`.

## Deploy Vercel

1. Push repo lên GitHub
2. Vào https://vercel.com → New Project → import repo
3. Add env variables trong Project Settings (giống `.env.example`)
4. Deploy

## Cấu trúc

```
question-bank/
├── app/                 Next.js App Router (pages + API routes)
├── lib/                 Business logic tách theo 6 subproblem (SP1-SP6)
│   ├── parse/           SP1: Document parsing
│   ├── gemini/          SP3: AI classification (có fallback wrapper)
│   ├── dedup/           SP4: Hash + normalize
│   ├── sample/          SP5: Constrained random (seeded)
│   ├── export/          SP6: Word/PDF generation
│   ├── supabase/        DB client
│   └── types.ts         Shared types
├── db/schema.sql        Migration Postgres (paste vào Supabase)
├── middleware.ts        Auth check (JWT cookie)
└── docs/                PROJECT_SPEC.md + SKILL.md
```

## Roadmap

- [x] Phase 1: Upload docx, phân loại AI, tạo đề, export Word (xem PROJECT_SPEC §11)
- [ ] Phase 2: PDF support, export PDF, filter theo tag
- [ ] Phase 3: Shuffle đáp án, nhiều mã đề, JSON import/export
