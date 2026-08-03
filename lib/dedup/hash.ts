// SP4: Content Deduplication
// Input : text câu hỏi
// Output: content_hash (SHA-256) sau normalize
// Constraint: 100% catch exact-match; O(1) lookup nhờ Postgres unique index.

import { createHash } from 'crypto';

/**
 * Normalize text để dedup:
 *   1. Lowercase
 *   2. Bỏ dấu tiếng Việt (á→a, ơ→o, ...)
 *   3. Bỏ số thứ tự đầu câu (Câu 1., 1), etc.)
 *   4. Collapse whitespace
 */
export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')            // xoá dấu combining
    .replace(/đ/g, 'd')                          // xử lý đ riêng (không có trong NFD)
    .replace(/^(?:cau\s+)?\d+\s*[.):]?\s*/i, '') // bỏ marker đầu (sau normalize diacritics)
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeContentHash(content: string): string {
  const normalized = normalizeForHash(content);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Hash file để dedup upload (feature #14).
 */
export function computeFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
