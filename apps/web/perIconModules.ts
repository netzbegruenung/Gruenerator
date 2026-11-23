import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { type Plugin } from 'vite';

// Every react-icons pack is ONE module (react-icons/pi/index.mjs is 5.6 MB), and
// a module lives in exactly one chunk. So the chunk holding a pack carries the
// union of every icon of that pack used anywhere in the app, and the first lazy
// route that shows one icon loads all of them: on /start that was 224 Phosphor,
// 96 Feather, 68 + 50 Heroicons and 48 Simple Icons (#5891).
//
// This plugin rewrites `import { PiX, PiY as Z } from 'react-icons/pi'` into one
// import per icon from a virtual module that holds just that icon's GenIcon
// call, cut out of the pack source. Each icon then follows the code that uses
// it. The call sites stay plain react-icons imports, and the plugin also
// reaches node_modules (@ggraphic/editor ships its own pack imports).
// Namespace imports and specifiers with a query (`react-icons/pi?all`, the
// deliberate full set in phosphorAgentIcon) are left alone.

const VIRTUAL_PREFIX = 'virtual:react-icon/';
const RESOLVED_PREFIX = '\0react-icon:';
// `react-icons/lib` (GenIcon itself) is the one subpath that is not a pack.
const PACK_SPECIFIER = /^react-icons\/(?!lib$)([a-z0-9]+)$/;
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*(['"])(react-icons\/[a-z0-9]+)\2;?/g;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

interface Specifier {
  imported: string;
  local: string;
  typeOnly: boolean;
}

function parseSpecifiers(list: string): Specifier[] {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const typeOnly = part.startsWith('type ');
      const [imported, local] = part.replace(/^type\s+/, '').split(/\s+as\s+/);
      return { imported: imported.trim(), local: (local ?? imported).trim(), typeOnly };
    });
}

/** Rewrites pack imports in `code`; returns null when there is nothing to do. */
export function rewritePackImports(code: string): string | null {
  if (!code.includes('react-icons/')) return null;
  let changed = false;
  const out = code.replace(IMPORT_RE, (whole, list: string, _q: string, spec: string) => {
    const pack = PACK_SPECIFIER.exec(spec)?.[1];
    // `import type { … }` is erased anyway; leave it as written.
    if (!pack || /^import\s+type\b/.test(whole)) return whole;
    const specifiers = parseSpecifiers(list);
    const values = specifiers.filter((s) => !s.typeOnly);
    if (values.length === 0) return whole;
    changed = true;
    const lines = values.map((s) => {
      const binding = s.imported === s.local ? s.imported : `${s.imported} as ${s.local}`;
      return `import { ${binding} } from '${VIRTUAL_PREFIX}${pack}/${s.imported}';`;
    });
    const types = specifiers.filter((s) => s.typeOnly);
    if (types.length > 0) {
      const names = types.map((s) =>
        s.imported === s.local ? s.imported : `${s.imported} as ${s.local}`
      );
      lines.push(`import type { ${names.join(', ')} } from '${spec}';`);
    }
    // Same line count as the original import, so later source positions hold.
    return lines.join(' ') + '\n'.repeat((whole.match(/\n/g) ?? []).length);
  });
  return changed ? out : null;
}

/** The module source for one icon, cut out of its pack's index.mjs. */
export function iconModuleSource(packSource: string, name: string): string {
  const re = new RegExp(
    `export function ${name} \\(props\\) \\{\\s*return GenIcon\\(([\\s\\S]*?)\\)\\(props\\);\\s*\\}`
  );
  const data = re.exec(packSource)?.[1];
  if (!data) throw new Error(`react-icons: ${name} is not exported by this pack`);
  return `import { GenIcon } from 'react-icons/lib';\nexport function ${name}(props) {\n  return GenIcon(${data})(props);\n}\n`;
}

export function perIconModules(): Plugin {
  const require = createRequire(import.meta.url);
  const packs = new Map<string, string>();
  const packSource = (pack: string): string => {
    let source = packs.get(pack);
    if (source === undefined) {
      // The export map has no ./<pack>/package.json; the require entry sits next to index.mjs.
      const dir = path.dirname(require.resolve(`react-icons/${pack}`));
      source = readFileSync(path.join(dir, 'index.mjs'), 'utf8');
      packs.set(pack, source);
    }
    return source;
  };

  return {
    name: 'per-icon-modules',
    enforce: 'pre',
    // Build only: the dev server would turn each icon into its own request
    // for no gain, and vitest does not load this config.
    apply: 'build',
    resolveId(id) {
      return id.startsWith(VIRTUAL_PREFIX)
        ? RESOLVED_PREFIX + id.slice(VIRTUAL_PREFIX.length)
        : null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return null;
      const [pack, name] = id.slice(RESOLVED_PREFIX.length).split('/');
      return iconModuleSource(packSource(pack), name);
    },
    transform(code, id) {
      if (id.startsWith('\0') || !SOURCE_FILE.test(id.split('?')[0])) return null;
      const rewritten = rewritePackImports(code);
      return rewritten === null ? null : { code: rewritten, map: null };
    },
  };
}
