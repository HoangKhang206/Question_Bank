'use client';

import { Suspense, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { QuestionRange, QuestionType } from '@/lib/types';

interface UploadResult {
  total: number;
  inserted: number;
  skipped_duplicate: number;
  unclassified: number;
}

function UploadInner() {
  const params = useSearchParams();
  const chapterId = params.get('chapter_id') ?? '';

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ranges, setRanges] = useState<QuestionRange[]>([
    { from: 1, to: 10, type: 'multiple_choice' }
  ]);
  const [autoType, setAutoType] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ACCEPT = '.docx,.pdf';

  function pickFile(f: File) {
    if (!f.name.endsWith('.docx') && !f.name.endsWith('.pdf')) {
      setErr('Chỉ hỗ trợ file .docx hoặc .pdf');
      return;
    }
    setFile(f);
    setErr('');
    setResult(null);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  async function submit(overwrite = false) {
    if (!file || !chapterId) return;
    setLoading(true);
    setErr('');
    setResult(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('chapter_id', chapterId);
    fd.append('structure', JSON.stringify(ranges));
    fd.append('overwrite', String(overwrite));
    fd.append('auto_type', String(autoType));
    fd.append('auto_answer', String(autoAnswer));

    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const j = await res.json();
    setLoading(false);

    if (res.status === 409 && j.error === 'FILE_EXISTS') {
      if (confirm('File đã upload trước đó. Ghi đè?')) submit(true);
      return;
    }
    if (!res.ok) { setErr(j.error ?? 'Lỗi'); return; }
    setResult(j);
  }

  function update(i: number, patch: Partial<QuestionRange>) {
    setRanges(ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRanges(ranges.filter((_, idx) => idx !== i));
  }

  if (!chapterId) {
    return (
      <p className="text-red-600">
        Thiếu chapter_id. Vào <a href="/chapters" className="underline">Bank</a> chọn chương trước.
      </p>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Upload đề</h1>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-5
          ${dragging ? 'border-blue-500 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
        />
        {file ? (
          <div>
            <p className="text-green-700 font-medium text-lg">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB · nhấn để đổi file</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 text-sm mb-1">Kéo file vào đây hoặc nhấn để chọn</p>
            <p className="text-xs text-gray-400">.docx · .pdf (copy được)</p>
          </div>
        )}
      </div>

      {/* AI options */}
      <div className="bg-gray-50 border rounded-lg p-4 mb-5">
        <p className="text-sm font-semibold mb-3">Tuỳ chọn AI</p>
        <label className="flex items-start gap-3 text-sm cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={autoType}
            onChange={(e) => setAutoType(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">Tự nhận dạng dạng câu</p>
            <p className="text-xs text-gray-500">Gemini tự phân loại trắc nghiệm / tự luận / đúng-sai — không cần khai báo cấu trúc</p>
          </div>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autoAnswer}
            onChange={(e) => setAutoAnswer(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">Tự tìm / sinh đáp án</p>
            <p className="text-xs text-gray-500">AI đọc file tìm đáp án sẵn có; nếu không có thì tự sinh. Bỏ tick để dùng detect nhanh (không tốn AI call)</p>
          </div>
        </label>
      </div>

      {/* Cấu trúc đề */}
      {!autoType && (
        <div className="bg-white border rounded-lg p-4 mb-5">
          <p className="text-sm font-semibold mb-3">Cấu trúc đề</p>
          <div className="space-y-2">
            {ranges.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-8">Câu</span>
                <input
                  type="number"
                  value={r.from}
                  onChange={(e) => update(i, { from: +e.target.value })}
                  className="border rounded px-2 py-1.5 w-16 text-sm text-center"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="number"
                  value={r.to}
                  onChange={(e) => update(i, { to: +e.target.value })}
                  className="border rounded px-2 py-1.5 w-16 text-sm text-center"
                />
                <select
                  value={r.type}
                  onChange={(e) => update(i, { type: e.target.value as QuestionType })}
                  className="border rounded px-2 py-1.5 text-sm flex-1"
                >
                  <option value="multiple_choice">Trắc nghiệm</option>
                  <option value="short_answer">Trả lời ngắn</option>
                  <option value="true_false">Đúng/Sai</option>
                  <option value="essay">Tự luận</option>
                </select>
                <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setRanges([...ranges, { from: 1, to: 1, type: 'multiple_choice' }])}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            + Thêm dải câu
          </button>
        </div>
      )}

      {err && <p className="text-red-600 text-sm mb-4">{err}</p>}

      <button
        onClick={() => submit()}
        disabled={!file || loading}
        className="w-full bg-black text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {loading ? 'Đang xử lý...' : 'Upload & Phân loại'}
      </button>

      {result && (
        <div className="mt-5 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
          <p className="font-semibold text-green-800 mb-1">Hoàn thành</p>
          <div className="flex gap-4 text-green-700">
            <span>Đã thêm: <b>{result.inserted}</b></span>
            <span>Trùng bỏ qua: <b>{result.skipped_duplicate}</b></span>
            <span>Chưa phân loại: <b>{result.unclassified}</b></span>
          </div>
          <a href="/chapters" className="mt-2 inline-block text-blue-600 hover:underline">
            Xem trong Bank →
          </a>
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<p>Đang tải...</p>}>
      <UploadInner />
    </Suspense>
  );
}
