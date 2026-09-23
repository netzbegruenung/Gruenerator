/**
 * Drift guard: an export added to one barrel must reach the other platform.
 *
 * `package.json` resolves `@gruenerator/chat` through an `exports` condition:
 * `react-native` → `src/index.native.ts`, everything else → `src/index.ts`.
 * Both are hand-maintained lists of ~500 explicit re-exports, neither imports
 * the other, and nothing compared them (#3306). A symbol added to `index.ts`
 * alone leaves `packages/chat` fully green — tsc, lint and tests all pass —
 * and surfaces only as `TS2305: Module '"@gruenerator/chat"' has no exported
 * member 'x'` in `apps/mobile`, and only if a mobile file imports it in the
 * same change. An export meant for native "later" looks exported and is not.
 *
 * Why source text rather than importing the barrels: `index.native.ts` pulls
 * React Native modules that do not resolve in a node/jsdom vitest environment.
 * Reading sibling source with `node:fs` is the established idiom here — cf.
 * `apps/api/routes/chat/agents/toolCatalogUiCoverage.vitest.ts`.
 *
 * Two rules, because the two failure modes have different costs:
 *
 * 1. If BOTH barrels re-export a module, no name from it may be missing on the
 *    other platform. Free by construction: the module already sits in both
 *    bundles, so an extra named re-export costs nothing at runtime — hence no
 *    allowlist; an omission here is an oversight. "Missing" means missing from
 *    the other barrel ENTIRELY, not just re-exported there under a different
 *    specifier, because TS2305 is about the name and not the path. (If a symbol
 *    genuinely must not cross, its home module has to be split; that is the
 *    honest fix, not an exception line.)
 *
 * 2. A `./lib/*` module re-exported by only ONE barrel needs an entry in
 *    PLATFORM_ONLY_LIB_MODULES. This one is NOT free — the native bundle pulls
 *    in whatever the module imports, so adding a web-only module to
 *    `index.native.ts` drags `@gruenerator/ui`/DOM deps into Metro. The
 *    allowlist is the load-bearing part: it forces the decision to be written
 *    down instead of being made by omission.
 *
 * Scope is `./lib/*` for rule 2 on purpose. `./components/**` is web-only by
 * construction (Radix, lucide-react, `@gruenerator/ui`) and listing ~70 of them
 * would be noise. Rule 1 still covers every path, components included.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `./lib/*` modules that live in exactly one barrel, and why. Key is the
 * specifier as written; value is the reason, which is the point of the entry.
 */
const PLATFORM_ONLY_LIB_MODULES: Readonly<Record<string, string>> = {
  './lib/threadPath': 'web only — builds browser URL paths; mobile routes via Expo Router',
  './lib/useScopedAgentState':
    'web only — hangs off ChatSurfaceContext/userProfileStore, both web-only',
  './lib/utils': 'web only — re-exports cn() from @gruenerator/ui and Tailwind class strings',
  './lib/computeResult': 'native only — web renders compute results through its own tool-ui cards',
  './lib/mathSegments': 'native only — web math rendering goes through streamdown/KaTeX',
  './lib/narrationView': 'native only — web narrates via ToolCallUI',
  './lib/normalizeMathDelimiters': 'native only — same, part of the native math path',
  './lib/statusLineView': 'native only — web builds its status line in ProgressIndicator',
  './lib/toolRunGrouping': 'native only — web groups tool runs inside ToolCallUI',
};

const barrelSource = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

/**
 * Maps module specifier → the PUBLIC names the barrel exports from it.
 *
 * Public, not source, names: `export { Citation as CitationCard }` is
 * `CitationCard` to a consumer, and that is the name TS2305 complains about.
 */
function reExports(file: string): Map<string, Set<string>> {
  const src = barrelSource(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // A bare `export * from './x'` cannot be enumerated — it would make every
  // assertion below silently vacuous for that module, so refuse to run.
  const bareStar = /export\s+\*\s+from\s+'([^']+)'/.exec(src);
  if (bareStar) {
    throw new Error(
      `${file} uses \`export * from '${bareStar[1]}'\` — this guard cannot enumerate it. ` +
        `Write the names out, or teach the parser.`
    );
  }

  const map = new Map<string, Set<string>>();
  const re = /export\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+'([^']+)'/g;
  for (const [, starAs, braces, mod] of src.matchAll(re)) {
    const names = starAs
      ? [starAs]
      : (braces ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          // `type Foo`, `Foo as Bar`, `default as Baz` → the public name.
          .map((s) => {
            const parts = s.replace(/^type\s+/, '').split(/\s+as\s+/);
            return (parts[parts.length - 1] as string).trim();
          });
    const bucket = map.get(mod as string) ?? new Set<string>();
    for (const n of names) bucket.add(n);
    map.set(mod as string, bucket);
  }
  return map;
}

const web = reExports('./index.ts');
const native = reExports('./index.native.ts');

/** Every public name a platform exports, from any module. */
const publicNames = (m: Map<string, Set<string>>): Set<string> =>
  new Set([...m.values()].flatMap((s) => [...s]));

const webNames = publicNames(web);
const nativeNames = publicNames(native);

const libModules = (m: Map<string, Set<string>>): string[] =>
  [...m.keys()].filter((k) => k.startsWith('./lib/'));

describe('@gruenerator/chat barrel parity', () => {
  // Positive controls FIRST. A regex that quietly stops matching would make
  // every assertion below vacuously green — the exact way the original drift
  // survived unnoticed.
  it('actually parses both barrels', () => {
    expect(web.size, 'web modules').toBeGreaterThanOrEqual(100);
    expect(native.size, 'native modules').toBeGreaterThanOrEqual(50);

    // Single-line form, multi-line form, `* as` form, renamed form.
    expect(web.get('./lib/utils'), 'single-line form').toContain('cn');
    expect(native.get('./stores/chatConfigStore'), 'multi-line form').toContain(
      'useChatConfigStore'
    );
    expect(
      native.get('./components/icons/grueneratorHomeIconGeometry'),
      '`export * as` form'
    ).toContain('grueneratorHomeIconGeometry');
    expect(
      web.get('./components/tool-ui/citation/ProjectCitation'),
      'renamed form exposes the PUBLIC name'
    ).toContain('CitationCard');
  });

  it('a module both barrels load never leaves a name missing on one platform', () => {
    const drift: string[] = [];
    for (const [mod, fromWeb] of web) {
      const fromNative = native.get(mod);
      if (!fromNative) continue;
      // Absent from the OTHER BARREL ENTIRELY, not merely re-exported there
      // under a different specifier — `SerializableCitation` reaches web via
      // `./components/tool-ui/citation`, and demanding per-module bookkeeping
      // would have called that a bug. TS2305 is about the name, not the path.
      const missingNative = [...fromWeb].filter((n) => !nativeNames.has(n)).sort();
      const missingWeb = [...fromNative].filter((n) => !webNames.has(n)).sort();
      if (missingNative.length)
        drift.push(`${mod} → missing in index.native.ts: ${missingNative.join(', ')}`);
      if (missingWeb.length) drift.push(`${mod} → missing in index.ts: ${missingWeb.join(', ')}`);
    }

    expect(
      drift,
      'Beide Barrels importieren dieses Modul bereits — ein zusätzlicher Re-Export daraus ' +
        'kostet zur Laufzeit nichts. Den fehlenden Namen im anderen Barrel nachtragen. ' +
        'Darf ein Symbol wirklich nicht auf die andere Plattform, gehört es in ein eigenes ' +
        'Modul, das nur ein Barrel re-exportiert (und dann unter PLATFORM_ONLY_LIB_MODULES).'
    ).toEqual([]);
  });

  it('every one-sided ./lib/* module is listed with a reason', () => {
    const unlisted = [...new Set([...libModules(web), ...libModules(native)])]
      .filter((mod) => !(web.has(mod) && native.has(mod)))
      .filter((mod) => !(mod in PLATFORM_ONLY_LIB_MODULES))
      .sort();

    expect(
      unlisted,
      'Ein ./lib/*-Modul steht nur in EINEM Barrel. Entweder im anderen nachtragen — dann ' +
        'aber wissen, dass der native Bundle alles mitzieht, was das Modul importiert — oder ' +
        'mit Begründung in PLATFORM_ONLY_LIB_MODULES eintragen.'
    ).toEqual([]);
  });

  it('PLATFORM_ONLY_LIB_MODULES has no stale entries', () => {
    const stale = Object.keys(PLATFORM_ONLY_LIB_MODULES)
      .filter((mod) => (web.has(mod) && native.has(mod)) || (!web.has(mod) && !native.has(mod)))
      .sort();

    expect(
      stale,
      'Diese Module sind inzwischen in beiden Barrels (oder in keinem) — der Eintrag ist ' +
        'überholt und deckt sonst still eine echte Lücke. Zeile entfernen.'
    ).toEqual([]);
  });
});
