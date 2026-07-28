// SP1/SP2 — View questions from a single uploaded source file
export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import type { Question } from '@/lib/types';
import Link from 'next/link';
import QuestionCard from '@/components/question-card';

const STATUS_LABEL: Record<string, string> = {
  done: 'Hoàn thành', processing: 'Đang xử lý', failed: 'Lỗi', pending: 'Chờ'
};

export default async function SourceFileViewPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const { data: file } = await sb
    .from('source_files')
    .select('id, filename, status, created_at, chapter_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!file) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-gray-500 mb-4">File không tồn tại hoặc đã bị xoá.</p>
        <Link href="/chapters" className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50">
          ← Về Bank
        </Link>
      </div>
    );
  }

  const { data: questions } = await sb
    .from('questions')
    .select('*')
    .eq('source_file_id', params.id)
    .order('question_number');

  const qs = (questions ?? []) as Question[];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold break-all">{file.filename}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(file.created_at).toLocaleString('vi-VN')} ·{' '}
            {qs.length} câu ·{' '}
            <span>{STATUS_LABEL[file.status] ?? file.status}</span>
          </p>
        </div>
        <Link
          href={`/chapters`}
          className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50 shrink-0"
        >
          ← Bank
        </Link>
      </div>

      {qs.length === 0 ? (
        <p className="text-gray-500 text-center py-10">
          {file.status === 'processing'
            ? 'File đang được xử lý, vui lòng thử lại sau.'
            : 'Không có câu hỏi nào trong file này.'}
        </p>
      ) : (
        <ol className="space-y-4">
          {qs.map((q, idx) => (
            <QuestionCard key={q.id} q={q} index={idx} />
          ))}
        </ol>
      )}
    </div>
  );
}
