'use client';

import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { QuestionRange, QuestionType } from '@/lib/types';

interface UploadResult {
  total: number;
  inserted: number;
  skipped_duplicate: number;
  unclassified: number;
}

interface ChunkProgress {
  current: number; // chunks hoàn thành
  total: number;
  inserted: number;
  skipped_duplicate: number;
  unclassified: number;
  eta: number | null; // giây còn lại
}

interface ChunkedCtx {
  total_chunks: number;
  source_file_id: string;
  precomputed_answers: Record<string, string>;
}

const CHUNK_SIZE = 40;
const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024; // 2MB

async function safeJson<T>(res: Response): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) as T & { error?: string } };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: { error: `[${res.status}] Server trả về non-JSON: ${text.slice(0, 300)}` } as T & { error?: string },
    };
  }
}

function UploadInner() {
  const params = useSearchParams();
  const chapterId = params.get('chapter_id') ?? '';

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ranges, setRanges] = useState<QuestionRange[]>([
    { from: 1, to: 10, type: 'multiple_choice' },
  ]);
  const [autoType, setAutoType] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [chunkedMode, setChunkedMode] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const [failedChunk, setFailedChunk] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const chunkedCtxRef = useRef<ChunkedCtx | null>(null);
  const sessionStartRef = useRef<number>(0);
  const accRef = useRef({ inserted: 0, skipped: 0, unclassified: 0 });

  const ACCEPT = '.docx,.pdf';

  // Cảnh báo khi đóng tab trong lúc upload
  useEffect(() => {
    if (!loading) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [loading]);

  function pickFile(f: File) {
    if (!f.name.endsWith('.docx') && !f.name.endsWith('.pdf')) {
      setErr('Chỉ hỗ trợ file .docx hoặc .pdf');
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setErr('File không được vượt quá 4 MB');
      return;
    }
    setFile(f);
    setErr('');
    setResult(null);
    setChunkProgress(null);
    setFailedChunk(null);
    if (f.size >= LARGE_FILE_THRESHOLD) setChunkedMode(true);
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

  // ─── Chunked upload ────────────────────────────────────────────────────────

  async function runChunks(ctx: ChunkedCtx, startFrom: number) {
    const { total_chunks, source_file_id, precomputed_answers } = ctx;
    const hasPrecomputed = Object.keys(precomputed_answers).length > 0;
    const structure = autoType
      ? [{ from: 1, to: 9999, type: 'multiple_choice' as const }]
      : ranges;

    for (let i = startFrom; i < total_chunks; i++) {
      if (cancelRef.current) break;

      setChunkProgress({
        current: i,
        total: total_chunks,
        inserted: accRef.current.inserted,
        skipped_duplicate: accRef.current.skipped,
        unclassified: accRef.current.unclassified,
        eta: null,
      });

      // Server tự download HTML từ Storage và cắt phần câu của chunk này
      const chunkRes = await fetch('/api/upload/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_file_id,
          chunk_index: i,
          total_chunks,
          chunk_ranges: structure,
          precomputed_answers,
          auto_type: autoType,
          auto_answer: hasPrecomputed ? false : autoAnswer,
        }),
      });

      const { ok: chunkOk, data: chunkData } = await safeJson<{ inserted: number; skipped_duplicate: number; unclassified: number }>(chunkRes);
      if (!chunkOk) {
        setErr(`Chunk ${i + 1}/${total_chunks} thất bại: ${chunkData.error ?? 'Lỗi không xác định'}`);
        setFailedChunk(i);
        setLoading(false);
        return;
      }
      const d = chunkData;
      accRef.current.inserted += d.inserted;
      accRef.current.skipped += d.skipped_duplicate;
      accRef.current.unclassified += d.unclassified;

      const elapsed = Date.now() - sessionStartRef.current;
      const done = i - startFrom + 1;
      const avgMs = elapsed / done;
      const remainMs = avgMs * (total_chunks - i - 1);
      const eta = remainMs > 1000 ? Math.ceil(remainMs / 1000) : null;

      setChunkProgress({
        current: i + 1,
        total: total_chunks,
        inserted: accRef.current.inserted,
        skipped_duplicate: accRef.current.skipped,
        unclassified: accRef.current.unclassified,
        eta,
      });
    }

    setLoading(false);
    if (!cancelRef.current) {
      setResult({
        total: accRef.current.inserted + accRef.current.skipped,
        inserted: accRef.current.inserted,
        skipped_duplicate: accRef.current.skipped,
        unclassified: accRef.current.unclassified,
      });
    }
  }

  async function submitChunked(overwrite = false) {
    if (!file || !chapterId) return;
    setLoading(true);
    setErr('');
    setResult(null);
    setChunkProgress(null);
    setFailedChunk(null);
    cancelRef.current = false;
    accRef.current = { inserted: 0, skipped: 0, unclassified: 0 };

    const fd = new FormData();
    fd.append('file', file);
    fd.append('chapter_id', chapterId);
    fd.append('structure', JSON.stringify(ranges));
    fd.append('overwrite', String(overwrite));
    fd.append('auto_type', String(autoType));
    fd.append('auto_answer', String(autoAnswer));

    const initRes = await fetch('/api/upload/init', { method: 'POST', body: fd });
    if (initRes.status === 401) {
      setLoading(false);
      setErr('Phiên đăng nhập hết hạn. Đang chuyển trang...');
      setTimeout(() => { window.location.href = '/login'; }, 1200);
      return;
    }
    const { ok: initOk, status: initStatus, data: initData } = await safeJson<{
      source_file_id: string;
      total_questions_detected: number;
      precomputed_answers: Record<string, string>;
    }>(initRes);

    if (initStatus === 409 && initData.error === 'FILE_EXISTS') {
      setLoading(false);
      if (confirm('File đã upload trước đó. Ghi đè?')) submitChunked(true);
      return;
    }
    if (!initOk) {
      setLoading(false);
      setErr(initData.error ?? 'Lỗi khởi tạo');
      return;
    }

    const { source_file_id, total_questions_detected, precomputed_answers } = initData as {
      source_file_id: string;
      total_questions_detected: number;
      precomputed_answers: Record<string, string>;
    };

    const total_chunks = Math.max(1, Math.ceil(total_questions_detected / CHUNK_SIZE));
    const ctx: ChunkedCtx = { total_chunks, source_file_id, precomputed_answers };
    chunkedCtxRef.current = ctx;

    setChunkProgress({
      current: 0,
      total: total_chunks,
      inserted: 0,
      skipped_duplicate: 0,
      unclassified: 0,
      eta: null,
    });
    sessionStartRef.current = Date.now();

    await runChunks(ctx, 0);
  }

  async function retryChunk() {
    if (!chunkedCtxRef.current || failedChunk === null) return;
    setLoading(true);
    setErr('');
    setFailedChunk(null);
    cancelRef.current = false;
    sessionStartRef.current = Date.now();
    await runChunks(chunkedCtxRef.current, failedChunk);
  }

  // ─── Single-endpoint upload ────────────────────────────────────────────────

  async function submitSingle(overwrite = false) {
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd, signal: controller.signal });
      if (res.status === 401) {
        setLoading(false);
        setErr('Phiên đăng nhập hết hạn. Đang chuyển trang...');
        setTimeout(() => { window.location.href = '/login'; }, 1200);
        return;
      }
      const { ok, status, data: j } = await safeJson<UploadResult>(res);
      setLoading(false);
      if (status === 409 && j.error === 'FILE_EXISTS') {
        if (confirm('File đã upload trước đó. Ghi đè?')) submitSingle(true);
        return;
      }
      if (!ok) {
        const msg = status === 504
          ? 'File xử lý quá lâu (timeout). Hãy bật Chế độ file lớn và thử lại.'
          : (j.error ?? 'Lỗi');
        setErr(msg);
        if (status === 504) setChunkedMode(true);
        return;
      }
      setResult(j as UploadResult);
    } catch (e) {
      setLoading(false);
      if (e instanceof Error && e.name === 'AbortError') {
        setErr('Upload mất quá nhiều thời gian. Hãy thử lại hoặc bật Chế độ file lớn.');
      } else {
        setErr(e instanceof Error ? e.message : 'Lỗi không xác định');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function submit(overwrite = false) {
    if (chunkedMode) return submitChunked(overwrite);
    return submitSingle(overwrite);
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

  const pct = chunkProgress
    ? Math.round((chunkProgress.current / chunkProgress.total) * 100)
    : 0;

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
            <p className="text-sm text-gray-500 mt-1">
              {(file.size / 1024).toFixed(0)} KB · nhấn để đổi file
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 text-sm mb-1">Kéo file vào đây hoặc nhấn để chọn</p>
            <p className="text-xs text-gray-400">.docx · .pdf (copy được) · tối đa 4 MB</p>
          </div>
        )}
      </div>

      {/* Tuỳ chọn AI */}
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
            <p className="text-xs text-gray-500">
              Gemini tự phân loại trắc nghiệm / tự luận / đúng-sai — không cần khai báo cấu trúc
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={autoAnswer}
            onChange={(e) => setAutoAnswer(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">Tự tìm / sinh đáp án</p>
            <p className="text-xs text-gray-500">
              AI tìm đáp án sẵn có trong file; nếu không có thì tự sinh. Bỏ tick để dùng detect
              nhanh (không tốn AI call)
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={chunkedMode}
            onChange={(e) => setChunkedMode(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">Chế độ file lớn</p>
            <p className="text-xs text-gray-500">
              Tách thành từng batch {CHUNK_SIZE} câu để xử lý file 100+ câu. Tự bật khi file
              &gt; 2 MB. Ảnh và bảng vẫn được giữ nguyên.
            </p>
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
                <button
                  onClick={() => remove(i)}
                  className="text-red-400 hover:text-red-600 text-sm px-1"
                >
                  ✕
                </button>
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

      {/* Lỗi */}
      {err && (
        <div className="flex items-center gap-3 text-red-600 text-sm mb-4">
          <span>{err}</span>
          {failedChunk !== null && (
            <button
              onClick={retryChunk}
              className="shrink-0 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 px-3 py-1 rounded text-xs font-medium"
            >
              Thử lại chunk {failedChunk + 1}
            </button>
          )}
        </div>
      )}

      {/* Tiến trình chunked */}
      {chunkProgress && loading && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center text-sm mb-2">
            <span className="text-blue-800 font-medium">
              {chunkProgress.current === 0
                ? 'Bắt đầu xử lý...'
                : `Chunk ${chunkProgress.current}/${chunkProgress.total} hoàn thành`}
            </span>
            {chunkProgress.eta !== null && (
              <span className="text-blue-600 text-xs">~{chunkProgress.eta}s còn lại</span>
            )}
          </div>
          <div className="w-full bg-blue-100 rounded-full h-2 mb-3">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-blue-600">Đừng đóng tab trong khi xử lý</p>
            <button
              onClick={() => { cancelRef.current = true; }}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Huỷ
            </button>
          </div>
          {chunkProgress.current > 0 && (
            <div className="flex gap-4 text-xs text-blue-700 mt-2">
              <span>Đã thêm: <b>{chunkProgress.inserted}</b></span>
              <span>Trùng: <b>{chunkProgress.skipped_duplicate}</b></span>
              <span>Chưa phân loại: <b>{chunkProgress.unclassified}</b></span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => submit()}
        disabled={!file || loading}
        className="w-full bg-black text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {loading
          ? chunkProgress
            ? `Chunk ${chunkProgress.current + 1}/${chunkProgress.total}...`
            : 'Đang khởi tạo...'
          : chunkedMode
          ? 'Upload & Xử lý theo batch'
          : 'Upload & Phân loại'}
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
