import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type Plugin } from 'vite';

/**
 * Writes `dist/import-report.json` after `vite build`: every module that ended
 * up in the bundle, grouped by the workspace or npm package that owns it, and
 * for each `@gruenerator/*` package the editor files that pull it in. The
 * number the core move drives to zero is the `@gruenerator/*` count.
 */

const EDITOR = '@gruenerator/canvas-editor';
const DEMO = '@gruenerator/ggraphic-demo';

interface PackageCount {
  name: string;
  /** Modules in any chunk, lazy ones included. */
  modules: number;
  /** Of those, modules in the chunks the page loads before it renders. */
  eagerModules: number;
  bytes: number;
}

interface WorkspaceEntry extends PackageCount {
  /** Editor files importing this package directly, with how many of its modules each imports. */
  editorImporters: { file: string; imports: number }[];
  /** Shortest import chain from the entry to the first module of this package. */
  firstChain: string[];
}

function workspacePackages(root: string): { dir: string; name: string }[] {
  const found: { dir: string; name: string }[] = [];
  for (const group of ['apps', 'packages', 'services']) {
    let entries: string[] = [];
    try {
      entries = readdirSync(path.join(root, group));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const dir = path.join(root, group, entry);
      try {
        const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
          name?: string;
        };
        if (manifest.name) found.push({ dir: dir + path.sep, name: manifest.name });
      } catch {
        // not a package
      }
    }
  }
  return found;
}

/** The npm package name from the last `node_modules/` segment of a path. */
function npmPackage(id: string): string | null {
  const at = id.lastIndexOf('/node_modules/');
  if (at === -1) return null;
  const parts = id.slice(at + '/node_modules/'.length).split('/');
  const first = parts[0] ?? '';
  return first.startsWith('@') ? `${first}/${parts[1] ?? ''}` : first;
}

export function importReport({ root }: { root: string }): Plugin {
  const workspace = workspacePackages(root);
  const owner = (id: string): string => {
    if (id.startsWith('\0')) return '(virtual)';
    const clean = id.split('?')[0] ?? id;
    const npm = npmPackage(clean);
    if (npm) return npm;
    const ws = workspace.find((pkg) => clean.startsWith(pkg.dir));
    return ws ? ws.name : '(other)';
  };
  const rel = (id: string) => path.relative(root, id.split('?')[0] ?? id);

  return {
    name: 'ggraphic-import-report',
    apply: 'build',
    generateBundle(options, bundle) {
      // Chunks loaded up front: the entries and what they import statically.
      const eagerChunks = new Set<string>();
      const pending = Object.values(bundle).filter(
        (output) => output.type === 'chunk' && output.isEntry
      );
      for (let next = pending.pop(); next; next = pending.pop()) {
        if (next.type !== 'chunk' || eagerChunks.has(next.fileName)) continue;
        eagerChunks.add(next.fileName);
        for (const file of next.imports) {
          const chunk = bundle[file];
          if (chunk) pending.push(chunk);
        }
      }

      const bytes = new Map<string, number>();
      const eager = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const [id, info] of Object.entries(output.modules)) {
          // A module whose code tree-shaking dropped entirely (a barrel, a
          // type-only file) is listed with length 0; it ships nothing.
          if (info.renderedLength === 0) continue;
          bytes.set(id, (bytes.get(id) ?? 0) + info.renderedLength);
          if (eagerChunks.has(output.fileName)) eager.add(id);
        }
      }
      const bundled = [...bytes.keys()];

      const byPackage = new Map<string, PackageCount>();
      for (const id of bundled) {
        const name = owner(id);
        const entry = byPackage.get(name) ?? { name, modules: 0, eagerModules: 0, bytes: 0 };
        entry.modules += 1;
        if (eager.has(id)) entry.eagerModules += 1;
        entry.bytes += bytes.get(id) ?? 0;
        byPackage.set(name, entry);
      }
      const packages = [...byPackage.values()].sort((a, b) => b.modules - a.modules);

      // The whole module graph, static and dynamic edges. Barrels that
      // tree-shaking removed are still on it, so a chain runs through them.
      const edges = new Map<string, string[]>();
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id);
        if (info) edges.set(id, [...info.importedIds, ...info.dynamicallyImportedIds]);
      }

      // Modules that lead, without leaving their package, to a module in the
      // bundle. Walked backwards from the bundled ones, so a barrel cycle
      // cannot cut a path short.
      const importersOf = new Map<string, string[]>();
      for (const [from, targets] of edges) {
        for (const to of targets) {
          if (owner(to) === owner(from))
            importersOf.set(to, [...(importersOf.get(to) ?? []), from]);
        }
      }
      const live = new Set(bundled);
      const stack = [...bundled];
      for (let id = stack.pop(); id; id = stack.pop()) {
        for (const from of importersOf.get(id) ?? []) {
          if (live.has(from)) continue;
          live.add(from);
          stack.push(from);
        }
      }
      const isLive = (id: string): boolean => live.has(id);

      // Breadth-first from the entry chunks: the first parent of every module.
      const parent = new Map<string, string | null>();
      const queue: string[] = [];
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.isEntry && output.facadeModuleId) {
          parent.set(output.facadeModuleId, null);
          queue.push(output.facadeModuleId);
        }
      }
      for (let i = 0; i < queue.length; i += 1) {
        const from = queue[i] as string;
        for (const to of edges.get(from) ?? []) {
          if (parent.has(to)) continue;
          parent.set(to, from);
          queue.push(to);
        }
      }
      const chainTo = (id: string): string[] => {
        const chain: string[] = [];
        for (let at: string | null | undefined = id; at; at = parent.get(at)) chain.unshift(at);
        return chain;
      };

      const gruenerator: WorkspaceEntry[] = packages
        .filter((pkg) => pkg.name.startsWith('@gruenerator/') && pkg.name !== DEMO)
        .map((pkg) => {
          // Editor files in the bundle that import a live module of this package.
          const importers = new Map<string, number>();
          if (pkg.name !== EDITOR) {
            for (const from of bundled) {
              if (owner(from) !== EDITOR) continue;
              const hits = (edges.get(from) ?? []).filter(
                (to) => owner(to) === pkg.name && isLive(to)
              ).length;
              if (hits > 0) importers.set(rel(from), hits);
            }
          }
          // The first bundled module of this package the walk reaches.
          const first = queue.find((id) => owner(id) === pkg.name && bytes.has(id));
          return {
            ...pkg,
            editorImporters: [...importers]
              .map(([file, imports]) => ({ file, imports }))
              .sort((a, b) => b.imports - a.imports || a.file.localeCompare(b.file)),
            firstChain: first ? chainTo(first).map(rel) : [],
          };
        });

      const report = {
        generatedAt: new Date().toISOString(),
        totalModules: bundled.length,
        eagerModules: eager.size,
        gruenerator: {
          packages: gruenerator.length,
          modules: gruenerator.reduce((sum, pkg) => sum + pkg.modules, 0),
        },
        ggraphic: packages.filter((pkg) => pkg.name.startsWith('@ggraphic/')),
        workspace: gruenerator,
        packages,
        modules: bundled.map((id) => ({ id: rel(id), owner: owner(id), bytes: bytes.get(id) })),
      };
      this.emitFile({
        type: 'asset',
        fileName: 'import-report.json',
        source: JSON.stringify(report, null, 2) + '\n',
      });
      const out = path.resolve(options.dir ?? 'dist', 'import-report.json');

      const lines = [
        '',
        `import report: ${report.totalModules} bundled modules, ` +
          `${report.gruenerator.modules} of them in ${report.gruenerator.packages} @gruenerator/* packages ` +
          `(${report.eagerModules} load before the page renders)`,
        ...gruenerator.map((pkg) => {
          const via = pkg.firstChain.filter((file) => file.startsWith('packages/canvas-editor/'));
          const first = pkg.name === EDITOR ? '' : via[via.length - 1];
          const importers =
            pkg.name === EDITOR ? '' : `, ${pkg.editorImporters.length} editor files import it`;
          return (
            `  ${pkg.name}: ${pkg.modules} modules (${pkg.eagerModules} eager)${importers}` +
            (first ? `, first via ${first}` : '')
          );
        }),
        ...report.ggraphic.map(
          (pkg) => `  ${pkg.name}: ${pkg.modules} modules (${pkg.eagerModules} eager)`
        ),
        `written to ${path.relative(root, out)}`,
        '',
      ];
      process.stdout.write(lines.join('\n') + '\n');
    },
  };
}
