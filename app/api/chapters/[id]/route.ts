// SP1 — PATCH rename / DELETE chapter (cascades to source_files → questions)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Thiếu name' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('chapters')
    .update({ name: name.trim() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapter: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  // Lấy paths trước khi cascade xoá source_files
  const { data: files } = await sb
    .from('source_files')
    .select('storage_path')
    .eq('chapter_id', params.id);

  const { error } = await sb.from('chapters').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cleanup Storage (best-effort)
  const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    await sb.storage.from('sources').remove(paths).catch((e) =>
      console.error('[DELETE chapter] Storage cleanup failed:', e)
    );
  }

  return NextResponse.json({ ok: true });
}
