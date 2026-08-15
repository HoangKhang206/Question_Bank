import mjAPI from 'mathjax-node-svg2png';
import fs from 'fs';

mjAPI.config({ MathJax: {} });
mjAPI.start();

const testCases = [
  { name: 'simple',              latex: 'K_c = \\frac{[CO_2][H_2]}{[CO][H_2O]}' },
  { name: 'chem',                latex: 'N_2 + 3H_2 \\rightleftharpoons 2NH_3' },
  { name: 'complex',             latex: '\\begin{array}{l}{n_{H^+}} = ({10^{-1}} - {10^{-2}}) \\times 10 \\times {10^{-3}}\\end{array}' },
  { name: 'edge_arrow_condition',latex: '\\underset{H_2SO_4(đặc)}{\\overset{t^0}{\\rightleftharpoons}}' },
];

async function main() {
  for (const tc of testCases) {
    try {
      const t0 = Date.now();
      const result = await mjAPI.typeset({
        math: tc.latex,
        format: 'TeX',
        png: true,
        scale: 2,
      });
      const buf = Buffer.from(
        (result.png as string).replace(/^data:image\/png;base64,/, ''),
        'base64'
      );
      fs.writeFileSync(`/tmp/test-${tc.name}.png`, buf);
      console.log(`✓ ${tc.name}: ${Date.now() - t0}ms, ${buf.length} bytes`);
    } catch (err) {
      console.error(`✗ ${tc.name}: FAILED`, err);
    }
  }
}

main().catch(console.error);
