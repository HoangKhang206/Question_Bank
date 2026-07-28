// GET /api/source-files?chapter_id=xxx — list source files của 1 chương
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

  // Bước 1: lấy danh sách file
  const { data: files, error: filesError } = await sb
    .from('source_files')
    .select('id, filename, storage_path, status, created_at')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });

  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 });
  if (!files || files.length === 0) {
    return NextResponse.json({ source_files: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Bước 2: đếm câu hỏi chỉ cho các file vừa tìm được (tránh giới hạn 1000 rows của PostgREST)
  const fileIds = files.map((f) => f.id);
  const { data: questionRows } = await sb
    .from('questions')
    .select('source_file_id')
    .in('source_file_id', fileIds);

  const countMap = new Map<string, number>();
  for (const q of (questionRows ?? [])) {
    const id = q.source_file_id as string;
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  const data = files.map((f) => ({
    ...f,
    questions: [{ count: countMap.get(f.id) ?? 0 }],
  }));

  console.log(`[source-files] chapter_id=${chapterId} → ${data.length} rows`, data.map((f) => f.id));
  return NextResponse.json({ source_files: data }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
