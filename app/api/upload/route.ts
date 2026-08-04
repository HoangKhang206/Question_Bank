// Endpoint upload đề — chạy nguyên pipeline SP1→SP4.
// Timeout Vercel Hobby = 10s → không xử lý file có >60 câu trong 1 request.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseDocx } from '@/lib/parse/docx';
import { segmentQuestions } from '@/lib/parse/segment';
import { extractAnswersAuto } from '@/lib/parse/answer-detect';
import { extractAnswersWithAI } from '@/lib/gemini/extract-answers';
import { classifyAll, type ClassifyOptions } from '@/lib/gemini/classify';
import { computeFileHash, computeContentHash } from '@/lib/dedup/hash';
import type { QuestionRange } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const chapterId = form.get('chapter_id') as string;
    const overwrite = form.get('overwrite') === 'true';
    const autoType = form.get('auto_type') === 'true';
    const autoAnswer = form.get('auto_answer') === 'true';
    const classifyOpts: ClassifyOptions = { autoType, autoAnswer };

    // Khi auto_type: không cần user khai báo range — dùng catch-all
    const structure = autoType
      ? [{ from: 1, to: 9999, type: 'multiple_choice' as const }]
      : JSON.parse((form.get('structure') as string) ?? '[]') as QuestionRange[];

    if (!file || !chapterId) {
      return NextResponse.json({ error: 'Thiếu field' }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'File không được vượt quá 4 MB' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const sb = supabaseAdmin();

    // Feature #14: idempotent — check hash trùng
    const { data: existing } = await sb
      .from('source_files')
      .select('id, status')
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existing && !overwrite) {
      return NextResponse.json(
        { error: 'FILE_EXISTS', existing_id: existing.id },
        { status: 409 }
      );
    }

    // Feature #2: upload lên Storage
    const ext = file.name.split('.').pop() ?? 'bin';
    const storagePath = `sources/${chapterId}/${fileHash}.${ext}`;
    const { error: upErr } = await sb.storage
      .from('sources')
      .upload(storagePath, buffer, { upsert: true, contentType: file.type });
    if (upErr) throw new Error(`Storage upload: ${upErr.message}`);

    // Tạo record source_files (upsert theo file_hash để idempotent)
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
          status: 'processing'
        },
        { onConflict: 'file_hash' }
      )
      .select()
      .single();
    if (srcErr) throw new Error(`Insert source_files: ${srcErr.message}`);

    // SP1: Parse — hỗ trợ .docx và .pdf (copy được)
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
      return NextResponse.json({ error: 'Chỉ hỗ trợ .docx và .pdf' }, { status: 400 });
    }

    // Tìm đáp án: AI (mặc định) hoặc format detection (khi user bỏ tick)
    let precomputedAnswers: Map<number, string> | undefined;
    if (autoAnswer) {
      // AI path: đọc đáp án từ file, nếu không có thì classifyAll sẽ sinh đáp án
      const aiAnswers = await extractAnswersWithAI(text);
      if (aiAnswers !== null) {
        precomputedAnswers = aiAnswers;
        classifyOpts.autoAnswer = false; // đã có đáp án, không cần sinh
        console.log(`[UPLOAD] AI tìm được ${aiAnswers.size} đáp án trong file`);
      } else {
        classifyOpts.autoAnswer = true; // không có → để classifyAll sinh đáp án
        console.log('[UPLOAD] AI: file không có đáp án → sẽ sinh đáp án');
      }
    } else {
      // Fast path: format detection không dùng AI
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

    // SP2: Segment (truyền html để gán html_content cho câu có ảnh)
    const rawQuestions = segmentQuestions(text, structure, precomputedAnswers, html || undefined);
    console.log('[UPLOAD] SP2 rawQuestions.length:', rawQuestions.length);

    // SP3: Classify (đã có fallback bên trong)
    const classified = await classifyAll(rawQuestions, classifyOpts);

    // SP4: Dedup + Insert
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
        tags: []
      });

      if (error) {
        if (error.code === '23505') skippedDup++; // unique_violation
        else console.error('[UPLOAD] insert failed:', error);
      } else {
        inserted++;
      }
    }

    await sb
      .from('source_files')
      .update({ status: 'done' })
      .eq('id', sourceRow.id);

    return NextResponse.json({
      source_file_id: sourceRow.id,
      total: classified.length,
      inserted,
      skipped_duplicate: skippedDup,
      unclassified: unclassifiedCount
    });
  } catch (err) {
    console.error('[UPLOAD] fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
