declare module 'mathjax-node-svg2png' {
  interface TypesetOptions {
    math: string;
    format: 'TeX' | 'MathML' | 'AsciiMath';
    png?: boolean;
    svg?: boolean;
    scale?: number;
  }
  interface TypesetResult {
    png?: string;
    svg?: string;
    errors?: string[];
  }
  function config(opts: { MathJax: object }): void;
  function start(): void;
  function typeset(opts: TypesetOptions): Promise<TypesetResult>;
  export { config, start, typeset };
  const _default: { config: typeof config; start: typeof start; typeset: typeof typeset };
  export default _default;
}
