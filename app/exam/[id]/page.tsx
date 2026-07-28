// SP6 — View saved exam: load exam + ordered questions by question_ids
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { Question } from '@/lib/types';
import Link from 'next/link';
import QuestionCard from '@/components/question-card';

export default async function ExamViewPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('*')
    .eq('id', params.id)
    .single();

  if (examErr || !exam) redirect('/exams');

  const ids: string[] = exam.question_ids ?? [];
  let ordered: Question[] = [];

  if (ids.length > 0) {
    const { data: questions } = await sb.from('questions').select('*').in('id', ids);
    const byId: Record<string, Question> = {};
    (questions ?? []).forEach((q) => { byId[q.id] = q as Question; });
    ordered = ids.map((id) => byId[id]).filter(Boolean) as Question[];
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{exam.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(exam.created_at).toLocaleString('vi-VN')} · {ids.length} câu
          </p>
        </div>
        <Link href="/exams" className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50">
          ← Quay lại
        </Link>
      </div>

      {ordered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">Không tìm thấy câu hỏi.</p>
      ) : (
        <ol className="space-y-4">
          {ordered.map((q, idx) => (
            <QuestionCard key={q.id} q={q} index={idx} />
          ))}
        </ol>
      )}
    </div>
  );
}
