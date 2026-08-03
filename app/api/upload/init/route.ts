// SP1 (Chunked Init): Parse docx WITH ảnh/bảng, lưu HTML lên Storage, trả source_file_id
// Input : FormData { file (.docx), chapter_id, structure, overwrite, auto_answer }
// Output: { source_file_id, total_questions_detected, precomputed_answers }
// Constraint: ≤10s. Không chạy SP2/SP3/SP4.
// HTML lưu tại sources/${chapterId}/${fileHash}.html để các chunk download về xử lý.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseDocx } from '@/lib/parse/docx';
import { extractAnswersAuto } from '@/lib/parse/answer-detect';
import { computeFileHash } from '@/lib/dedup/hash';
import type { QuestionRange } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

const QUESTION_MARKER = /^(?:Câu\s+)?(\d+)\s*[.):]/gm;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const chapterId = form.get('chapter_id') as string;
    const overwrite = form.get('overwrite') === 'true';
    const autoAnswer = form.get('auto_answer') === 'true';
    const structure = JSON.parse((form.get('structure') as string) ?? '[]') as QuestionRange[];

    if (!file || !chapterId) {
      return NextResponse.json({ error: 'Thiếu field' }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'File không được vượt quá 4 MB' }, { status: 413 });
    }
    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'Chunked upload chỉ hỗ trợ .docx' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const sb = supabaseAdmin();

    const { data: existing } = await sb
      .from('source_files')
      .select('id, status')
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existing && !overwrite) {
      return NextResponse.json({ error: 'FILE_EXISTS', existing_id: existing.id }, { status: 409 });
    }

    // Upload docx lên Storage
    const ext = file.name.split('.').pop() ?? 'bin';
    const storagePath = `sources/${chapterId}/${fileHash}.${ext}`;
    const { error: upErr } = await sb.storage
      .from('sources')
      .upload(storagePath, buffer, { upsert: true, contentType: file.type });
    if (upErr) throw new Error(`Storage upload: ${upErr.message}`);

    // SP1: Parse docx WITH ảnh/bảng (base64 inline)
    const { html, text } = await parseDocx(buffer);

    // Lưu HTML lên Storage để các chunk sau download về — tránh round-trip client
    const htmlPath = storagePath.replace(/\.[^.]+$/, '.html');
    const { error: htmlUpErr } = await sb.storage
      .from('sources')
      .upload(htmlPath, Buffer.from(html, 'utf-8'), {
        upsert: true,
        contentType: 'text/html; charset=utf-8',
      });
    if (htmlUpErr) throw new Error(`HTML Storage upload: ${htmlUpErr.message}`);

    // Tạo record source_files
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

    // Detect đáp án (non-AI).
    // autoAnswer=true → bỏ qua color scan (chậm trên file lớn), dùng underline+text.
    // autoAnswer=false → scan đầy đủ kể cả color XML.
    const precomputedAnswers: Record<string, string> = {};
    const detected = await extractAnswersAuto(autoAnswer ? null : buffer, html, text);
    if (detected.format !== 'none') {
      for (const [k, v] of detected.answers) precomputedAnswers[String(k)] = v;
    }

    const total_questions_detected = Array.from(text.matchAll(QUESTION_MARKER)).length;

    console.log(
      `[UPLOAD/INIT] ${file.name}: ${total_questions_detected} câu, ` +
      `${Object.keys(precomputedAnswers).length} đáp án detect được, ` +
      `html=${(html.length / 1024).toFixed(0)}KB`
    );

    return NextResponse.json({
      source_file_id: sourceRow.id,
      total_questions_detected,
      precomputed_answers: precomputedAnswers,
    });
  } catch (err) {
    console.error('[UPLOAD/INIT] fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
