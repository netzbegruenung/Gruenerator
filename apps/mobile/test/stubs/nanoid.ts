/**
 * nanoid stub for the Jest lane.
 *
 * nanoid 6 ships ESM only, and jest-expo's `transformIgnorePatterns` does not
 * allowlist it — which must not be overridden (see CLAUDE-testing.md). Any test
 * that reaches `@gruenerator/shared/utils` therefore dies on
 * "Cannot use import statement outside a module", and that module is on the
 * path of half the chat tree (`slug.ts` → `utils/index.ts`).
 *
 * Ids are unique but deterministic: a per-alphabet counter rendered in the
 * requested alphabet, left-padded to the requested length. Tests that only need
 * *an* id get a stable one; tests that generate several still get distinct ones,
 * so a uniqueness bug cannot hide behind the stub.
 */

const counters = new Map<string, number>();

function render(alphabet: string, size: number, n: number): string {
  let out = '';
  let rest = n;
  do {
    out = (alphabet[rest % alphabet.length] ?? alphabet[0] ?? 'x') + out;
    rest = Math.floor(rest / alphabet.length);
  } while (rest > 0);
  return out.padStart(size, alphabet[0] ?? 'x').slice(-size);
}

export function customAlphabet(alphabet: string, defaultSize = 21): (size?: number) => string {
  return (size = defaultSize) => {
    const key = `${alphabet}:${size}`;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return render(alphabet, size, next);
  };
}

const DEFAULT_ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';

export const nanoid = customAlphabet(DEFAULT_ALPHABET, 21);

/** Reset the counters so id sequences do not leak between test files. */
export function __resetNanoid(): void {
  counters.clear();
}
