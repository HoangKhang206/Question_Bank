// Shared component — hiển thị 1 câu hỏi với form phù hợp từng loại câu
import type { Question, QuestionOption } from '@/lib/types';
import katex from 'katex';

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function applyKatex(html: string): string {
  if (!html.includes('math-inline') && !html.includes('math-display')) return html;
  return html
    .replace(/<span class="math-display">\$\$([\s\S]*?)\$\$<\/span>/g, (_, formula) => {
      try {
        return katex.renderToString(decodeHtmlEntities(formula.trim()), { throwOnError: false, displayMode: true });
      } catch {
        return `<code>${formula}</code>`;
      }
    })
    .replace(/<span class="math-inline">\$([\s\S]*?)\$<\/span>/g, (_, formula) => {
      try {
        return katex.renderToString(decodeHtmlEntities(formula.trim()), { throwOnError: false, displayMode: false });
      } catch {
        return `<code>${formula}</code>`;
      }
    });
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  short_answer: 'Trả lời ngắn',
  true_false: 'Đúng/Sai',
  essay: 'Tự luận',
};
const DIFF_LABEL: Record<string, string> = {
  biet: 'Biết', hieu: 'Hiểu', van_dung: 'Vận dụng', unclassified: 'Chưa phân loại',
};
const DIFF_COLOR: Record<string, string> = {
  biet: 'bg-green-100 text-green-800',
  hieu: 'bg-yellow-100 text-yellow-800',
  van_dung: 'bg-red-100 text-red-800',
  unclassified: 'bg-gray-100 text-gray-500',
};

// Parse "a:Đúng,b:Sai,c:Đúng,d:Đúng" → {a:'Đúng', b:'Sai', ...}
function parseTrueFalseAnswer(answer: string | null): Record<string, string> {
  if (!answer) return {};
  const result: Record<string, string> = {};
  for (const part of answer.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key && val) result[key] = val;
  }
  return result;
}

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function OptionText({ text }: { text: string }) {
  if (text.includes('<')) {
    return (
      <span
        className="[&_.katex]:text-sm [&_img]:inline [&_img]:max-h-10 [&_img]:w-auto [&_img]:align-middle"
        dangerouslySetInnerHTML={{ __html: applyKatex(text) }}
      />
    );
  }
  return <span>{text}</span>;
}

function MultipleChoiceBody({ options, answer }: { options: QuestionOption[]; answer: string | null }) {
  return (
    <ul className="space-y-1 mt-2">
      {options.map((o) => {
        const correct = answer === o.key;
        return (
          <li
            key={o.key}
            className={`flex items-start gap-2 text-sm px-3 py-1.5 rounded ${
              correct ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-700'
            }`}
          >
            <span className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold ${
              correct ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'
            }`}>
              {o.key}
            </span>
            <OptionText text={o.text} />
          </li>
        );
      })}
    </ul>
  );
}

function TrueFalseBody({ options, answer }: { options: QuestionOption[]; answer: string | null }) {
  const answerMap = parseTrueFalseAnswer(answer);
  return (
    <ul className="space-y-1 mt-2">
      {options.map((o) => {
        const verdict = answerMap[o.key];
        const isDung = verdict === 'Đúng';
        const hasBadge = Boolean(verdict);
        return (
          <li key={o.key} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 text-gray-400 w-4">{o.key})</span>
            <span className="flex-1 text-gray-700"><OptionText text={o.text} /></span>
            {hasBadge && (
              <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                isDung ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {verdict}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ShortAnswerBody({ answer }: { answer: string | null }) {
  if (!answer) return null;
  return (
    <div className="mt-2 inline-flex items-center gap-2">
      <span className="text-xs text-gray-500">Đáp án:</span>
      <span className="bg-green-50 border border-green-200 text-green-800 text-sm font-medium px-3 py-1 rounded">
        {answer}
      </span>
    </div>
  );
}

function EssayBody({ answer }: { answer: string | null }) {
  if (!answer) return null;
  return (
    <div className="mt-2 bg-gray-50 border rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
      {answer}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  q: Question;
  index: number;
}

export default function QuestionCard({ q, index }: Props) {
  return (
    <li className="bg-white border rounded-lg p-4">
      {/* Badges */}
      <div className="flex gap-2 text-xs mb-2 flex-wrap">
        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">
          {TYPE_LABEL[q.type] ?? q.type}
        </span>
        <span className={`px-2 py-0.5 rounded font-medium ${DIFF_COLOR[q.difficulty] ?? 'bg-gray-100'}`}>
          {DIFF_LABEL[q.difficulty] ?? q.difficulty}
        </span>
        {q.tags?.map((t: string) => (
          <span key={t} className="px-2 py-0.5 bg-white border rounded text-gray-500">{t}</span>
        ))}
      </div>

      {/* Nội dung câu hỏi */}
      {q.content.trimStart().startsWith('<') ? (
        <>
          <p className="text-xs text-gray-400 mb-1">Câu {index + 1}.</p>
          <div
            className="text-sm text-gray-900
              [&_img]:max-h-52 [&_img]:w-auto [&_img]:rounded [&_img]:border [&_img]:my-1
              [&_table]:border-collapse [&_table]:w-full [&_table]:my-2 [&_table]:text-sm
              [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1
              [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50 [&_th]:font-medium"
            dangerouslySetInnerHTML={{ __html: applyKatex(q.content) }}
          />
        </>
      ) : (
        <p className="text-sm font-medium text-gray-900">
          <span className="text-gray-400 mr-1">Câu {index + 1}.</span>
          {q.content}
        </p>
      )}

      {/* Body theo type */}
      {q.type === 'multiple_choice' && q.options && q.options.length > 0 && (
        <MultipleChoiceBody options={q.options as QuestionOption[]} answer={q.answer} />
      )}
      {q.type === 'true_false' && q.options && q.options.length > 0 && (
        <TrueFalseBody options={q.options as QuestionOption[]} answer={q.answer} />
      )}
      {q.type === 'short_answer' && (
        <ShortAnswerBody answer={q.answer} />
      )}
      {q.type === 'essay' && (
        <EssayBody answer={q.answer} />
      )}

      {/* Fallback: multiple_choice không có options mà có answer */}
      {q.type === 'multiple_choice' && (!q.options || q.options.length === 0) && q.answer && (
        <p className="mt-2 text-sm text-green-700 font-medium">Đáp án: {q.answer}</p>
      )}
    </li>
  );
}
