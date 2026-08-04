// SP2-SP4 (Chunked): Segment + Classify + Batch Upsert cho một chunk câu hỏi
// Input : JSON { source_file_id, chunk_index, total_chunks, chunk_ranges,
//                precomputed_answers, auto_type, auto_answer }
// Output: { chunk_index, inserted, skipped_duplicate, unclassified }
// Constraint: ≤10s per chunk (~40 câu). HTML download từ Storage (~0.5s).
//
// Design: mỗi chunk download FULL HTML → segmentQuestions trên TOÀN BỘ text
// (đảm bảo PHẦN offset đúng) → slice allQuestions[i*N..(i+1)*N] để lấy phần của chunk.
// Không cắt text trước khi segment — tránh sai offset khi file có nhiều PHẦN.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { htmlToText } from '@/lib/parse/docx';
import { segmentQuestions } from '@/lib/parse/segment';
import { classifyAll, type ClassifyOptions } from '@/lib/gemini/classify';
import { computeContentHash } from '@/lib/dedup/hash';
import type { QuestionRange } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

const CHUNK_SIZE = 20;

interface ChunkBody {
  source_file_id: string;
  chunk_index: number;
  total_chunks: number;
  chunk_ranges: QuestionRange[];
  precomputed_answers: Record<string, string>;
  auto_type: boolean;
  auto_answer: boolean;
}

export async function POST(req: Request) {
  let chunkIndex = 0;
  try {
    const body = (await req.json()) as ChunkBody;
    chunkIndex = body.chunk_index;
    const {
      source_file_id,
      total_chunks,
      chunk_ranges,
      precomputed_answers,
      auto_type,
      auto_answer,
    } = body;

    const sb = supabaseAdmin();

    // Lấy chapter_id và storage_path từ source_files
    const { data: srcRow, error: srcErr } = await sb
      .from('source_files')
      .select('chapter_id, storage_path')
      .eq('id', source_file_id)
      .single();
    if (srcErr || !srcRow) throw new Error(`source_file not found: ${source_file_id}`);

    const { chapter_id: chapterId, storage_path: storagePath } = srcRow as {
      chapter_id: string;
      storage_path: string;
    };

    // Download full HTML từ Storage — init đã upload tại đây
    const htmlPath = storagePath.replace(/\.[^.]+$/, '.html');
    const { data: htmlBlob, error: dlErr } = await sb.storage.from('sources').download(htmlPath);
    if (dlErr) throw new Error(`HTML download: ${dlErr.message}`);
    const html = Buffer.from(await htmlBlob.arrayBuffer()).toString('utf-8');
    const text = htmlToText(html);

    const answersMap = new Map<number, string>(
      Object.entries(precomputed_answers).map(([k, v]) => [parseInt(k, 10), v])
    );

    const classifyOpts: ClassifyOptions = {
      autoType: auto_type,
      // Có đáp án sẵn → không cần AI sinh; không có → theo setting của user
      autoAnswer: answersMap.size > 0 ? false : auto_answer,
    };

    // SP2: Segment TOÀN BỘ text để PHẦN offset được tính đúng
    // Sau đó slice lấy phần của chunk này theo index (không cắt text trước)
    let allQuestions: ReturnType<typeof segmentQuestions> = [];
    try {
      allQuestions = segmentQuestions(
        text,
        chunk_ranges,
        answersMap.size > 0 ? answersMap : undefined,
        html
      );
    } catch (segErr) {
      console.warn(`[UPLOAD/CHUNK] segmentQuestions error: ${segErr}`);
      // allQuestions = [] → rawQuestions sẽ rỗng → return 0 counts
    }

    const startQ = chunkIndex * CHUNK_SIZE;
    const rawQuestions = allQuestions.slice(startQ, startQ + CHUNK_SIZE);

    // Chunk rỗng: xảy ra khi total_questions_detected > allQuestions.length
    if (rawQuestions.length === 0) {
      if (chunkIndex === total_chunks - 1) {
        await sb.from('source_files').update({ status: 'done' }).eq('id', source_file_id);
      }
      console.log(`[UPLOAD/CHUNK] ${chunkIndex + 1}/${total_chunks}: chunk rỗng, bỏ qua`);
      return NextResponse.json({ chunk_index: chunkIndex, inserted: 0, skipped_duplicate: 0, unclassified: 0 });
    }

    // SP3: Classify
    const classified = await classifyAll(rawQuestions, classifyOpts);

    // SP4: Batch upsert — ignoreDuplicates thay cho 400 insert tuần tự
    const rows = classified.map((q) => ({
      chapter_id: chapterId,
      source_file_id,
      question_number: q.number,
      type: q.type,
      difficulty: q.difficulty,
      content: q.html_content ?? q.raw_content,
      options: q.options ?? null,
      answer: q.answer ?? null,
      explanation: q.explanation ?? null,
      content_hash: computeContentHash(q.raw_content),
      tags: [],
    }));

    const unclassified = classified.filter((q) => q.difficulty === 'unclassified').length;

    const { data, error: upsertErr } = await sb
      .from('questions')
      .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
      .select('id');

    if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

    const inserted = data?.length ?? 0;
    const skipped_duplicate = rows.length - inserted;

    if (chunkIndex === total_chunks - 1) {
      await sb.from('source_files').update({ status: 'done' }).eq('id', source_file_id);
    }

    console.log(
      `[UPLOAD/CHUNK] ${chunkIndex + 1}/${total_chunks}: ` +
      `câu ${startQ + 1}–${startQ + rawQuestions.length} → ` +
      `${inserted} inserted, ${skipped_duplicate} dup, ${unclassified} unclassified`
    );

    return NextResponse.json({ chunk_index: chunkIndex, inserted, skipped_duplicate, unclassified });
  } catch (err) {
    console.error(`[UPLOAD/CHUNK] chunk ${chunkIndex} fatal:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown', chunk_index: chunkIndex },
      { status: 500 }
    );
  }
}
