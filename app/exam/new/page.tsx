'use client';

import { useState, useEffect, useMemo } from 'react';
import { ToastContainer, useToast } from '@/components/toast';
import { Spinner } from '@/components/spinner';
import type { Chapter, Question, ExamConfig, ExamMeta, Difficulty, QuestionType } from '@/lib/types';
import { generateSeed } from '@/lib/sample/rng';

interface Stats { total: number; byDifficulty: Record<string, number>; byType: Record<string, number> }
interface Missing { type: QuestionType; needed: number; available: number }
interface Preview { questions: Question[]; missing: Missing[] }

const DIFF_LABEL: Record<string, string> = {
  biet: 'Biết', hieu: 'Hiểu', van_dung: 'Vận dụng', unclassified: 'Chưa p.loại'
};
const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm', short_answer: 'Trả lời ngắn', true_false: 'Đúng/Sai', essay: 'Tự luận'
};
const DIFFICULTIES = ['biet', 'hieu', 'van_dung', 'unclassified'] as Difficulty[];
const TYPES = ['multiple_choice', 'true_false', 'short_answer', 'essay'] as QuestionType[];
const TYPE_ORDER_IDX = Object.fromEntries(TYPES.map((t, i) => [t, i])) as Record<QuestionType, number>;

export default function NewExamPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [config, setConfig] = useState<ExamConfig>({
    chapter_ids: [],
    total_questions: 30,
    by_difficulty: { biet: 0, hieu: 0, van_dung: 0, unclassified: 30 },
    by_type: { multiple_choice: 30, short_answer: 0, true_false: 0, essay: 0 },
    random_seed: generateSeed()
  });
  const [metaOpen, setMetaOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [examName, setExamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');
  const [activeTab, setActiveTab] = useState<'structure' | 'sample'>('structure');
  const { toasts, addToast, removeToast } = useToast();

  const totalByType = useMemo(
    () => TYPES.reduce((s, t) => s + (config.by_type[t] ?? 0), 0),
    [config.by_type]
  );
  const totalByDiff = useMemo(
    () => DIFFICULTIES.reduce((s, d) => s + (config.by_difficulty[d] ?? 0), 0),
    [config.by_difficulty]
  );

  useEffect(() => {
    fetch('/api/chapters')
      .then((r) => r.json())
      .then((j) => setChapters(j.chapters ?? []))
      .finally(() => setChaptersLoading(false));
  }, []);

  const chapterKey = [...config.chapter_ids].sort().join(',');
  useEffect(() => {
    if (!chapterKey) { setStats(null); return; }
    setStatsLoading(true);
    fetch(`/api/questions/stats?chapter_ids=${chapterKey}`)
      .then((r) => r.json())
      .then((j) => setStats(j))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [chapterKey]);

  function toggleChapter(id: string, on: boolean) {
    setConfig((c) => ({
      ...c,
      chapter_ids: on ? [...c.chapter_ids, id] : c.chapter_ids.filter((x) => x !== id)
    }));
    setPreview(null);
    setActiveTab('structure');
  }
  function setDiff(d: Difficulty, v: number) {
    setConfig((c) => ({ ...c, by_difficulty: { ...c.by_difficulty, [d]: Math.max(0, v) } }));
  }
  function setType(t: QuestionType, v: number) {
    setConfig((c) => ({ ...c, by_type: { ...c.by_type, [t]: Math.max(0, v) } }));
  }

  async function doPreview() {
    setLoading(true);
    setErr('');
    const effectiveConfig: ExamConfig = { ...config, total_questions: totalByType };
    const res = await fetch('/api/exam/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(effectiveConfig)
    });
    const j = await res.json();
    setLoading(false);
    if (res.ok) { setPreview(j); setActiveTab('sample'); }
    else setErr(j.error ?? 'Lỗi');
  }

  async function saveAndExport(variant: 'blank' | 'with_answer') {
    if (!preview || !examName.trim()) return;
    setExporting(true);
    const effectiveConfig: ExamConfig = { ...config, total_questions: totalByType };

    const saveRes = await fetch('/api/exam/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: examName.trim(), config: effectiveConfig, question_ids: preview.questions.map((q) => q.id) })
    });
    if (!saveRes.ok) { addToast('Lỗi lưu đề', 'error'); setExporting(false); return; }
    const { exam } = await saveRes.json();

    const exportRes = await fetch('/api/exam/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: exam.id, format: 'docx', variant })
    });
    if (!exportRes.ok) {
      const j = await exportRes.json().catch(() => ({}));
      addToast(j.error ?? 'Lỗi export', 'error');
      setExporting(false);
      return;
    }
    const blob = await exportRes.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${examName.trim()}_${variant}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    addToast(`Đã export "${examName.trim()}"`);
  }

  function setMeta(patch: Partial<ExamMeta>) {
    setConfig((c) => ({ ...c, meta: { ...c.meta, ...patch } }));
  }

  const hasChapter = config.chapter_ids.length > 0;
  const canPreview = hasChapter && totalByType > 0;

  return (
    <div className="max-w-3xl">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <h1 className="text-2xl font-bold mb-5">Tạo đề mới</h1>

      {/* Chọn chương */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-gray-700 mb-2">Chương</p>
        {chaptersLoading ? (
          <span className="flex items-center gap-2 text-sm text-gray-500"><Spinner />Đang tải...</span>
        ) : chapters.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có chương. <a href="/chapters" className="underline">Tạo ở Bank</a>.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chapters.map((c) => {
              const selected = config.chapter_ids.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`border rounded-lg px-3 py-1.5 cursor-pointer text-sm select-none transition-colors ${
                    selected ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => toggleChapter(c.id, e.target.checked)}
                    className="hidden"
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        )}
        {hasChapter && (
          <p className="text-xs text-gray-400 mt-1.5">
            {statsLoading ? 'Đang đếm câu...' : stats ? `${stats.total} câu trong ngân hàng` : ''}
          </p>
        )}
      </div>

      {/* Phân bổ */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Mức độ */}
        <div className="bg-white border rounded-lg p-4">
          <p className="text-sm font-semibold mb-3">Phân bổ mức độ</p>
          {DIFFICULTIES.map((d) => (
            <NumberInput
              key={d}
              label={DIFF_LABEL[d]}
              value={config.by_difficulty[d] ?? 0}
              available={stats?.byDifficulty[d]}
              onChange={(v) => setDiff(d, v)}
            />
          ))}
          <div className="mt-2 pt-2 border-t flex justify-between text-xs">
            <span className="text-gray-500">Tổng</span>
            <span className={totalByDiff !== totalByType && totalByDiff > 0 ? 'text-amber-600 font-medium' : 'text-gray-500'}>
              {totalByDiff}
            </span>
          </div>
        </div>

        {/* Dạng câu */}
        <div className="bg-white border rounded-lg p-4">
          <p className="text-sm font-semibold mb-3">Phân bổ dạng câu</p>
          {TYPES.map((t) => (
            <NumberInput
              key={t}
              label={TYPE_LABEL[t]}
              value={config.by_type[t] ?? 0}
              available={stats?.byType[t]}
              onChange={(v) => setType(t, v)}
            />
          ))}
          <div className="mt-2 pt-2 border-t flex justify-between text-xs font-semibold">
            <span>Tổng câu</span>
            <span>{totalByType}</span>
          </div>
        </div>
      </div>

      {/* Thông tin in trên đề */}
      <div className="bg-white border rounded-lg mb-5 overflow-hidden">
        <button
          onClick={() => setMetaOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-medium hover:bg-gray-50"
        >
          <span className="text-gray-400">{metaOpen ? '▼' : '▶'}</span>
          Thông tin in trên đề
          <span className="text-xs text-gray-400 font-normal">(tuỳ chọn)</span>
        </button>
        {metaOpen && (
          <div className="border-t px-4 py-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Tên trường</label>
              <input
                value={config.meta?.school ?? ''}
                onChange={(e) => setMeta({ school: e.target.value })}
                placeholder="SỞ GDĐT ... / TRƯỜNG THPT ..."
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Tiêu đề đề thi</label>
              <input
                value={config.meta?.exam_title ?? ''}
                onChange={(e) => setMeta({ exam_title: e.target.value })}
                placeholder="ĐỀ KIỂM TRA CUỐI KỲ 1 NĂM HỌC 2025–2026"
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Môn học</label>
              <input
                value={config.meta?.subject ?? ''}
                onChange={(e) => setMeta({ subject: e.target.value })}
                placeholder="HOÁ HỌC"
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ngày thi</label>
              <input
                value={config.meta?.date ?? ''}
                onChange={(e) => setMeta({ date: e.target.value })}
                placeholder="02/11/2025"
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Thời gian làm bài</label>
              <input
                value={config.meta?.duration ?? ''}
                onChange={(e) => setMeta({ duration: e.target.value })}
                placeholder="50 phút"
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Cho biết (hằng số, công thức...)</label>
              <textarea
                value={config.meta?.constants ?? ''}
                onChange={(e) => setMeta({ constants: e.target.value })}
                placeholder="Cho biết nguyên tử khối: H = 1; C = 12; N = 14; O = 16..."
                rows={2}
                className="border rounded px-2 py-1.5 text-sm w-full resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Seed + CTA */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-sm text-gray-600">Seed:</span>
        <input
          value={config.random_seed}
          onChange={(e) => setConfig((c) => ({ ...c, random_seed: e.target.value }))}
          className="border rounded px-2 py-1 text-sm font-mono w-28"
        />
        <button
          onClick={() => setConfig((c) => ({ ...c, random_seed: generateSeed() }))}
          className="text-sm text-blue-600 hover:underline"
        >
          Sinh mới
        </button>
        <div className="ml-auto flex items-center gap-2">
          {!hasChapter && <span className="text-xs text-amber-600">Chọn ít nhất 1 chương</span>}
          {hasChapter && totalByType === 0 && <span className="text-xs text-amber-600">Nhập số câu ở Dạng câu</span>}
          <button
            onClick={doPreview}
            disabled={loading || !canPreview}
            className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-40 flex items-center gap-2"
          >
            {loading && <Spinner />}
            {loading ? 'Đang trộn...' : 'Xem thử'}
          </button>
        </div>
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}

      {/* Preview panel */}
      {hasChapter && (
        <div className="border rounded-lg overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b bg-gray-50">
            <button
              onClick={() => setActiveTab('structure')}
              className={`px-4 py-2.5 text-sm font-medium border-r transition-colors ${
                activeTab === 'structure' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Cấu trúc đề
            </button>
            <button
              onClick={() => setActiveTab('sample')}
              disabled={!preview}
              className={`px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                activeTab === 'sample' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Câu hỏi mẫu{preview ? ` (${preview.questions.length})` : ''}
            </button>
          </div>

          {/* Tab: Cấu trúc đề */}
          {activeTab === 'structure' && (
            <div className="p-5">
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-bold">{totalByType}</span>
                <span className="text-gray-500">câu</span>
                {totalByDiff > 0 && totalByDiff !== totalByType && (
                  <span className="text-xs text-amber-600 ml-2">
                    ⚠ Tổng mức độ ({totalByDiff}) ≠ tổng dạng câu ({totalByType})
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Theo mức độ</p>
                  {DIFFICULTIES.map((d) => {
                    const n = config.by_difficulty[d] ?? 0;
                    if (n === 0) return null;
                    return (
                      <div key={d} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                        <span className="text-gray-700">{DIFF_LABEL[d]}</span>
                        <span className="font-medium">{n} câu</span>
                      </div>
                    );
                  })}
                  {totalByDiff === 0 && <p className="text-sm text-gray-400 italic">Chưa phân bổ</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Theo dạng câu</p>
                  {TYPES.map((t) => {
                    const n = config.by_type[t] ?? 0;
                    if (n === 0) return null;
                    return (
                      <div key={t} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                        <span className="text-gray-700">{TYPE_LABEL[t]}</span>
                        <span className="font-medium">{n} câu</span>
                      </div>
                    );
                  })}
                  {totalByType === 0 && <p className="text-sm text-gray-400 italic">Chưa phân bổ</p>}
                </div>
              </div>
              {!preview && canPreview && (
                <p className="text-sm text-gray-400 mt-5 text-center">
                  Nhấn <strong>Xem thử</strong> để trộn câu →
                </p>
              )}
            </div>
          )}

          {/* Tab: Câu hỏi mẫu */}
          {activeTab === 'sample' && preview && (
            <div className="p-5">
              {preview.missing.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                  <p className="font-medium mb-1">⚠ Thiếu câu ở một số tổ hợp:</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-gray-700">
                    {preview.missing.map((m, i) => (
                      <li key={i}>{TYPE_LABEL[m.type]}: cần {m.needed}, có {m.available} trong bank</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 mb-4 flex-wrap items-center">
                <input
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Tên đề..."
                  className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[160px]"
                />
                <button onClick={doPreview} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">
                  Trộn lại
                </button>
                <button
                  onClick={() => saveAndExport('blank')}
                  disabled={exporting || !examName.trim()}
                  className="border px-3 py-1.5 rounded text-sm disabled:opacity-50 flex items-center gap-1 hover:bg-gray-50"
                >
                  {exporting && <Spinner />}
                  Đề trắng
                </button>
                <button
                  onClick={() => saveAndExport('with_answer')}
                  disabled={exporting || !examName.trim()}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50 flex items-center gap-1"
                >
                  {exporting && <Spinner className="border-white" />}
                  Có đáp án
                </button>
              </div>
              {!examName.trim() && (
                <p className="text-xs text-amber-600 mb-3">Nhập tên đề để export</p>
              )}

              <ol className="space-y-2">
                {[...preview.questions].sort((a, b) => TYPE_ORDER_IDX[a.type] - TYPE_ORDER_IDX[b.type]).map((q, idx) => (
                  <li key={q.id} className="border rounded p-3 bg-gray-50 text-sm">
                    <p className="font-medium text-gray-900">
                      <span className="text-gray-400 mr-1.5">Câu {idx + 1}.</span>
                      {(() => {
                        let s = q.content.replace(/^Câu\s*\d+\s*[.:]\s*/u, '');
                        if (q.options && q.options.length > 0) {
                          const m = s.match(/[\s\n]+[Aa]\.\s/);
                          if (m?.index !== undefined) s = s.slice(0, m.index).trim();
                        }
                        return s.slice(0, 200) + (s.length > 200 ? '...' : '');
                      })()}
                    </p>
                    {q.options && q.options.length > 0 && (
                      <ul className="mt-1.5 ml-5 space-y-0.5">
                        {q.options.map((o) => (
                          <li
                            key={o.key}
                            className={`text-xs ${q.answer === o.key ? 'text-green-700 font-semibold' : 'text-gray-600'}`}
                          >
                            {o.key}. {o.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumberInput({
  label, value, available, onChange
}: {
  label: string;
  value: number;
  available?: number;
  onChange: (v: number) => void;
}) {
  const overLimit = available !== undefined && value > available;
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      {available !== undefined && (
        <span className="text-xs text-gray-400 w-12 text-right">/{available}</span>
      )}
      <input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onChange(+e.target.value)}
        className={`border rounded px-2 py-1 w-16 text-sm text-center ${
          overLimit ? 'border-red-400 bg-red-50 text-red-700' : ''
        }`}
      />
    </div>
  );
}
