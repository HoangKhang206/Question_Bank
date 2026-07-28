'use client';

import { useState } from 'react';
import type { Exam } from '@/lib/types';
import { ToastContainer, useToast } from '@/components/toast';
import { Spinner } from '@/components/spinner';

interface DeleteTarget { exam: Exam; deleteQuestions: boolean }

export default function ExamList({ exams: initial }: { exams: Exam[] }) {
  const [exams, setExams] = useState<Exam[]>(initial);
  const [exporting, setExporting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { exam, deleteQuestions } = deleteTarget;
    setDeleting(true);
    const url = `/api/exams/${exam.id}${deleteQuestions ? '?delete_questions=true' : ''}`;
    const res = await fetch(url, { method: 'DELETE' });
    setDeleting(false);
    setDeleteTarget(null);
    if (!res.ok) { addToast('Xoá thất bại', 'error'); return; }
    setExams((prev) => prev.filter((e) => e.id !== exam.id));
    addToast(deleteQuestions
      ? `Đã xoá đề "${exam.name}" và ${exam.question_ids.length} câu`
      : `Đã xoá đề "${exam.name}"`
    );
  }

  async function exportExam(exam: Exam, variant: 'blank' | 'with_answer') {
    setExporting(`${exam.id}-${variant}`);
    const res = await fetch('/api/exam/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: exam.id, format: 'docx', variant })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      addToast(j.error ?? 'Lỗi export', 'error');
      setExporting(null);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exam.name}_${variant}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
    addToast(`Đã tải "${exam.name}"`);
  }

  return (
    <div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Dialog xoá */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <p className="font-semibold text-gray-900 mb-1">Xoá đề thi</p>
            <p className="text-sm text-gray-600 mb-4">
              Bạn có chắc muốn xoá <span className="font-medium">"{deleteTarget.exam.name}"</span>?
            </p>
            <label className="flex items-start gap-2.5 text-sm cursor-pointer mb-5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <input
                type="checkbox"
                checked={deleteTarget.deleteQuestions}
                onChange={(e) => setDeleteTarget({ ...deleteTarget, deleteQuestions: e.target.checked })}
                className="mt-0.5 accent-red-600"
              />
              <div>
                <p className="font-medium text-red-700">Xoá luôn {deleteTarget.exam.question_ids.length} câu hỏi trong bank</p>
                <p className="text-xs text-red-500 mt-0.5">Không thể khôi phục sau khi xoá</p>
              </div>
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="border px-4 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-50"
              >
                Huỷ
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Đang xoá...' : 'Xoá'}
              </button>
            </div>
          </div>
        </div>
      )}

      {exams.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="mb-3">Chưa có đề nào được tạo.</p>
          <a href="/exam/new" className="bg-black text-white px-4 py-2 rounded text-sm inline-block">
            Tạo đề đầu tiên
          </a>
        </div>
      ) : (
        <ul className="space-y-2">
          {exams.map((e) => {
            const isExporting = exporting?.startsWith(e.id);
            return (
              <li key={e.id} className="bg-white border rounded p-3 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(e.created_at).toLocaleString('vi-VN')} · {e.question_ids.length} câu
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {isExporting && <Spinner />}
                  <a
                    href={`/exam/${e.id}`}
                    className="text-sm border px-2 py-1 rounded hover:bg-gray-50"
                  >
                    Xem
                  </a>
                  <button
                    onClick={() => setDeleteTarget({ exam: e, deleteQuestions: false })}
                    disabled={!!exporting}
                    className="text-sm border border-red-200 text-red-500 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    Xoá
                  </button>
                  <button
                    onClick={() => exportExam(e, 'blank')}
                    disabled={!!exporting}
                    className="text-sm border px-2 py-1 rounded disabled:opacity-50"
                  >
                    Đề trắng
                  </button>
                  <button
                    onClick={() => exportExam(e, 'with_answer')}
                    disabled={!!exporting}
                    className="text-sm bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-50"
                  >
                    Có đáp án
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
