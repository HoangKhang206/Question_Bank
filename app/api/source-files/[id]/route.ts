// DELETE /api/source-files/[id]
// ?cascade=true  → xoá questions liên kết trước, rồi xoá file (ON DELETE SET NULL không có hiệu lực vì đã xoá thủ công)
// ?cascade=false → chỉ xoá file; FK ON DELETE SET NULL tự null source_file_id trên questions
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const cascade = searchParams.get('cascade') === 'true';

  try {
    // Lấy storage_path để xoá file trên Storage
    const { data: row } = await sb
      .from('source_files')
      .select('storage_path')
      .eq('id', params.id)
      .maybeSingle();

    let deletedQuestions = 0;

    if (cascade) {
      // Đếm rồi xoá questions trước khi xoá source_file
      const { count } = await sb
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('source_file_id', params.id);
      deletedQuestions = count ?? 0;

      const { error: qErr } = await sb
        .from('questions')
        .delete()
        .eq('source_file_id', params.id);
      if (qErr) console.error('[SOURCE-FILES] xoá questions thất bại:', qErr.message);
    }
    // cascade=false: không làm gì thêm — FK ON DELETE SET NULL tự xử lý

    // Xoá row source_files
    const { error: delErr } = await sb
      .from('source_files')
      .delete()
      .eq('id', params.id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Xoá file Storage (best-effort)
    if (row?.storage_path) {
      const { error: storageErr } = await sb.storage
        .from('sources')
        .remove([row.storage_path]);
      if (storageErr) console.warn('[SOURCE-FILES] Storage remove failed:', storageErr.message);
    }

    return NextResponse.json({ ok: true, deleted_questions: deletedQuestions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[SOURCE-FILES] DELETE error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
