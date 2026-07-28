import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const deleteQuestions = searchParams.get('delete_questions') === 'true';

  if (deleteQuestions) {
    // Lấy question_ids trước khi xoá exam
    const { data: exam } = await sb
      .from('exams')
      .select('question_ids')
      .eq('id', params.id)
      .single();

    if (exam?.question_ids?.length) {
      const { error: qErr } = await sb
        .from('questions')
        .delete()
        .in('id', exam.question_ids);
      if (qErr) console.error('[DELETE exam] xoá câu thất bại:', qErr.message);
    }
  }

  const { error } = await sb.from('exams').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
