/**
 * Normalizes LLM-typography in generated Python before execution. Models
 * (especially the fine-tuned GPT-OSS) sometimes emit German/typographic quotes
 * or non-breaking/zero-width spaces inside code, which Python rejects with
 * "SyntaxError: unterminated string literal" / "invalid non-printable
 * character". Dependency-free so the Pyodide worker can import it via the
 * `@gruenerator/chat/pyodide` entry.
 *
 * The character classes are BUILT FROM CODE POINTS (pure ASCII source) on
 * purpose: literal typographic characters do not reliably survive editors and
 * toolchains — an earlier literal U+00A0 in a regex was silently normalized to
 * a plain space, turning the replacement into a no-op with a vacuously green
 * test.
 *
 * Known tradeoff: replacement is global, so a legitimate typographic character
 * INSIDE a correctly quoted string literal (e.g. an NBSP in an Excel column
 * name) is normalized too. Broken-quote code fails 100% of the time; that
 * data-edge case is rare — we take the trade.
 */

function charClass(codePoints: number[]): RegExp {
  return new RegExp('[' + String.fromCharCode(...codePoints) + ']', 'g');
}

// U+201C/201D/201E/201F left/right/low/high double quotes, U+00AB/00BB guillemets
const DOUBLE_QUOTES = charClass([0x201c, 0x201d, 0x201e, 0x201f, 0x00ab, 0x00bb]);
// U+2018/2019/201A/201B left/right/low/high single quotes
const SINGLE_QUOTES = charClass([0x2018, 0x2019, 0x201a, 0x201b]);
// U+00A0 NBSP, U+202F narrow NBSP — not valid Python whitespace
const NON_BREAKING_SPACES = charClass([0x00a0, 0x202f]);
// U+200B/200C/200D zero-width space/non-joiner/joiner, U+FEFF BOM
const ZERO_WIDTH = charClass([0x200b, 0x200c, 0x200d, 0xfeff]);

export function sanitizePythonCode(code: string): string {
  return code
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(NON_BREAKING_SPACES, ' ')
    .replace(ZERO_WIDTH, '');
}
