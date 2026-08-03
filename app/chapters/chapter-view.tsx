'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Chapter, Question, Difficulty, QuestionType, QuestionOption } from '@/lib/types';
import { ToastContainer, useToast } from '@/components/toast';
import { SkeletonList } from '@/components/spinner';

export default function ChapterView({ chapters: initialChapters }: { chapters: Chapter[] }) {
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [questionsByChapter, setQuestionsByChapter] = useState<Record<string, Question[]>>({});
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});
  const [errById, setErrById] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState({ difficulty: '', type: '' });
  const [newChapter, setNewChapter] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();

  // Fetch list chapters khi mount
  useEffect(() => {
    fetch('/api/chapters')
      .then((r) => r.json())
      .then((j) => { if (j.chapters) setChapters(j.chapters); });
  }, []);

  const fetchChapter = useCallback((chapterId: string) => {
    setLoadingById((p) => ({ ...p, [chapterId]: true }));
    setErrById((p) => ({ ...p, [chapterId]: '' }));
    const params = new URLSearchParams({ chapter_id: chapterId });
    if (filter.difficulty) params.set('difficulty', filter.difficulty);
    if (filter.type) params.set('type', filter.type);
    fetch(`/api/questions?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setQuestionsByChapter((p) => ({ ...p, [chapterId]: j.questions ?? [] }));
        setFilesRefreshKey((k) => k + 1);
      })
      .catch((e) => setErrById((p) => ({ ...p, [chapterId]: e.message })))
      .finally(() => setLoadingById((p) => ({ ...p, [chapterId]: false })));
  }, [filter]);

  // Khi filter đổi → refetch các chapter đang mở
  useEffect(() => {
    expanded.forEach((id) => fetchChapter(id));
  }, [filter]);

  function toggleChapter(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!questionsByChapter[id]) fetchChapter(id);
      }
      return next;
    });
  }

  async function createChapter() {
    if (!newChapter.trim()) return;
    setCreating(true);
    setCreateErr('');
    const res = await fetch('/api/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChapter.trim() })
    });
    const j = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateErr(j.error ?? `Lỗi ${res.status}`); return; }
    setChapters((prev) => [...prev, j.chapter]);
    setNewChapter('');
    addToast('Đã tạo chương mới');
  }

  function handleSave(chapterId: string, updated: Question) {
    setQuestionsByChapter((p) => ({
      ...p,
      [chapterId]: (p[chapterId] ?? []).map((q) => q.id === updated.id ? updated : q)
    }));
    addToast('Đã lưu câu hỏi');
  }

  function handleDelete(chapterId: string, id: string) {
    setQuestionsByChapter((p) => ({
      ...p,
      [chapterId]: (p[chapterId] ?? []).filter((q) => q.id !== id)
    }));
    addToast('Đã xoá câu hỏi');
  }

  async function renameChapter(id: string, name: string) {
    const res = await fetch(`/api/chapters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const j = await res.json();
    if (!res.ok) { addToast(j.error ?? 'Lỗi đổi tên', 'error'); return false; }
    setChapters((prev) => prev.map((c) => c.id === id ? { ...c, name: j.chapter.name } : c));
    addToast('Đã đổi tên chương');
    return true;
  }

  async function deleteChapter(id: string, name: string) {
    if (!window.confirm(`Xoá chương "${name}" và toàn bộ câu hỏi bên trong?`)) return;
    const res = await fetch(`/api/chapters/${id}`, { method: 'DELETE' });
    if (!res.ok) { addToast('Xoá thất bại', 'error'); return; }
    setChapters((prev) => prev.filter((c) => c.id !== id));
    setExpanded((prev) => { const next = new Set(prev); next.delete(id); return next; });
    addToast(`Đã xoá chương "${name}"`);
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    const ok = await renameChapter(id, renameValue.trim());
    if (ok) setRenamingId(null);
  }

  return (
    <div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Filter + Tạo chương */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select
          value={filter.difficulty}
          onChange={(e) => setFilter((f) => ({ ...f, difficulty: e.target.value }))}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">Mọi mức độ</option>
          <option value="biet">Biết</option>
          <option value="hieu">Hiểu</option>
          <option value="van_dung">Vận dụng</option>
          <option value="unclassified">Chưa phân loại</option>
        </select>
        <select
          value={filter.type}
          onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">Mọi dạng</option>
          <option value="multiple_choice">Trắc nghiệm</option>
          <option value="short_answer">Trả lời ngắn</option>
          <option value="true_false">Đúng/Sai</option>
          <option value="essay">Tự luận</option>
        </select>

        {/* Tạo chương mới */}
        <div className="ml-auto flex gap-2">
          <input
            value={newChapter}
            onChange={(e) => setNewChapter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createChapter()}
            placeholder="Tên chương mới..."
            className="border rounded px-3 py-1.5 text-sm w-52"
          />
          <button
            onClick={createChapter}
            disabled={creating || !newChapter.trim()}
            className="bg-black text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {creating ? '...' : '+ Thêm chương'}
          </button>
        </div>
        {createErr && <p className="w-full text-red-600 text-xs">{createErr}</p>}
      </div>

      {/* Accordion chapters */}
      {chapters.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-10">
          Chưa có chương nào. Nhập tên chương ở trên để bắt đầu.
        </p>
      ) : (
        <div className="space-y-2">
          {chapters.map((chapter) => {
            const isOpen = expanded.has(chapter.id);
            const questions = questionsByChapter[chapter.id] ?? [];
            const isLoading = loadingById[chapter.id];
            const err = errById[chapter.id];
            return (
              <div key={chapter.id} className="border rounded bg-white">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Toggle + tên chương */}
                  <button
                    onClick={() => toggleChapter(chapter.id)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                  >
                    <span className="text-gray-400 text-sm w-4 shrink-0">{isOpen ? '▼' : '▶'}</span>
                    {renamingId === chapter.id ? null : (
                      <span className="font-semibold text-blue-700 flex-1 truncate">{chapter.name}</span>
                    )}
                    {isOpen && !isLoading && renamingId !== chapter.id && (
                      <span className="text-xs text-gray-400 shrink-0">{questions.length} câu</span>
                    )}
                  </button>

                  {/* Rename inline input */}
                  {renamingId === chapter.id && (
                    <>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(chapter.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="border rounded px-2 py-0.5 text-sm font-semibold flex-1 min-w-0"
                      />
                      <button
                        onClick={() => handleRename(chapter.id)}
                        className="text-xs bg-black text-white px-2 py-1 rounded shrink-0"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="text-xs border px-2 py-1 rounded text-gray-600 shrink-0"
                      >
                        Huỷ
                      </button>
                    </>
                  )}

                  {/* Action buttons */}
                  {renamingId !== chapter.id && (
                    <>
                      <a
                        href={`/upload?chapter_id=${chapter.id}`}
                        className="text-xs border px-2 py-1 rounded text-gray-600 hover:bg-gray-100 shrink-0"
                      >
                        + Upload
                      </a>
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === chapter.id ? null : chapter.id); }}
                          className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 text-base leading-none"
                        >
                          ⋮
                        </button>
                        {menuOpenId === chapter.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                            <div className="absolute right-0 top-full mt-1 bg-white border rounded shadow-md z-20 min-w-[130px]">
                              <button
                                onClick={() => { setMenuOpenId(null); setRenamingId(chapter.id); setRenameValue(chapter.name); }}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                              >
                                Đổi tên
                              </button>
                              <button
                                onClick={() => { setMenuOpenId(null); deleteChapter(chapter.id, chapter.name); }}
                                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Xoá chương
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Content */}
                {isOpen && (
                  <div className="border-t px-4 py-3">
                    {err ? (
                      <div className="flex items-center gap-3 text-sm text-red-600">
                        <span>{err}</span>
                        <button onClick={() => fetchChapter(chapter.id)} className="underline">Thử lại</button>
                      </div>
                    ) : isLoading ? (
                      <SkeletonList rows={3} />
                    ) : questions.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        <p className="mb-2">Chưa có câu hỏi nào.</p>
                        <a href={`/upload?chapter_id=${chapter.id}`} className="underline text-black">
                          Upload đề đầu tiên
                        </a>
                      </div>
                    ) : (
                      <div className="flex gap-4 items-start">
                        <ul className="flex-1 min-w-0 space-y-2">
                          {questions.map((q, idx) => (
                            <QuestionItem
                              key={q.id}
                              q={q}
                              idx={idx + 1}
                              onSave={(updated) => handleSave(chapter.id, updated)}
                              onDelete={(id) => handleDelete(chapter.id, id)}
                            />
                          ))}
                        </ul>
                        <SourceFilesPanel
                          chapterId={chapter.id}
                          refreshKey={filesRefreshKey}
                          onDeleted={() => fetchChapter(chapter.id)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ContentHints ─────────────────────────────────────────────────────────────

function extractFirstImgSrc(html: string): string | null {
  const m = html.match(/src="([^"]+)"/i);
  return m ? m[1] : null;
}

function ContentHints({ content }: { content: string }) {
  const imgSrc = extractFirstImgSrc(content);
  const hasTable = content.includes('<table');
  if (!imgSrc && !hasTable) return null;
  return (
    <div className="flex gap-2 items-center mt-1.5 flex-wrap">
      {imgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt=""
          className="max-h-16 w-auto rounded border border-gray-200 object-contain bg-white"
        />
      )}
      {hasTable && (
        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200">
          Có bảng
        </span>
      )}
    </div>
  );
}

// ─── QuestionItem ────────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  biet: 'bg-green-100 text-green-800',
  hieu: 'bg-yellow-100 text-yellow-800',
  van_dung: 'bg-red-100 text-red-800',
  unclassified: 'bg-gray-200 text-gray-500'
};
const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm', short_answer: 'Trả lời ngắn',
  true_false: 'Đúng/Sai', essay: 'Tự luận'
};
const DIFF_LABEL: Record<string, string> = {
  biet: 'Biết', hieu: 'Hiểu', van_dung: 'Vận dụng', unclassified: 'Chưa phân loại'
};

function parseTrueFalseAnswer(answer: string | null): Record<string, string> {
  if (!answer) return {};
  const result: Record<string, string> = {};
  for (const part of answer.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return result;
}

function AnswerDisplay({ q }: { q: Question }) {
  if (!q.answer && (!q.options || q.options.length === 0)) return null;

  if (q.type === 'multiple_choice') {
    if (!q.options || q.options.length === 0) {
      return q.answer
        ? <p className="text-xs text-green-700 mt-1">Đáp án: <b>{q.answer}</b></p>
        : null;
    }
    return (
      <ul className="mt-1.5 space-y-0.5">
        {q.options.map((o) => {
          const correct = q.answer === o.key;
          return (
            <li key={o.key} className={`text-xs flex gap-1.5 items-start ${correct ? 'text-green-700 font-semibold' : 'text-gray-600'}`}>
              <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] mt-0.5 ${correct ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'}`}>{o.key}</span>
              <span>{o.text}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  if (q.type === 'true_false') {
    const answerMap = parseTrueFalseAnswer(q.answer);
    if (!q.options || q.options.length === 0) {
      return q.answer ? <p className="text-xs text-green-700 mt-1">{q.answer}</p> : null;
    }
    return (
      <ul className="mt-1.5 space-y-0.5">
        {q.options.map((o) => {
          const verdict = answerMap[o.key];
          const isDung = verdict === 'Đúng';
          return (
            <li key={o.key} className="text-xs flex gap-1.5 items-start">
              <span className="shrink-0 text-gray-400 w-4">{o.key})</span>
              <span className="flex-1 text-gray-700">{o.text}</span>
              {verdict && (
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isDung ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{verdict}</span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  if (q.type === 'short_answer' && q.answer) {
    return (
      <p className="text-xs mt-1.5">
        <span className="text-gray-500">Đáp án: </span>
        <span className="bg-green-50 border border-green-200 text-green-800 font-medium px-2 py-0.5 rounded">{q.answer}</span>
      </p>
    );
  }

  if (q.type === 'essay' && q.answer) {
    return <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{q.answer}</p>;
  }

  return null;
}

function QuestionItem({
  q, idx, onSave, onDelete
}: {
  q: Question;
  idx: number;
  onSave: (q: Question) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="bg-gray-50 rounded border">
      <div
        className="p-3 cursor-pointer hover:bg-gray-100"
        onClick={() => setEditing((v) => !v)}
      >
        <div className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <div className="flex gap-1.5 text-xs mb-1 flex-wrap">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">{TYPE_LABEL[q.type] ?? q.type}</span>
              <span className={`px-2 py-0.5 rounded font-medium ${DIFF_COLOR[q.difficulty]}`}>{DIFF_LABEL[q.difficulty] ?? q.difficulty}</span>
              {q.explanation && <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-600 rounded">Có lời giải</span>}
            </div>
            <p className="text-sm text-gray-900">
              <span className="font-semibold text-gray-500 mr-1">Câu {idx}.</span>
              {(q.content.trimStart().startsWith('<')
                ? q.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                : q.content
              ).slice(0, 200)}
            </p>
            {q.content.trimStart().startsWith('<') && <ContentHints content={q.content} />}
            <AnswerDisplay q={q} />
          </div>
          <span className="text-xs text-gray-400 shrink-0 mt-1">{editing ? '▲' : '▼'}</span>
        </div>
      </div>
      {editing && (
        <EditPanel
          q={q}
          onSave={(updated) => { onSave(updated); setEditing(false); }}
          onDelete={() => onDelete(q.id)}
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  );
}

// ─── EditPanel ───────────────────────────────────────────────────────────────

function EditPanel({
  q, onSave, onDelete, onCancel
}: {
  q: Question;
  onSave: (updated: Question) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(q.content);
  const [difficulty, setDifficulty] = useState<Difficulty>(q.difficulty);
  const [type, setType] = useState<QuestionType>(q.type);
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [explanation, setExplanation] = useState(q.explanation ?? '');
  const [options, setOptions] = useState<QuestionOption[]>(
    q.options && q.options.length > 0 ? q.options :
    q.type === 'true_false'
      ? [{ key: 'a', text: '' }, { key: 'b', text: '' }, { key: 'c', text: '' }, { key: 'd', text: '' }]
      : [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function updateOption(key: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, text } : o)));
  }

  async function save() {
    setSaving(true);
    setErr('');
    const body: Record<string, unknown> = {
      content, difficulty, type,
      answer: answer || null,
      explanation: explanation.trim() || null,
    };
    if (type === 'multiple_choice') {
      body.options = options.filter((o) => ['A','B','C','D'].includes(o.key) && o.text.trim());
    } else if (type === 'true_false') {
      body.options = options.filter((o) => ['a','b','c','d'].includes(o.key) && o.text.trim());
    } else {
      body.options = null;
    }
    const res = await fetch(`/api/questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) {
      setErr(res.status === 409 ? 'Nội dung trùng với câu khác trong bank' : j.error ?? `Lỗi ${res.status}`);
      return;
    }
    onSave(j.question as Question);
  }

  async function del() {
    if (!window.confirm('Xoá câu hỏi này?')) return;
    const res = await fetch(`/api/questions/${q.id}`, { method: 'DELETE' });
    if (!res.ok) { setErr('Xoá thất bại'); return; }
    onDelete();
  }

  return (
    <div className="border-t px-3 pb-3 pt-2 bg-white space-y-2">
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="w-full border rounded px-2 py-1 text-sm" />
      <div className="flex gap-2 flex-wrap">
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="border rounded px-2 py-1 text-sm">
          <option value="biet">Biết</option>
          <option value="hieu">Hiểu</option>
          <option value="van_dung">Vận dụng</option>
          <option value="unclassified">Chưa phân loại</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as QuestionType)} className="border rounded px-2 py-1 text-sm">
          <option value="multiple_choice">Trắc nghiệm</option>
          <option value="short_answer">Trả lời ngắn</option>
          <option value="true_false">Đúng/Sai</option>
          <option value="essay">Tự luận</option>
        </select>
      </div>

      {/* Form đáp án theo loại câu */}
      {type === 'multiple_choice' && (
        <>
          <div className="grid grid-cols-2 gap-1">
            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <div key={key} className="flex gap-1 items-center">
                <span className="text-xs font-medium w-4">{key}.</span>
                <input
                  value={options.find((o) => o.key === key)?.text ?? ''}
                  onChange={(e) => updateOption(key, e.target.value)}
                  className="border rounded px-2 py-0.5 text-sm flex-1"
                  placeholder={`Phương án ${key}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500">Đáp án đúng:</span>
            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <label key={key} className="flex items-center gap-1 text-sm cursor-pointer">
                <input type="radio" name="mc-answer" value={key} checked={answer === key} onChange={() => setAnswer(key)} />
                {key}
              </label>
            ))}
            <button type="button" onClick={() => setAnswer('')} className="text-xs text-gray-400 hover:text-gray-600 ml-2">Xoá</button>
          </div>
        </>
      )}

      {type === 'true_false' && (
        <div className="space-y-1">
          {(['a', 'b', 'c', 'd'] as const).map((key) => {
            const stmt = options.find((o) => o.key === key);
            const verdict = parseTrueFalseAnswer(answer)[key] ?? '';
            return (
              <div key={key} className="flex gap-2 items-center">
                <span className="text-xs font-medium w-4 text-gray-500">{key})</span>
                <input
                  value={stmt?.text ?? ''}
                  onChange={(e) => updateOption(key, e.target.value)}
                  className="border rounded px-2 py-0.5 text-xs flex-1"
                  placeholder={`Mệnh đề ${key}`}
                />
                <select
                  value={verdict}
                  onChange={(e) => {
                    const map = parseTrueFalseAnswer(answer);
                    map[key] = e.target.value;
                    setAnswer(Object.entries(map).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(','));
                  }}
                  className="border rounded px-1.5 py-0.5 text-xs w-20 shrink-0"
                >
                  <option value="">--</option>
                  <option value="Đúng">Đúng</option>
                  <option value="Sai">Sai</option>
                </select>
              </div>
            );
          })}
        </div>
      )}

      {type === 'short_answer' && (
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 shrink-0">Đáp án:</span>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="vd: 10g, 3,14, 100V" className="border rounded px-2 py-1 text-sm flex-1" />
        </div>
      )}

      {type === 'essay' && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Đáp án / gợi ý (tuỳ chọn):</p>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Nhập ý chính của đáp án..." className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      )}
      <div>
        <p className="text-xs text-gray-500 mb-1">Lời giải (tuỳ chọn):</p>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={3}
          placeholder="Nhập lời giải..."
          className="w-full border rounded px-2 py-1 text-sm resize-none"
        />
      </div>
      {err && <p className="text-red-600 text-xs">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="bg-black text-white px-3 py-1 rounded text-sm disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button onClick={del} className="border border-red-300 text-red-600 px-3 py-1 rounded text-sm">Xoá</button>
        <button onClick={onCancel} className="border px-3 py-1 rounded text-sm text-gray-600">Huỷ</button>
      </div>
    </div>
  );
}

// ─── SourceFilesPanel ────────────────────────────────────────────────────────

interface SourceFile {
  id: string;
  filename: string;
  storage_path: string;
  status: string;
  created_at: string;
  questions: { count: number }[];
}

function SourceFilesPanel({ chapterId, refreshKey, onDeleted }: { chapterId: string; refreshKey: number; onDeleted: () => void }) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [modal, setModal] = useState<SourceFile | null>(null);
  const [cascade, setCascade] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState('');

  function refreshFiles() {
    fetch(`/api/source-files?chapter_id=${chapterId}`)
      .then((r) => r.json())
      .then((j) => { setFiles(j.source_files ?? []); });
  }

  useEffect(() => {
    if (!chapterId) return;
    refreshFiles();
  }, [chapterId, refreshKey]);

  useEffect(() => {
    if (!modal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal]);

  async function confirmDelete() {
    if (!modal) return;
    setDeleting(true);
    setModalError('');
    const res = await fetch(`/api/source-files/${modal.id}?cascade=${cascade}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) { setModalError(j.error ?? 'Xoá thất bại'); return; }
    setModal(null);
    onDeleted();
  }

  const STATUS_COLOR: Record<string, string> = {
    done: 'text-green-600', processing: 'text-yellow-600',
    failed: 'text-red-600', pending: 'text-gray-500',
  };

  if (files.length === 0 && !modal) return null;

  return (
    <div className="w-56 shrink-0">
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <p className="font-semibold text-gray-900 mb-2">Xoá file này?</p>
            <p className="text-sm font-medium text-gray-800 break-all mb-0.5">{modal.filename}</p>
            <p className="text-xs text-gray-400 mb-4">{modal.questions[0]?.count ?? 0} câu đã trích xuất từ file này</p>

            <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-sm text-gray-700">
                Xoá luôn các câu hỏi đi kèm
                <span className="block text-xs text-gray-400 mt-0.5">
                  Bỏ tick để giữ câu hỏi trong ngân hàng sau khi xoá file
                </span>
              </span>
            </label>

            {modalError && <p className="text-xs text-red-600 mb-3">{modalError}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setModal(null)}
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

      {files.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">File đã upload</p>
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id} className="bg-gray-50 border rounded p-2 text-xs overflow-hidden min-w-0">
                <p className="font-medium truncate" title={f.filename}>{f.filename}</p>
                <div className="flex justify-between items-center mt-1 text-gray-500">
                  <span>{f.questions[0]?.count ?? 0} câu</span>
                  <span className={STATUS_COLOR[f.status] ?? 'text-gray-500'}>{f.status}</span>
                </div>
                <p className="text-gray-400 mt-0.5">{new Date(f.created_at).toLocaleDateString('vi-VN')}</p>
                <div className="flex gap-2 mt-1">
                  <a href={`/source-files/${f.id}`} className="text-blue-600 hover:underline text-xs">Xem</a>
                  <button
                    onClick={() => { setModalError(''); setCascade(true); setModal(f); }}
                    className="text-red-500 hover:underline text-xs"
                  >
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

