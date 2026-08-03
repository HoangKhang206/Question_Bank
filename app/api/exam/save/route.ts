import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const { name, config, question_ids, notes } = await req.json();

    if (!name || !config || !question_ids) {
      return NextResponse.json({ error: 'Thiếu field' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('exams')
      .insert({ name, config, question_ids, notes })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ exam: data });
  } catch (err) {
    console.error('[EXAM SAVE] fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
