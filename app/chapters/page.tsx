// Server Component: fetch danh sách chương, giao cho client component render.

export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase/server';
import ChapterView from './chapter-view';
import type { Chapter } from '@/lib/types';

export default async function ChaptersPage() {
  const sb = supabaseAdmin();
  const { data: chapters, error } = await sb.from('chapters').select('*').order('name');
  console.log('[chapters] data:', chapters, 'error:', error);
  if (error) {
    return <p className="text-red-600 p-4">Lỗi Supabase: {error.message}</p>;
  }
  return <ChapterView chapters={(chapters as Chapter[]) ?? []} />;
}
