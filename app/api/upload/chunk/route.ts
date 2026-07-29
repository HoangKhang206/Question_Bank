// SP2-SP4 (Chunked): Segment + Classify + Batch Upsert for one text chunk
// Input : JSON { source_file_id, chunk_index, total_chunks, chunk_text, chunk_ranges,
//                precomputed_answers, auto_type, auto_answer }
// Output: { chunk_index, inserted, skipped_duplicate, unclassified }
// Constraint: ≤10s per chunk (~40 câu), Vercel Hobby.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { segmentQuestions } from '@/lib/parse/segment';
import { classifyAll, type ClassifyOptions } from '@/lib/gemini/classify';
import { computeContentHash } from '@/lib/dedup/hash';
import type { QuestionRange } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

interface ChunkBody {
  source_file_id: string;
  chunk_index: number;
  total_chunks: number;
  chunk_text: string;
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
      chunk_text,
      chunk_ranges,
      precomputed_answers,
      auto_type,
      auto_answer,
    } = body;

    const sb = supabaseAdmin();

    const { data: srcRow, error: srcErr } = await sb
      .from('source_files')
      .select('chapter_id')
      .eq('id', source_file_id)
      .single();
    if (srcErr || !srcRow) throw new Error(`source_file not found: ${source_file_id}`);

    const chapterId = (srcRow as { chapter_id: string }).chapter_id;

    const answersMap = new Map<number, string>(
      Object.entries(precomputed_answers).map(([k, v]) => [parseInt(k, 10), v])
    );

    const classifyOpts: ClassifyOptions = {
      autoType: auto_type,
      // If we have precomputed answers, disable AI answer generation (already extracted)
      autoAnswer: answersMap.size > 0 ? false : auto_answer,
    };

    // SP2: Segment (no html — chunked mode trades images for speed)
    const rawQuestions = segmentQuestions(
      chunk_text,
      chunk_ranges,
      answersMap.size > 0 ? answersMap : undefined
    );

    // SP3: Classify
    const classified = await classifyAll(rawQuestions, classifyOpts);

    // SP4: Batch upsert — ignoreDuplicates replaces the per-row insert loop
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
