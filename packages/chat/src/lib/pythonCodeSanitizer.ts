/**
 * Normalizes LLM-typography in generated Python before execution. Models
 * (especially the fine-tuned GPT-OSS) sometimes emit German/typographic quotes
 * („…", "…", ‚…') or non-breaking/zero-width spaces inside code, which Python
 * rejects with "SyntaxError: unterminated string literal". Dependency-free so
 * the Pyodide worker can import it via the `@gruenerator/chat/pyodide` entry.
 */
export function sanitizePythonCode(code: string): string {
  return (
    code
      // Double-quote variants: “ ” „ ‟ « »
      .replace(/[“”„‟«»]/g, '"')
      // Single-quote variants: ‘ ’ ‚ ‛
      .replace(/[‘’‚‛]/g, "'")
      // Non-breaking space is not valid Python whitespace
      .replace(/ /g, ' ')
      // Zero-width characters and BOM
      .replace(/[​‌‍﻿]/g, '')
  );
}
