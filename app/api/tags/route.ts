// GET /api/tags?chapter_id=xxx — distinct tags trong chương
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chapterId = searchParams.get('chapter_id');
  if (!chapterId) return NextResponse.json({ error: 'Thiếu chapter_id' }, { status: 400 });

  const sb = supabaseAdmin();

  // unnest mảng tags → distinct
  const { data, error } = await sb.rpc('get_distinct_tags', { p_chapter_id: chapterId });

  if (error) {
    // Fallback: nếu RPC chưa tạo, query thô
    const { data: rows, error: e2 } = await sb
      .from('questions')
      .select('tags')
      .eq('chapter_id', chapterId);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    const tagSet = new Set<string>();
    for (const row of rows ?? []) {
      for (const t of row.tags ?? []) tagSet.add(t);
    }
    return NextResponse.json({ tags: [...tagSet].sort() });
  }

  return NextResponse.json({ tags: (data as string[]) ?? [] });
}
