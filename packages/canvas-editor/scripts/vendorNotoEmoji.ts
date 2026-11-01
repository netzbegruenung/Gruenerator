/**
 * Vendors the full Noto Emoji set for the canvas emoji catalogue.
 *
 * - Artwork: Noto Emoji `2D/svg` (Apache-2.0) and the waved region flags
 *   (`third_party/region-flags/waved-svg`, public domain) at a pinned commit,
 *   optimised with svgo into apps/web/public/emoji/emoji_u<code>.svg.
 * - Names and search tags: emojibase-data (MIT), German locale, written to
 *   packages/ggraphic-editor/src/utils/emoji/emojiCatalog.json.
 *
 * Only emoji with a German name AND Noto artwork are written. Skin tones are
 * kept per emoji only when all five uniform tones exist; mixed-tone pairs are
 * not reachable from the tone picker and are left out.
 *
 * Usage: pnpm tsx packages/canvas-editor/scripts/vendorNotoEmoji.ts
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NOTO_COMMIT = 'e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e';
const EMOJIBASE_VERSION = '17.0.0';
const SVGO_VERSION = '3.3.5';

const OUT_DIR = path.resolve('apps/web/public/emoji');
const CATALOG_FILE = path.resolve('packages/ggraphic-editor/src/utils/emoji/emojiCatalog.json');

interface EmojibaseSkin {
  hexcode: string;
  tone: number | number[];
}
interface EmojibaseEmoji {
  label: string;
  hexcode: string;
  tags?: string[];
  group?: number;
  order?: number;
  skins?: EmojibaseSkin[];
}
interface EmojibaseMessages {
  groups: { key: string; message: string; order: number }[];
}

/** emojibase hexcode → Noto file code: lowercase, no FE0F, each codepoint at least 4 digits. */
function notoCode(hexcode: string): string {
  return hexcode
    .split('-')
    .filter((cp) => cp !== 'FE0F')
    .map((cp) => cp.toLowerCase().padStart(4, '0'))
    .join('_');
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

function checkoutNoto(dir: string): void {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'inherit' });
  git('init', '-q');
  git('remote', 'add', 'origin', 'https://github.com/googlefonts/noto-emoji.git');
  git('sparse-checkout', 'set', '--no-cone', '/2D/svg/', '/third_party/region-flags/waved-svg/');
  git('fetch', '-q', '--depth=1', '--filter=blob:none', 'origin', NOTO_COMMIT);
  git('checkout', '-q', 'FETCH_HEAD');
}

async function main() {
  const base = `https://cdn.jsdelivr.net/npm/emojibase-data@${EMOJIBASE_VERSION}/de`;
  const [data, messages] = await Promise.all([
    fetchJson<EmojibaseEmoji[]>(`${base}/data.json`),
    fetchJson<EmojibaseMessages>(`${base}/messages.json`),
  ]);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'noto-emoji-'));
  const noto = path.join(work, 'noto');
  const staged = path.join(work, 'staged');
  fs.mkdirSync(noto);
  fs.mkdirSync(staged);
  checkoutNoto(noto);

  const sources = [
    path.join(noto, '2D/svg'),
    path.join(noto, 'third_party/region-flags/waved-svg'),
  ];
  const stage = (code: string): boolean => {
    const name = `emoji_u${code}.svg`;
    const src = sources.map((dir) => path.join(dir, name)).find((p) => fs.existsSync(p));
    if (!src) return false;
    fs.copyFileSync(src, path.join(staged, name));
    return true;
  };

  const groups = messages.groups
    .filter((g) => g.key !== 'component')
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ order: g.order, label: g.message, emoji: [] as EmojibaseEmoji[] }));

  let missing = 0;
  for (const e of [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const group = groups.find((g) => g.order === e.group);
    if (!group) continue;
    if (!stage(notoCode(e.hexcode))) {
      missing++;
      continue;
    }
    group.emoji.push(e);
  }

  const catalog = {
    source: `Noto Emoji ${NOTO_COMMIT.slice(0, 7)}; names: emojibase-data ${EMOJIBASE_VERSION} (MIT, © Miles Johnson)`,
    groups: groups.map((g) => ({
      label: g.label,
      emoji: g.emoji.map((e) => {
        const tones = [1, 2, 3, 4, 5].map((tone) =>
          e.skins?.find((s) =>
            Array.isArray(s.tone) ? s.tone.every((t) => t === tone) : s.tone === tone
          )
        );
        const toneCodes = tones.every((s) => s && stage(notoCode(s.hexcode)))
          ? tones.map((s) => notoCode(s!.hexcode))
          : null;
        const tags = (e.tags ?? []).filter((t) => t !== e.label.toLowerCase());
        return toneCodes
          ? [notoCode(e.hexcode), e.label, tags, toneCodes]
          : [notoCode(e.hexcode), e.label, tags];
      }),
    })),
  };

  const svgoConfig = path.join(work, 'svgo.config.cjs');
  fs.writeFileSync(
    svgoConfig,
    `module.exports = { multipass: true, plugins: [
      { name: 'preset-default', params: { overrides: { removeViewBox: false } } },
      { name: 'removeDimensions' },
      { name: 'addAttributesToSVGElement', params: { attributes: [{ width: '128' }, { height: '128' }] } },
    ] };`
  );
  execFileSync(
    'npx',
    ['-y', `svgo@${SVGO_VERSION}`, '-q', '--config', svgoConfig, '-f', staged, '-o', OUT_DIR],
    { stdio: 'inherit' }
  );

  fs.mkdirSync(path.dirname(CATALOG_FILE), { recursive: true });
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog) + '\n');
  // Same shape lint-staged would commit, so a re-run without changes stays diff-free.
  execFileSync('npx', ['prettier', '--write', '--log-level', 'warn', CATALOG_FILE], {
    stdio: 'inherit',
  });
  fs.rmSync(work, { recursive: true, force: true });

  const count = catalog.groups.reduce((n, g) => n + g.emoji.length, 0);
  console.log(
    `${count} emoji, ${fs.readdirSync(OUT_DIR).length} files; ${missing} without Noto art`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
