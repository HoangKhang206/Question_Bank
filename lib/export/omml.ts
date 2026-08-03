// SP6 helper: LaTeX → OMML (Office Math Markup Language) cho export Word
// Strategy: recursive-descent parser trên LaTeX output của pipeline upload
// (chỉ cần parse các cấu trúc mà omml.ts của upload có thể sinh ra)
// Sau Packer.toBuffer, dùng JSZip thay placeholder text run bằng OMML XML

import JSZip from 'jszip';

export interface ExportMathEntry {
  placeholder: string;
  latex: string;
  display: boolean;
}

const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·',
  rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', Leftarrow: '⇐',
  rightleftharpoons: '⇌', leftrightarrow: '↔', Leftrightarrow: '⇔',
  uparrow: '↑', downarrow: '↓',
  infty: '∞', partial: '∂', nabla: '∇',
  alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ',
  delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', Theta: 'Θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', Lambda: 'Λ',
  mu: 'μ', nu: 'ν', xi: 'ξ', Xi: 'Ξ',
  pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', Phi: 'Φ',
  chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω',
  le: '≤', ge: '≥', leq: '≤', geq: '≥',
  neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  in: '∈', notin: '∉', ni: '∋',
  subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cap: '∩', cup: '∪', emptyset: '∅', varnothing: '∅',
  sum: 'Σ', prod: 'Π', int: '∫', oint: '∮',
  forall: '∀', exists: '∃',
  neg: '¬', land: '∧', lor: '∨',
  ldots: '…', cdots: '⋯',
  circ: '∘', perp: '⊥', parallel: '∥', angle: '∠',
};

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function findMatchingBrace(s: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { if (--depth === 0) return i; }
  }
  return s.length - 1;
}

function makeRun(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean ? `<m:r><m:t xml:space="preserve">${escXml(clean)}</m:t></m:r>` : '';
}

// Recursive descent: parse LaTeX string → OMML inner XML
function parseLatex(s: string): string {
  let result = '';
  let plainBuf = '';
  let i = 0;

  const flushPlain = () => {
    if (plainBuf.trim()) result += makeRun(plainBuf);
    plainBuf = '';
  };

  while (i < s.length) {
    const ch = s[i];

    // ── LaTeX command ────────────────────────────────────────────────────────
    if (ch === '\\') {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const cmd = s.slice(i + 1, j);
      i = j;

      if (cmd === 'frac') {
        flushPlain();
        const s1 = s.indexOf('{', i); if (s1 < 0) break;
        const e1 = findMatchingBrace(s, s1);
        const s2 = s.indexOf('{', e1 + 1); if (s2 < 0) { i = e1 + 1; break; }
        const e2 = findMatchingBrace(s, s2);
        result += `<m:f><m:num>${parseLatex(s.slice(s1 + 1, e1))}</m:num><m:den>${parseLatex(s.slice(s2 + 1, e2))}</m:den></m:f>`;
        i = e2 + 1;

      } else if (cmd === 'sqrt') {
        flushPlain();
        let deg = '';
        if (i < s.length && s[i] === '[') {
          const eb = s.indexOf(']', i);
          deg = s.slice(i + 1, eb);
          i = eb + 1;
        }
        const se = s.indexOf('{', i); if (se < 0) break;
        const ee = findMatchingBrace(s, se);
        const eLat = s.slice(se + 1, ee); i = ee + 1;
        const degEl = deg ? `<m:deg>${parseLatex(deg)}</m:deg>` : '<m:deg/>';
        result += `<m:rad>${degEl}<m:e>${parseLatex(eLat)}</m:e></m:rad>`;

      } else if (cmd === 'overline' || cmd === 'bar') {
        flushPlain();
        const se = s.indexOf('{', i); if (se < 0) break;
        const ee = findMatchingBrace(s, se);
        result += `<m:bar><m:e>${parseLatex(s.slice(se + 1, ee))}</m:e></m:bar>`;
        i = ee + 1;

      } else if (cmd === 'left') {
        flushPlain();
        const openCh = s[i] ?? '('; i++;
        const ri = s.indexOf('\\right', i);
        if (ri < 0) { plainBuf += openCh; continue; }
        const inner = s.slice(i, ri);
        i = ri + 6;
        const closeCh = s[i] ?? ')'; i++;
        result += `<m:d><m:dPr><m:begChr m:val="${escXml(openCh)}"/><m:endChr m:val="${escXml(closeCh)}"/></m:dPr><m:e>${parseLatex(inner)}</m:e></m:d>`;

      } else if (cmd === 'right') {
        // consumed by \left — skip the bracket
        i++;

      } else {
        const sym = SYMBOLS[cmd];
        if (sym) { flushPlain(); result += makeRun(sym); }
        // unknown: silently drop
      }

    // ── Braced group {…} possibly followed by ^{…} and/or _{…} ─────────────
    } else if (ch === '{') {
      const eg = findMatchingBrace(s, i);
      const groupContent = s.slice(i + 1, eg);
      i = eg + 1;

      let hasSup = false, hasSub = false, supLat = '', subLat = '';
      // Consume up to 2 modifiers (^ and/or _) in any order
      for (let round = 0; round < 2 && i < s.length; round++) {
        if (s[i] === '^' && !hasSup) {
          i++;
          if (i < s.length && s[i] === '{') {
            const em = findMatchingBrace(s, i); supLat = s.slice(i + 1, em); i = em + 1; hasSup = true;
          } else if (i < s.length) { supLat = s[i]; i++; hasSup = true; }
        } else if (s[i] === '_' && !hasSub) {
          i++;
          if (i < s.length && s[i] === '{') {
            const em = findMatchingBrace(s, i); subLat = s.slice(i + 1, em); i = em + 1; hasSub = true;
          } else if (i < s.length) { subLat = s[i]; i++; hasSub = true; }
        } else break;
      }

      flushPlain();
      const baseOmml = parseLatex(groupContent);

      if (hasSup && hasSub) {
        result += `<m:sSubSup><m:e>${baseOmml}</m:e><m:sub>${parseLatex(subLat)}</m:sub><m:sup>${parseLatex(supLat)}</m:sup></m:sSubSup>`;
      } else if (hasSup) {
        result += `<m:sSup><m:e>${baseOmml}</m:e><m:sup>${parseLatex(supLat)}</m:sup></m:sSup>`;
      } else if (hasSub) {
        result += `<m:sSub><m:e>${baseOmml}</m:e><m:sub>${parseLatex(subLat)}</m:sub></m:sSub>`;
      } else {
        result += baseOmml;
      }

    // ── Bare ^ or _ (not preceded by a braced group) ────────────────────────
    } else if (ch === '^' || ch === '_') {
      const base = plainBuf.slice(-1);
      plainBuf = plainBuf.slice(0, -1);
      flushPlain();
      const op = ch; i++;
      let modLat = '';
      if (i < s.length && s[i] === '{') {
        const em = findMatchingBrace(s, i); modLat = s.slice(i + 1, em); i = em + 1;
      } else if (i < s.length) { modLat = s[i]; i++; }
      const baseOmml = base ? makeRun(base) : '';
      const modOmml = parseLatex(modLat);
      result += op === '^'
        ? `<m:sSup><m:e>${baseOmml}</m:e><m:sup>${modOmml}</m:sup></m:sSup>`
        : `<m:sSub><m:e>${baseOmml}</m:e><m:sub>${modOmml}</m:sub></m:sSub>`;

    } else if (ch === '}') {
      i++; // unmatched — skip

    } else {
      plainBuf += ch;
      i++;
    }
  }

  flushPlain();
  return result;
}

// Public: convert LaTeX → full <m:oMath> element
export function latexToOmml(latex: string): string {
  return `<m:oMath xmlns:m="${MATH_NS}">${parseLatex(latex.trim())}</m:oMath>`;
}

// Post-process a docx buffer: replace __MATH_N__ / __DMATH_N__ text runs with OMML
export async function injectOmmlIntoDocx(
  buffer: Buffer,
  entries: ExportMathEntry[]
): Promise<Buffer> {
  if (entries.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) return buffer;

  let xml = await docFile.async('string');

  // Add m: namespace to document root if docx.js didn't include it
  if (!xml.includes('xmlns:m=')) {
    xml = xml.replace(/<w:document\b/, `<w:document xmlns:m="${MATH_NS}"`);
  }

  // Build placeholder → OMML map
  const ommlMap = new Map<string, string>();
  for (const { placeholder, latex, display } of entries) {
    const inner = parseLatex(latex.trim());
    ommlMap.set(
      placeholder,
      display
        ? `<m:oMathPara><m:oMath>${inner}</m:oMath></m:oMathPara>`
        : `<m:oMath>${inner}</m:oMath>`
    );
  }

  // Replace <w:r>...<w:t>__MATH_N__</w:t></w:r> → OMML
  // Pattern handles optional <w:rPr> between <w:r> and <w:t>
  xml = xml.replace(
    /<w:r\b[^>]*>\s*(?:<w:rPr[^>]*>[\s\S]*?<\/w:rPr>)?\s*<w:t[^>]*>(__D?MATH_\d+__)<\/w:t>\s*<\/w:r>/g,
    (match, placeholder) => ommlMap.get(placeholder) ?? match
  );

  zip.file('word/document.xml', xml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
