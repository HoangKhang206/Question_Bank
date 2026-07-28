# Tech Constraints — Free Tier Reference

Chi tiết giới hạn từng dịch vụ + workaround. Tra cứu khi thiết kế flow mới hoặc gặp lỗi limit.

---

## Vercel Hobby (Free)

| Giới hạn | Con số | Chạm thì làm gì |
|---|---|---|
| Serverless timeout | **10s** | Chunk file, batch AI, chia request từ frontend |
| Function memory | 1024 MB | Đủ cho parse docx <50MB |
| Bandwidth | 100 GB/tháng | Không lo với cá nhân |
| Build time | 45 phút/tháng | Đủ cho <20 deploy/tháng |
| File upload body | 4.5 MB (default) | Đã tăng qua `next.config.js` → 50MB |
| Log retention | 1 giờ | Copy log về nếu cần debug lâu |

**Setup trong project (đã có):**
```js
// next.config.js
module.exports = {
  experimental: { serverActions: { bodySizeLimit: '50mb' } }
};

// mọi route.ts nặng
export const runtime = 'nodejs';  // KHÔNG dùng 'edge' — mammoth cần Node APIs
export const maxDuration = 10;
```

**Cảnh báo:**
- `runtime = 'edge'` KHÔNG chạy được `mammoth`, `crypto`, `docx` npm — luôn dùng `'nodejs'`.
- Nếu cần chạy dài hơn 10s → Vercel Pro ($20/tháng, timeout 60s). Nhưng project này thiết kế để không cần.

---

## Supabase Free Tier

| Giới hạn | Con số | Chạm thì làm gì |
|---|---|---|
| Database size | **500 MB** | Nén JSONB, xoá `explanation` cũ không dùng, purge log |
| Storage size | **1 GB** | Feature #14 (file hash) tránh trùng file |
| Storage upload/file | **50 MB** | Đề Word thực tế <5MB, không lo |
| Bandwidth egress | 5 GB/tháng | Không lo với cá nhân |
| Concurrent connections | 60 | Dư sức |
| API requests | KHÔNG limit | ✓ |
| Project pause | Sau 1 tuần không dùng | Access lại là active |

**Ước lượng dung lượng thực tế cho cá nhân:**
- 1000 câu × ~2KB/câu (content + options) = 2 MB
- 50 file × ~2MB/file = 100 MB storage
- 100 đề × ~5KB/exam = 500 KB
- **Tổng: ~5 MB DB + ~100 MB Storage** → còn dư 99% quota

**SQL purge tiết kiệm khi cần:**
```sql
-- Xoá source_files failed cũ >30 ngày
DELETE FROM source_files
WHERE status = 'failed' AND created_at < now() - interval '30 days';

-- Xoá exams nháp không có tên
DELETE FROM exams WHERE name IS NULL OR name = '';
```

---

## Google Gemini API (Free Tier)

| Giới hạn model 2.5 Flash | Con số |
|---|---|
| Request per minute (RPM) | **15** |
| Request per day (RPD) | **1500** |
| Tokens per minute (TPM) | 1,000,000 |
| Context window | 1M tokens |

**Ước lượng request thực tế cho upload:**

| Kịch bản | Số câu | Batch size | Request | Vượt limit? |
|---|---|---|---|---|
| File nhỏ | 20 câu | 8 | 3 | Không |
| File trung bình | 50 câu | 8 | 7 | Không |
| File lớn | 100 câu | 8 | 13 | Sát ngưỡng RPM=15, phải throttle |
| Batch upload 5 file lớn | 500 câu | 8 | 63 | Cần đợi (63/15 = 5 phút) |

**Workaround khi chạm RPM:** đã setup `p-limit(3)` trong `lib/gemini/classify.ts` để tự throttle. Với file >100 câu, có 3 lựa chọn:
1. Tăng BATCH_SIZE lên 15 (giảm accuracy nhẹ)
2. Chia upload thành nhiều lần
3. Chuyển sang polling job (Phase 3)

**Không được làm với Gemini:**
- KHÔNG gửi tên học sinh, PII, thông tin nhạy cảm.
- KHÔNG dùng cho content moderation ở scale cao.
- KHÔNG rely vào output cho quyết định pháp lý/tài chính.

---

## GitHub Free

| Giới hạn | Con số |
|---|---|
| Private repo | Unlimited |
| Actions minutes | 2000/tháng |
| Storage LFS | 1 GB |

Deploy qua Vercel auto-connect → không cần Actions tự viết.

---

## Chi phí kỳ vọng

| Scale | DB | Storage | Gemini req/tháng | Cost/tháng |
|---|---|---|---|---|
| **Cá nhân (<50 file/tháng)** | 5 MB | 100 MB | ~800 | **0 VND** |
| Chia sẻ 3-5 người | 20 MB | 500 MB | ~5000 | 0 VND nhưng sát ngưỡng Gemini |
| Nhóm 20 người | 100 MB | 2 GB | ~30000 | ~$5 Gemini + Supabase Pro $25 |

Project designed cho row 1. Rows 2-3 KHÔNG PHẢI mục tiêu — nếu cần thì fork.

---

## Runtime warnings — biết trước để tránh

1. **`crypto` không có trong Edge Runtime.** Route có SP4 dedup PHẢI set `runtime = 'nodejs'`.
2. **`mammoth` cần Node.** Không parse docx được ở Edge.
3. **Supabase client tạo mới mỗi request server-side.** Không cache module-level (memory leak trong serverless).
4. **`@react-pdf/renderer` build size lớn** (~2MB gzipped). Chỉ import trong route `/api/exam/export`, KHÔNG import ở client.
5. **Vercel serverless cold start ~1s.** Endpoint đầu tiên trong ngày sẽ chậm — chấp nhận.
6. **JWT secret ≥32 ký tự.** Nếu ngắn hơn → `jwtVerify` throw silent.

---

## Migration paths nếu vượt free tier

Nếu một ngày dự án vượt scale cá nhân:

- **DB vượt 500MB** → Supabase Pro $25/tháng (8GB) hoặc self-host Postgres
- **Gemini vượt RPD** → Paid tier ($0.075/1M input token) — vẫn rẻ
- **Vercel timeout không đủ** → Pro $20/tháng (60s), hoặc pipeline dài về Supabase Edge Function
- **Storage vượt 1GB** → Supabase Pro (100GB) hoặc chuyển file gốc sang R2/S3

**KHÔNG** đầu tư sớm. Đợi thực sự chạm giới hạn.
