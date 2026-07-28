import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('chapters')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapters: data });
}

export async function POST(req: Request) {
  const { name, subject, description } = await req.json();
  if (!name) return NextResponse.json({ error: 'Thiếu name' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('chapters')
    .insert({ name, subject, description })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapter: data });
}
