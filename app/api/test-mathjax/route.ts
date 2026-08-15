// TEST ONLY — xóa sau khi verify Vercel serverless tương thích mathjax-node-svg2png

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;
// Bắt buộc: ngăn Next.js thử static-generate route này lúc build (gây timeout)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const t0 = Date.now();

    // Dynamic import để tránh init MathJax lúc build
    const mjAPI = (await import('mathjax-node-svg2png')).default;
    mjAPI.config({ MathJax: {} });
    mjAPI.start();

    const result = await mjAPI.typeset({
      math: 'K_c = \\frac{[CO_2][H_2]}{[CO][H_2O]}',
      format: 'TeX',
      png: true,
      scale: 2,
    });

    const elapsed = Date.now() - t0;
    const pngBase64 = (result.png as string).replace(/^data:image\/png;base64,/, '');
    const bytes = Buffer.from(pngBase64, 'base64').length;

    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsed,
      png_bytes: bytes,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
