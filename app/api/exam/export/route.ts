// Export đề ra Word (Phase 1) / PDF (Phase 2).
// Nhận exam_id + format + variant. Trả về file buffer.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateExamDocx } from '@/lib/export/docx';
import type { Question } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const { exam_id, format, variant } = await req.json();

    if (!['docx', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Format sai' }, { status: 400 });
    }
    if (!['blank', 'with_answer'].includes(variant)) {
      return NextResponse.json({ error: 'Variant sai' }, { status: 400 });
    }
    if (format === 'pdf') {
      return NextResponse.json(
        { error: 'PDF chưa hỗ trợ (Phase 2)' },
        { status: 501 }
      );
    }

    const sb = supabaseAdmin();
    const { data: exam } = await sb
      .from('exams')
      .select('*')
      .eq('id', exam_id)
      .single();
    if (!exam) {
      return NextResponse.json({ error: 'Exam không tồn tại' }, { status: 404 });
    }

    const { data: questions } = await sb
      .from('questions')
      .select('*')
      .in('id', exam.question_ids);
    if (!questions) throw new Error('Không load được câu hỏi');

    // Reorder theo thứ tự trong exam.question_ids
    const qMap = new Map((questions as Question[]).map((q) => [q.id, q]));
    const ordered = (exam.question_ids as string[])
      .map((id) => qMap.get(id))
      .filter((q): q is Question => q !== undefined);

    const buffer = await generateExamDocx(exam.name, ordered, variant, exam.config?.meta);
    const mime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(
          exam.name
        )}_${variant}.docx"`
      }
    });
  } catch (err) {
    console.error('[EXPORT] fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
