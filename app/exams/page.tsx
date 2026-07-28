export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import ExamList from './exam-list';
import type { Exam } from '@/lib/types';

export default async function ExamsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('exams')
    .select('*')
    .order('created_at', { ascending: false });
  const exams = (data as Exam[]) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Lịch sử đề</h1>
      <ExamList exams={exams} />
    </div>
  );
}
