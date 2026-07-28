import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeContentHash } from '@/lib/dedup/hash';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const sb = supabaseAdmin();

  // Nếu sửa content → recompute content_hash
  if (body.content) {
    body.content_hash = computeContentHash(body.content);
  }

  const { data, error } = await sb
    .from('questions')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Câu này trùng với câu khác trong bank' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ question: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { error } = await sb.from('questions').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
