import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// GET  /api/questions?chapter_id=...&difficulty=...&type=...&tag=...
// List câu hỏi theo filter.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sb = supabaseAdmin();

  let q = sb.from('questions').select('*').order('question_number');

  const chapterId = searchParams.get('chapter_id');
  if (chapterId) q = q.eq('chapter_id', chapterId);

  const difficulty = searchParams.get('difficulty');
  if (difficulty) q = q.eq('difficulty', difficulty);

  const type = searchParams.get('type');
  if (type) q = q.eq('type', type);

  const tag = searchParams.get('tag');
  if (tag) q = q.contains('tags', [tag]);

  const sourceFileId = searchParams.get('source_file_id');
  if (sourceFileId) q = q.eq('source_file_id', sourceFileId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data });
}
