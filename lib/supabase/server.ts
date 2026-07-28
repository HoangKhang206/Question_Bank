// Server-side Supabase client. Chỉ dùng trong Route Handlers / Server Components.
// KHÔNG expose service role key ra client.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Next.js 14 extends fetch with caching by default — opt out để tránh stale data
        fetch: (url: RequestInfo | URL, init?: RequestInit) =>
          fetch(url, { ...init, cache: 'no-store' }),
      },
    }
  );
}
