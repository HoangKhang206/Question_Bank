// SP1 helper: Chuyển đổi OMML (Office Math Markup Language) → LaTeX string
// Input : chuỗi XML chứa <m:oMath>...</m:oMath>
// Output: chuỗi LaTeX tương ứng (chưa render)
// Strategy: inside-out regex replacement, tối đa 30 vòng cho đến khi ổn định

const PROP_TAGS = ['fPr', 'radPr', 'sSupPr', 'sSubPr', 'sSubSupPr', 'dPr', 'naryPr', 'limLowPr', 'limUppPr', 'eqArrPr', 'groupChrPr', 'barPr', 'boxPr', 'borderBoxPr', 'phant', 'phantPr', 'rPr', 'rSp', 'rSpRule', 'cGp', 'cGpRule', 'cSp', 'ctrlPr', 'mcPr', 'mrPr'];
const PROP_RE = new RegExp(`<m:(?:${PROP_TAGS.join('|')})[^>]*>(?:[\\s\\S]*?)<\\/m:(?:${PROP_TAGS.join('|')})>`, 'gi');

function unescXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Apply a single transform pass, returns new string
function applyPass(s: string): string {
  // 1. Normalize self-closing m: tags
  s = s.replace(/<(m:\w+)([^>]*?)\/>/gi, '<$1$2></$1>');

  // 2. Strip property elements (must come before leaf transforms)
  for (let i = 0; i < 3; i++) {
    s = s.replace(PROP_RE, '');
  }

  // 3. m:t → text (unescape XML entities)
  s = s.replace(/<m:t(?:\s[^>]*)?>([^<]*)<\/m:t>/gi, (_, t) => unescXml(t));

  // 4. m:r → unwrap (only when all children are plain text)
  s = s.replace(/<m:r(?:\s[^>]*)?>((?:(?!<m:)[\s\S])*?)<\/m:r>/gi, '$1');

  // 5. m:f → \frac{num}{den}
  s = s.replace(
    /<m:f(?:\s[^>]*)?>[\s\S]*?<m:num(?:\s[^>]*)?>([\s\S]*?)<\/m:num>[\s\S]*?<m:den(?:\s[^>]*)?>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/gi,
    (_, num, den) => `\\frac{${num.trim()}}{${den.trim()}}`
  );

  // 6. m:sSup → base^{sup}  (requires no nested m: in base/sup — handled by inside-out)
  s = s.replace(
    /<m:sSup(?:\s[^>]*)?>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup(?:\s[^>]*)?>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/gi,
    (_, base, sup) => `{${base.trim()}}^{${sup.trim()}}`
  );

  // 7. m:sSub → base_{sub}
  s = s.replace(
    /<m:sSub(?:\s[^>]*)?>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub(?:\s[^>]*)?>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/gi,
    (_, base, sub) => `{${base.trim()}}_{${sub.trim()}}`
  );

  // 8. m:sSubSup → base_{sub}^{sup}
  s = s.replace(
    /<m:sSubSup(?:\s[^>]*)?>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub(?:\s[^>]*)?>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup(?:\s[^>]*)?>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSubSup>/gi,
    (_, base, sub, sup) => `{${base.trim()}}_{${sub.trim()}}^{${sup.trim()}}`
  );

  // 9. m:rad — with or without degree
  s = s.replace(
    /<m:rad(?:\s[^>]*)?>[\s\S]*?<m:deg(?:\s[^>]*)?>([\s\S]*?)<\/m:deg>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/gi,
    (_, deg, e) => {
      const d = deg.trim();
      return d ? `\\sqrt[${d}]{${e.trim()}}` : `\\sqrt{${e.trim()}}`;
    }
  );

  // 10. m:d → parenthesized expression (use begStr/endStr from m:dPr if available — stripped above, so use plain parens)
  s = s.replace(
    /<m:d(?:\s[^>]*)?>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:d>/gi,
    (_, e) => `\\left(${e.trim()}\\right)`
  );

  // 11. m:nary (integral, sum, product)
  s = s.replace(
    /<m:nary(?:\s[^>]*)?>[\s\S]*?<m:sub(?:\s[^>]*)?>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup(?:\s[^>]*)?>([\s\S]*?)<\/m:sup>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:nary>/gi,
    (_, sub, sup, e) => `\\int_{${sub.trim()}}^{${sup.trim()}}{${e.trim()}}`
  );

  // 12. m:limLow (limit below)
  s = s.replace(
    /<m:limLow(?:\s[^>]*)?>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<m:lim(?:\s[^>]*)?>([\s\S]*?)<\/m:lim>[\s\S]*?<\/m:limLow>/gi,
    (_, e, lim) => `{${e.trim()}}_{${lim.trim()}}`
  );

  // 13. m:bar (overline)
  s = s.replace(
    /<m:bar(?:\s[^>]*)?>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:bar>/gi,
    (_, e) => `\\overline{${e.trim()}}`
  );

  // 14. m:func (function name + arg)
  s = s.replace(
    /<m:func(?:\s[^>]*)?>[\s\S]*?<m:fName(?:\s[^>]*)?>([\s\S]*?)<\/m:fName>[\s\S]*?<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:func>/gi,
    (_, name, e) => `${name.trim()}{${e.trim()}}`
  );

  // 15. m:eqArr (equation array) → just concatenate with \\
  s = s.replace(
    /<m:e(?:\s[^>]*)?>([\s\S]*?)<\/m:e>/gi,
    (_, e) => e.trim()
  );

  // 16. Unwrap remaining structural containers
  for (const tag of ['oMathPara', 'oMath', 'mr', 'mc', 'mcs', 'eqArr', 'groupChr', 'box', 'borderBox', 'acc']) {
    const re = new RegExp(`<m:${tag}(?:\\s[^>]*)?>((?:[\\s\\S](?!<m:${tag}))*?)<\\/m:${tag}>`, 'gi');
    s = s.replace(re, '$1');
  }

  return s;
}

export function ommlToLatex(omml: string): string {
  let s = omml;
  for (let pass = 0; pass < 30; pass++) {
    const prev = s;
    s = applyPass(s);
    if (s === prev) break;
  }
  // Strip any remaining m: tags
  s = s.replace(/<\/?m:[^>]*>/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Extract all <m:oMathPara> and <m:oMath> blocks from Word XML,
// return array of { placeholder, latex, display }
export interface MathEntry {
  placeholder: string;
  latex: string;
  display: boolean; // true = display (block), false = inline
}

export function extractOmmlBlocks(xml: string): { processedXml: string; mathEntries: MathEntry[] } {
  const entries: MathEntry[] = [];
  let idx = 0;
  let processed = xml;

  // Display math: <m:oMathPara> blocks
  processed = processed.replace(/<m:oMathPara(?:\s[^>]*)?>[\s\S]*?<\/m:oMathPara>/gi, (match) => {
    const latex = ommlToLatex(match);
    const placeholder = `__DMATH_${idx}__`;
    entries.push({ placeholder, latex, display: true });
    idx++;
    // Replace with a Word text run so mammoth can see it
    return `<w:p><w:r><w:t>${placeholder}</w:t></w:r></w:p>`;
  });

  // Inline math: remaining <m:oMath> blocks
  processed = processed.replace(/<m:oMath(?:\s[^>]*)?>[\s\S]*?<\/m:oMath>/gi, (match) => {
    const latex = ommlToLatex(match);
    const placeholder = `__MATH_${idx}__`;
    entries.push({ placeholder, latex, display: false });
    idx++;
    return `<w:r><w:t>${placeholder}</w:t></w:r>`;
  });

  return { processedXml: processed, mathEntries: entries };
}

// Post-process mammoth HTML: replace __MATH_N__ and __DMATH_N__ with <span class="math-*">
export function replaceMathPlaceholders(html: string, entries: MathEntry[]): string {
  let out = html;
  for (const { placeholder, latex, display } of entries) {
    const cls = display ? 'math-display' : 'math-inline';
    const escaped = latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const delimOpen = display ? '$$' : '$';
    const delimClose = display ? '$$' : '$';
    out = out.replace(
      placeholder,
      `<span class="${cls}">${delimOpen}${escaped}${delimClose}</span>`
    );
  }
  return out;
}
