// Chạy SP5 sampling, trả về danh sách câu để preview UI.
// KHÔNG lưu exams — chỉ save khi user bấm "Lưu & Export" (feature #6).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sampleQuestions } from '@/lib/sample/sample';
import type { ExamConfig, Question } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const config = (await req.json()) as ExamConfig;
    const sb = supabaseAdmin();

    if (!config.chapter_ids || config.chapter_ids.length === 0) {
      return NextResponse.json({ error: 'Chưa chọn chương' }, { status: 400 });
    }

    const { data: bank, error } = await sb
      .from('questions')
      .select('*')
      .in('chapter_id', config.chapter_ids);

    if (error) throw new Error(error.message);
    if (!bank || bank.length === 0) {
      return NextResponse.json({ error: 'Bank rỗng' }, { status: 400 });
    }

    const report = sampleQuestions(bank as Question[], config);

    const selectedMap = new Map((bank as Question[]).map((q) => [q.id, q]));
    const questions = report.question_ids.map((id) => selectedMap.get(id)!);

    return NextResponse.json({
      questions,
      missing: report.missing,
      config
    });
  } catch (err) {
    console.error('[PREVIEW] fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
