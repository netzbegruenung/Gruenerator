/**
 * A small syntax highlighter for chat code blocks.
 *
 * Web highlights with shiki, which loads a WASM grammar engine — reasonable in a
 * browser tab, not in a React Native bundle that already fights for size (see
 * `mobile-bundle-size`). This is the deliberate other end: four token kinds, no
 * dependency, one pass over the string.
 *
 * It is a *reader's* highlighter, not a compiler's. It will colour a keyword
 * inside a template literal wrong, and it does not know about JSX. What it gets
 * right is the thing that makes code scannable on a phone: comments recede,
 * strings and numbers stand out, keywords carry weight.
 */

export type TokenKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword';

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

/** Normalises the fence's info string to a language family. */
export type CodeLanguage = 'js' | 'python' | 'json' | 'shell' | 'sql' | 'plain';

const LANGUAGE_ALIASES: Record<string, CodeLanguage> = {
  js: 'js',
  jsx: 'js',
  javascript: 'js',
  ts: 'js',
  tsx: 'js',
  typescript: 'js',
  py: 'python',
  python: 'python',
  json: 'json',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shell: 'shell',
  console: 'shell',
  sql: 'sql',
};

export function normalizeLanguage(info: string | undefined | null): CodeLanguage {
  if (!info) return 'plain';
  const first = info.trim().toLowerCase().split(/\s+/)[0] ?? '';
  return LANGUAGE_ALIASES[first] ?? 'plain';
}

const JS_KEYWORDS =
  'const let var function return if else for while break continue class extends new this typeof instanceof import export from default async await try catch finally throw switch case null undefined true false interface type enum implements public private readonly static of in delete void yield';
const PYTHON_KEYWORDS =
  'def return if elif else for while break continue class import from as pass raise try except finally with lambda global nonlocal yield assert del and or not is None True False async await in';
const SHELL_KEYWORDS =
  'if then else elif fi for while do done case esac function return export local echo cd exit set unset source';
const SQL_KEYWORDS =
  'select from where insert into values update set delete create table alter drop join left right inner outer on group by order limit offset having union all as distinct and or not null is count sum avg min max';
const JSON_KEYWORDS = 'true false null';

const KEYWORDS: Record<CodeLanguage, ReadonlySet<string>> = {
  js: new Set(JS_KEYWORDS.split(' ')),
  python: new Set(PYTHON_KEYWORDS.split(' ')),
  shell: new Set(SHELL_KEYWORDS.split(' ')),
  sql: new Set(SQL_KEYWORDS.split(' ')),
  json: new Set(JSON_KEYWORDS.split(' ')),
  plain: new Set<string>(),
};

/** Line-comment openers per family. JSON has none — `//` in JSON is data. */
const LINE_COMMENT: Record<CodeLanguage, string | null> = {
  js: '//',
  python: '#',
  shell: '#',
  sql: '--',
  json: null,
  plain: null,
};

const BLOCK_COMMENT_LANGS: ReadonlySet<CodeLanguage> = new Set<CodeLanguage>(['js', 'sql']);

const QUOTES = ['"', "'", '`'] as const;

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Tokenise `code` for display. Always returns tokens covering the whole input in
 * order, so joining their `text` reproduces the source exactly — a highlighter
 * that loses a character is worse than none.
 */
export function highlightCode(code: string, language: CodeLanguage): CodeToken[] {
  const tokens: CodeToken[] = [];
  const keywords = KEYWORDS[language];
  const lineComment = LINE_COMMENT[language];
  const hasBlockComment = BLOCK_COMMENT_LANGS.has(language);

  let plain = '';
  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, kind: 'plain' });
      plain = '';
    }
  };
  const push = (text: string, kind: TokenKind) => {
    flush();
    tokens.push({ text, kind });
  };

  let i = 0;
  while (i < code.length) {
    const ch = code[i] as string;

    if (lineComment && code.startsWith(lineComment, i)) {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      push(code.slice(i, stop), 'comment');
      i = stop;
      continue;
    }

    if (hasBlockComment && code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      push(code.slice(i, stop), 'comment');
      i = stop;
      continue;
    }

    if ((QUOTES as readonly string[]).includes(ch)) {
      let j = i + 1;
      // Unterminated strings happen constantly while a fence is still
      // streaming; running to the end of the input keeps the rest readable
      // rather than mis-colouring everything after it.
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      push(code.slice(i, Math.min(j, code.length)), 'string');
      i = j;
      continue;
    }

    if (isDigit(ch) && !(i > 0 && isIdentPart(code[i - 1] as string))) {
      let j = i;
      while (j < code.length && /[0-9._a-fA-FxX]/.test(code[j] as string)) j += 1;
      push(code.slice(i, j), 'number');
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i;
      while (j < code.length && isIdentPart(code[j] as string)) j += 1;
      const word = code.slice(i, j);
      if (keywords.has(word)) push(word, 'keyword');
      else plain += word;
      i = j;
      continue;
    }

    plain += ch;
    i += 1;
  }

  flush();
  return tokens;
}
