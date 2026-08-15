// TEST ONLY — xóa sau khi verify Vercel serverless tương thích mathjax-node-svg2png
// Không dùng trong production

import { NextResponse } from 'next/server';
import mjAPI from 'mathjax-node-svg2png';

export const runtime = 'nodejs';
export const maxDuration = 30;

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mjAPI.config({ MathJax: {} });
  mjAPI.start();
  initialized = true;
}

export async function GET() {
  try {
    const t0 = Date.now();
    ensureInit();

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
      png_preview: `data:image/png;base64,${pngBase64}`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
