// SP2-SP4 (Chunked): Segment + Classify + Batch Upsert cho một chunk câu hỏi
// Input : JSON { source_file_id, chunk_index, total_chunks, chunk_ranges,
//                precomputed_answers, auto_type, auto_answer }
// Output: { chunk_index, inserted, skipped_duplicate, unclassified }
// Constraint: ≤10s per chunk (~40 câu). HTML download từ Storage (~0.5s).
// Ảnh và bảng được giữ nguyên — chunk download full HTML rồi tự cắt phần của mình.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { htmlToText } from '@/lib/parse/docx';
import { segmentQuestions } from '@/lib/parse/segment';
import { classifyAll, type ClassifyOptions } from '@/lib/gemini/classify';
import { computeContentHash } from '@/lib/dedup/hash';
import type { QuestionRange } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

const QUESTION_MARKER_RE = /^(?:Câu\s+)?(\d+)\s*[.):]/gm;
const CHUNK_SIZE = 40;

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

    // Download HTML (có ảnh/bảng) từ Storage — init đã upload tại đây
    const htmlPath = storagePath.replace(/\.[^.]+$/, '.html');
    const { data: htmlBlob, error: dlErr } = await sb.storage.from('sources').download(htmlPath);
    if (dlErr) throw new Error(`HTML download: ${dlErr.message}`);
    const html = Buffer.from(await htmlBlob.arrayBuffer()).toString('utf-8');

    // Tìm vị trí các câu hỏi trong plain text để cắt chunk
    const text = htmlToText(html);
    const markerIndices: number[] = [];
    for (const m of text.matchAll(QUESTION_MARKER_RE)) {
      markerIndices.push(m.index!);
    }

    const startIdx = markerIndices[chunkIndex * CHUNK_SIZE];
    const endIdx = markerIndices[(chunkIndex + 1) * CHUNK_SIZE] ?? text.length;

    // Chunk này không có câu nào (xảy ra nếu total_chunks tính dư)
    if (startIdx === undefined) {
      if (chunkIndex === total_chunks - 1) {
        await sb.from('source_files').update({ status: 'done' }).eq('id', source_file_id);
      }
      return NextResponse.json({ chunk_index: chunkIndex, inserted: 0, skipped_duplicate: 0, unclassified: 0 });
    }

    const chunk_text = text.slice(startIdx, endIdx);

    const answersMap = new Map<number, string>(
      Object.entries(precomputed_answers).map(([k, v]) => [parseInt(k, 10), v])
    );

    const classifyOpts: ClassifyOptions = {
      autoType: auto_type,
      // Có đáp án sẵn → không cần AI sinh; không có → theo setting của user
      autoAnswer: answersMap.size > 0 ? false : auto_answer,
    };

    // SP2: Segment — truyền full html để giữ ảnh/bảng cho câu trong chunk này
    const rawQuestions = segmentQuestions(chunk_text, chunk_ranges, answersMap.size > 0 ? answersMap : undefined, html);

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
      `${rawQuestions.length} câu → ${inserted} inserted, ${skipped_duplicate} dup, ${unclassified} unclassified`
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
