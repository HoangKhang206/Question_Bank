// Endpoint upload đề — pipeline SP1→SP4 với streaming NDJSON progress.
// Client đọc từng dòng JSON để hiển thị progress realtime.

import { supabaseAdmin } from '@/lib/supabase/server';
import { parseDocx } from '@/lib/parse/docx';
import { segmentQuestions } from '@/lib/parse/segment';
import { extractAnswersAuto } from '@/lib/parse/answer-detect';
import { extractAnswersWithAI } from '@/lib/gemini/extract-answers';
import { classifyAll, type ClassifyOptions } from '@/lib/gemini/classify';
import { computeFileHash, computeContentHash } from '@/lib/dedup/hash';
import type { QuestionRange } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (data: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        } catch {
          // client đã đóng kết nối
        }
      };

      try {
        const form = await req.formData();
        const file = form.get('file') as File | null;
        const chapterId = form.get('chapter_id') as string;
        const overwrite = form.get('overwrite') === 'true';
        const autoType = form.get('auto_type') === 'true';
        const autoAnswer = form.get('auto_answer') === 'true';
        const classifyOpts: ClassifyOptions = { autoType, autoAnswer };

        const structure = autoType
          ? [{ from: 1, to: 9999, type: 'multiple_choice' as const }]
          : JSON.parse((form.get('structure') as string) ?? '[]') as QuestionRange[];

        if (!file || !chapterId) {
          push({ step: 'error', error: 'Thiếu field' });
          return;
        }
        if (file.size > 4 * 1024 * 1024) {
          push({ step: 'error', error: 'File không được vượt quá 4 MB' });
          return;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileHash = computeFileHash(buffer);
        const sb = supabaseAdmin();

        // Idempotent — check hash trùng
        const { data: existing } = await sb
          .from('source_files')
          .select('id, status')
          .eq('file_hash', fileHash)
          .maybeSingle();

        if (existing && !overwrite) {
          push({ step: 'file_exists', existing_id: existing.id });
          return;
        }

        // Upload lên Storage
        const ext = file.name.split('.').pop() ?? 'bin';
        const storagePath = `sources/${chapterId}/${fileHash}.${ext}`;
        const { error: upErr } = await sb.storage
          .from('sources')
          .upload(storagePath, buffer, { upsert: true, contentType: file.type });
        if (upErr) throw new Error(`Storage upload: ${upErr.message}`);

        const { data: sourceRow, error: srcErr } = await sb
          .from('source_files')
          .upsert(
            {
              chapter_id: chapterId,
              filename: file.name,
              storage_path: storagePath,
              file_hash: fileHash,
              file_size: buffer.length,
              mime_type: file.type,
              structure,
              status: 'processing',
            },
            { onConflict: 'file_hash' }
          )
          .select()
          .single();
        if (srcErr) throw new Error(`Insert source_files: ${srcErr.message}`);

        // SP1: Parse
        push({ step: 'parsing' });
        let text: string;
        let html = '';
        if (file.name.endsWith('.docx')) {
          ({ html, text } = await parseDocx(buffer));
        } else if (file.name.endsWith('.pdf')) {
          const { parsePdf } = await import('@/lib/parse/pdf');
          text = await parsePdf(buffer);
        } else {
          await sb
            .from('source_files')
            .update({ status: 'failed', error_log: 'Chỉ hỗ trợ .docx và .pdf' })
            .eq('id', sourceRow.id);
          push({ step: 'error', error: 'Chỉ hỗ trợ .docx và .pdf' });
          return;
        }

        // Tìm đáp án
        push({ step: 'answers' });
        let precomputedAnswers: Map<number, string> | undefined;
        if (autoAnswer) {
          const aiAnswers = await extractAnswersWithAI(text);
          if (aiAnswers !== null) {
            precomputedAnswers = aiAnswers;
            classifyOpts.autoAnswer = false;
            console.log(`[UPLOAD] AI tìm được ${aiAnswers.size} đáp án`);
          } else {
            classifyOpts.autoAnswer = true;
            console.log('[UPLOAD] AI: không có đáp án → sẽ sinh đáp án');
          }
        } else {
          const detected = await extractAnswersAuto(
            file.name.endsWith('.docx') ? buffer : null,
            html,
            text
          );
          if (detected.format !== 'none') {
            precomputedAnswers = detected.answers;
            console.log(`[UPLOAD] format=${detected.format}, ${detected.answers.size} đáp án`);
          }
          classifyOpts.autoAnswer = false;
        }

        // SP2: Segment
        const rawQuestions = segmentQuestions(text, structure, precomputedAnswers, html || undefined);
        push({ step: 'classifying', classified: 0, total: rawQuestions.length });

        // SP3: Classify với streaming progress
        const classified = await classifyAll(rawQuestions, classifyOpts, (done, total) => {
          push({ step: 'classifying', classified: done, total });
        });

        // SP4: Dedup + Insert
        push({ step: 'saving' });
        let inserted = 0;
        let skippedDup = 0;
        let unclassifiedCount = 0;

        for (const q of classified) {
          const content_hash = computeContentHash(q.raw_content);
          if (q.difficulty === 'unclassified') unclassifiedCount++;

          const { error } = await sb.from('questions').insert({
            chapter_id: chapterId,
            source_file_id: sourceRow.id,
            question_number: q.number,
            type: q.type,
            difficulty: q.difficulty,
            content: q.html_content ?? q.raw_content,
            options: q.options ?? null,
            answer: q.answer ?? null,
            explanation: q.explanation ?? null,
            content_hash,
            tags: [],
          });

          if (error) {
            if (error.code === '23505') skippedDup++;
            else console.error('[UPLOAD] insert failed:', error);
          } else {
            inserted++;
          }
        }

        await sb.from('source_files').update({ status: 'done' }).eq('id', sourceRow.id);

        push({
          step: 'done',
          data: {
            source_file_id: sourceRow.id,
            total: classified.length,
            inserted,
            skipped_duplicate: skippedDup,
            unclassified: unclassifiedCount,
          },
        });
      } catch (err) {
        console.error('[UPLOAD] fatal:', err);
        push({ step: 'error', error: err instanceof Error ? err.message : 'Unknown' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
