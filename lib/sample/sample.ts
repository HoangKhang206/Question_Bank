// SP5: Constrained Random Sampling — type-first, difficulty best-effort
// Input : bank câu hỏi + ExamConfig
// Output: question_ids[] có thứ tự
// Constraint: Deterministic với cùng (bank, config, seed). ≤ 1s cho bank 1000 câu.
//
// Thuật toán (2 pass):
//   Pass 1 — Với mỗi dạng câu t, lấy đúng by_type[t] câu.
//             Trong đó ưu tiên difficulty theo tỉ lệ by_difficulty (best-effort).
//   Pass 2 — Nếu thiếu difficulty ở pass 1, bù bằng câu cùng dạng bất kỳ difficulty.
//   → Luôn đảm bảo đúng số câu từng dạng; difficulty là xấp xỉ, không cứng.

import { mulberry32, shuffle } from './rng';
import type { Question, ExamConfig, QuestionType } from '@/lib/types';

export interface SampleReport {
  question_ids: string[];
  missing: Array<{
    type: QuestionType;
    needed: number;
    available: number;
  }>;
}

export function sampleQuestions(
  bank: Question[],
  config: ExamConfig
): SampleReport {
  const rng = mulberry32(config.random_seed);
  const chapterSet = new Set(config.chapter_ids);

  let pool = bank.filter((q) => chapterSet.has(q.chapter_id));
  if (config.tags && config.tags.length > 0) {
    const tagSet = new Set(config.tags);
    pool = pool.filter((q) => q.tags.some((t) => tagSet.has(t)));
  }

  const selected: Question[] = [];
  const missing: SampleReport['missing'] = [];
  const usedIds = new Set<string>();

  const types = Object.keys(config.by_type) as QuestionType[];
  const difficulties = Object.keys(config.by_difficulty) as (keyof typeof config.by_difficulty)[];
  const totalDiff = difficulties.reduce((s, d) => s + (config.by_difficulty[d] ?? 0), 0);

  for (const t of types) {
    const needed = config.by_type[t] ?? 0;
    if (needed === 0) continue;

    // Lấy toàn bộ câu dạng t chưa dùng, shuffle ngay để đảm bảo random trong mỗi nhóm
    const typeCandidates = shuffle(
      pool.filter((q) => q.type === t && !usedIds.has(q.id)),
      rng
    );

    const pickedForType: Question[] = [];

    // Pass 1: ưu tiên theo difficulty ratio
    if (totalDiff > 0) {
      for (const d of difficulties) {
        const ratio = (config.by_difficulty[d] ?? 0) / totalDiff;
        const quota = Math.round(needed * ratio);
        if (quota === 0) continue;

        // Candidates theo difficulty này (thứ tự đã shuffle từ typeCandidates)
        const diffCandidates = typeCandidates.filter((q) => q.difficulty === d);
        pickedForType.push(...diffCandidates.slice(0, quota));
      }
    }

    // Pass 2: bù thiếu từ bất kỳ difficulty nào còn lại (cùng dạng câu)
    const shortfall = needed - pickedForType.length;
    if (shortfall > 0) {
      const pickedIds = new Set(pickedForType.map((q) => q.id));
      const fillCandidates = typeCandidates.filter((q) => !pickedIds.has(q.id));
      pickedForType.push(...fillCandidates.slice(0, shortfall));
    }

    // Báo thiếu nếu bank không đủ câu của dạng này
    if (pickedForType.length < needed) {
      missing.push({ type: t, needed, available: typeCandidates.length });
    }

    for (const q of pickedForType) usedIds.add(q.id);
    selected.push(...pickedForType);
  }

  return {
    question_ids: shuffle(selected, rng).map((q) => q.id),
    missing
  };
}
