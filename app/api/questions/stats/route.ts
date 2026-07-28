// GET /api/questions/stats?chapter_ids=id1,id2,...
// Trả về số câu theo difficulty và type cho các chương đã chọn.
// Dùng để hiện hint "có X câu" trên form tạo đề.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get('chapter_ids')?.split(',').filter(Boolean) ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ total: 0, byDifficulty: {}, byType: {} });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('questions')
    .select('difficulty, type')
    .in('chapter_id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byDifficulty: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const q of data ?? []) {
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1;
    byType[q.type] = (byType[q.type] ?? 0) + 1;
  }

  return NextResponse.json({ total: (data ?? []).length, byDifficulty, byType });
}
