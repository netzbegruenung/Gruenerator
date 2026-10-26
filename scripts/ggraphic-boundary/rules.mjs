// The rules behind scripts/check-ggraphic-core-boundary.mjs. Pure: takes the
// files of packages/ggraphic-* as { path, bytes } and returns what leaks.
import { posix } from 'node:path';
import { readFontNames } from './fontNames.mjs';

export const CORE_PATHSPEC = 'packages/ggraphic-*';
const PACKAGE_DIR = /^packages\/ggraphic-[^/]+/;

// (a) Party, Grünerator and people. Case matters where the word is also German
// for "green": "grüne Fläche" and "im Grünen" must stay allowed.
const IDENTITY = [
  [/gr(?:ü|ue|u)nerator/i, 'Grünerator'],
  [/b(?:ü|ue)ndnis[\s-]*90/iu, 'party name'],
  [
    /\bB(?:Ü|UE)NDNIS\b|\bB90\b|\b(?:DIE|Die|der|den|die)[\s-]+(?:GRÜNEN|Grünen|GRUENEN|Gruenen)\b|\bGR(?:Ü|UE)NEN?(?!\p{L})/u,
    'party name',
  ],
  [/\bGr(?:ü|ue)nen-\p{Lu}|\bGr(?:ü|ue)nen?[\s-](?:Alternative|Jugend)\b/u, 'party organisation'],
  [/#(?:die_?)?gr(?:ü|ue)nen?(?!\p{L})|#b90gr/iu, 'party hashtag'],
  [
    /\bgr(?:ü|ue)ne\.(?:de|at)\b|gruene-[a-z-]+\.de|netzbegr(?:ü|ue)nung|@(?:die_?)?gr(?:ü|ue)nen?\w*|\bgr(?:ü|ue)ne-(?:de|at)\b/iu,
    'party domain, handle or asset id',
  ],
  [/\{\{\s*partyName\s*\}\}/, 'party placeholder'],
  [
    /\b(?:Banaszak|Brantner|Gewessler|Habeck|Baerbock|Kogler|Nouripour|Kickl|Ricarda Lang)\b|Merz['’]? ?-?Plan/,
    'politician',
  ],
  [/\bCD (?:p|S)\.\s*\d|CI 2026|The Odd|CI[- ]Workshop/, 'citation of the party design manual'],
  [/Platz vor dem Neuen Tor|Lindengasse 40|030[\s/-]*28442/, 'party office address'],
  [/\/Users\/[^/\s]+\/|-Users-[A-Za-z]+-|\/private\/tmp\/claude-/, 'local machine path'],
  [
    /INTERN_CONTENT_DIR|internContentRoot|gruenerator-intern|\.external\/|\/api\/sharepic-vorlagen|['"`]vorlage:/,
    'reference to the private repo',
  ],
  [
    /\b(?:GrueneType|Gotham|BalkenGroup|DE_WORDMARK|dreizeilen|toggle-sunflower)\w*|\blogo(?:De|At)(?:White|Weiss|Black|Schwarz|Dark|Light)?\b/,
    'Grünerator brand identifier',
  ],
];
// Any quoted or url() path that climbs with ../ — imports, CSS, new URL(), references.
const PATH_REFERENCE = /(?:['"`]|url\(\s*)(\.\.\/[^'"`\s)$]*)/g;

// (b) Corporate-design colours of the German and Austrian party, as hex
// (#, 0x/ARGB or a bare quoted value) or as rgb()/rgba() triplets.
const CD_HEX = [
  ...'005538 005437 00553B 00261A 008939 00CC4F 8ABD24 F5F1E9 F5F1E8 0BA1DD 6CCD87 D5EEE6',
  ...' 46102C BEFF60 77F6A5 46962B 316049 0A2B1E 1A5C40 A9D3BE FFF17A 6F2DA8 FF7F8E FFD320',
  ...' 257639 56AF31 FCEC00 E4007C 318437 287A35 1B6630 0B6620 7CC650 A4D78F 1E7A35 28833E 23803B',
]
  .join('')
  .split(' ');
const hexPattern = (values) =>
  new RegExp(
    `(?:#|\\b0x(?:[0-9a-f]{2})?|(?<=['"\`]))(?:${values.join('|')})(?:[0-9a-f]{2})?(?![0-9a-z])`,
    'i'
  );
const rgbPattern = (values) =>
  new RegExp(
    values
      .map((hex) => {
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return `rgba?\\(\\s*${r}[\\s,]+${g}[\\s,]+${b}\\s*[,/)]`;
      })
      .join('|'),
    'i'
  );
const CD_COLOUR = [hexPattern(CD_HEX), rgbPattern(CD_HEX)];

// (c) File names of brand assets and party content.
const BRAND_PATHS = [
  /gruenetype/i,
  /gotham/i,
  /gr(?:ü|ue)ne[^/]*logo|logo[^/]*gr(?:ü|ue)ne/i,
  /sonnenblume|sunflower/i,
  /info_bg_/i,
  /brush-arrow-/i,
  /quote-gelb\.svg$/i,
  /gr(?:ü|ue)nerator/i,
  /logo_gr/i,
  /\.eps$/i,
  /stickers\/(?:at-|teamgruen)/i,
  /pride-profilbild/i,
  /imagine\/previews\//i,
  /-unsplash\.jpe?g$/i,
  /sharepic_example_bg\//i,
  /undraw/i,
  /beispiele\.json$/i,
  /kapitel\/grundlagen-/i,
];

// (d) Assets: listed in <package>/assets.json with source and an allowed license.
const ASSET_EXT = /\.(?:woff2?|ttf|otf|eot|ttc|otc|png|jpe?g|webp|gif|avif|ico|svg)$/i;
const NOT_TEXT_EXT = /\.(?:woff2?|ttf|otf|eot|ttc|otc|png|jpe?g|webp|gif|avif|ico)$/i;
const FONT_EXT = /\.(?:woff2?|ttf|otf)$/i;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|gif|avif|ico|svg)$/i;
const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'MPL-2.0',
  'CC0-1.0',
  'OFL-1.1',
]);
const FONT_OWNER = /Hoefler|Baianat|BÜNDNIS|gruene|typography\.com/i;
const FONT_LICENSE = /Open Font License|OFL|Apache License/i;
// A literal payload, not a runtime template like `data:…;base64,${btoa(svg)}`.
const INLINE_ASSET = [
  /data:[\w.+/-]+(?:;[\w=.-]+)*;base64,[A-Za-z0-9+/]{4}/i,
  /data:image\/svg\+xml[^,'"`]*,\s*(?:%3C|<)svg/i,
];

// (e) Assets come injected or via import.meta.url — never from the host's root.
const HOST_PATH = [
  /['"`(]\/(?![/*])[^'"`\s)]*\.(?:svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf)(?:[?#][^'"`\s)]*)?['"`)]/i,
  /(?:['"`(]|\})\/(?:api|illustrations|emoji|studio-tools|imagine)\//i,
];

// (f) Every source file carries the core's license.
const SOURCE_EXT = /\.(?:tsx?|jsx?|mjs|cjs|css)$/i;
const SPDX = /SPDX-License-Identifier: MPL-2\.0/;

// Warnings: words and colours that are brand in Grünerator but also generic.
const AMBIGUOUS = [
  /Sonnenblume|sunflower|Tanne|Klee|Grashalm|Dunkeltanne|grasgruen|Störer|stoerer|balken/i,
  hexPattern(['E6007E', '0088CC', 'F5A623', '2E2E3D', 'F2F2F2']),
];

const NAMED_ENTITIES = {
  uuml: 'ü',
  Uuml: 'Ü',
  auml: 'ä',
  Auml: 'Ä',
  ouml: 'ö',
  Ouml: 'Ö',
  szlig: 'ß',
  nbsp: ' ',
  shy: '',
  amp: '&',
};
const codePoint = (value) => (value <= 0x10ffff ? String.fromCodePoint(value) : '');

/** The text with JS escapes, HTML entities, %23 and invisible spacing resolved. */
function decode(text) {
  return text
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name] ?? match)
    .replace(/%23/gi, '#')
    .replace(/­/g, '')
    .replace(/ /g, ' ')
    .normalize('NFC');
}

function locate(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  return `line ${text.slice(0, match.index).split('\n').length}: "${match[0]}"`;
}

function checkText(path, bytes, packageDir, fail, warn) {
  const utf8 = bytes.toString('utf8').normalize('NFC');
  const sources = utf8.includes('�') ? [utf8, bytes.toString('latin1').normalize('NFC')] : [utf8];
  const views = [...new Set(sources.flatMap((text) => [text, decode(text)]))];
  const reported = new Set();
  const report = (rule, key, message) => {
    if (reported.has(key)) return;
    reported.add(key);
    if (rule) fail(rule, path, message);
    else warn(path, message);
  };
  const scan = (rule, key, patterns, message) => {
    for (const view of views) {
      for (const pattern of patterns) {
        const where = locate(view, pattern);
        if (where) report(rule, key, message(where));
      }
    }
  };

  for (const [pattern, label] of IDENTITY) scan('a', label, [pattern], (w) => `${label} (${w})`);
  scan('b', 'colour', CD_COLOUR, (w) => `corporate-design colour (${w})`);
  // A listed SVG's license covers what it embeds.
  if (!ASSET_EXT.test(path)) {
    scan(
      'd',
      'inline',
      INLINE_ASSET,
      (w) => `inline asset (${w}) — ship it as a file in assets.json`
    );
  }
  scan('e', 'host', HOST_PATH, (w) => `root-relative asset or API path (${w}) — inject it instead`);
  scan(null, 'ambiguous', AMBIGUOUS, (w) => `possibly brand-specific, check by hand (${w})`);

  for (const view of views) {
    for (const [, reference] of view.matchAll(PATH_REFERENCE)) {
      const target = posix.normalize(posix.join(posix.dirname(path), reference));
      if (!target.startsWith(`${packageDir}/`)) {
        report('a', `escape:${reference}`, `path out of the package: "${reference}"`);
      }
    }
  }
  if (SOURCE_EXT.test(path) && !SPDX.test(utf8.split('\n').slice(0, 5).join('\n'))) {
    fail('f', path, 'missing "SPDX-License-Identifier: MPL-2.0" in the first 5 lines');
  }
}

/** 'font', 'unsupported' (a container whose name table this guard cannot read) or null. */
function fontContainer(path, bytes) {
  if (/\.(?:eot|ttc|otc)$/i.test(path)) return 'unsupported';
  if (bytes.length < 4) return FONT_EXT.test(path) ? 'font' : null;
  const signature = bytes.toString('latin1', 0, 4);
  if (signature === 'ttcf') return 'unsupported';
  if (
    ['wOFF', 'wOF2', 'OTTO', 'true'].includes(signature) ||
    bytes.readUInt32BE(0) === 0x00010000
  ) {
    return 'font';
  }
  if (!IMAGE_EXT.test(path) && bytes.length >= 36 && bytes.readUInt16LE(34) === 0x504c) {
    return 'unsupported'; // EOT magic number
  }
  return FONT_EXT.test(path) ? 'font' : null;
}

function checkFont(path, bytes, fail) {
  let names;
  try {
    names = readFontNames(bytes);
  } catch (error) {
    fail('d', path, `unreadable font: ${error.message}`);
    return;
  }
  const all = [...names.values()].flat().join('\n').normalize('NFC');
  const owner = FONT_OWNER.exec(all);
  if (owner) fail('d', path, `font names a brand-font owner: "${owner[0]}"`);
  const identity = IDENTITY.find(([pattern]) => pattern.test(all));
  if (identity) fail('d', path, `font name table mentions a ${identity[1]}`);
  const license = [13, 14].flatMap((id) => names.get(id) ?? []).join(' ');
  if (!FONT_LICENSE.test(license)) {
    fail('d', path, 'font name table declares no OFL or Apache license (name IDs 13/14)');
  }
}

function readManifest(packageDir, files, fail) {
  const file = files.find((f) => f.path === `${packageDir}/assets.json`);
  if (!file) return new Map();
  let assets;
  try {
    ({ assets } = JSON.parse(file.bytes.toString('utf8')));
  } catch (error) {
    fail('d', file.path, `not valid JSON: ${error.message}`);
    return new Map();
  }
  const entries = new Map();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const path = `${packageDir}/${asset.path}`;
    if (typeof asset.source !== 'string' || asset.source.trim() === '') {
      fail('d', path, 'assets.json entry has no source');
    }
    if (!ALLOWED_LICENSES.has(asset.license)) {
      fail('d', path, `license "${asset.license}" is not allowed in the core`);
    }
    entries.set(path, asset);
  }
  return entries;
}

export function checkFiles(files) {
  const failures = [];
  const warnings = [];
  const fail = (rule, path, message) => failures.push({ rule, path, message });
  const warn = (path, message) => warnings.push({ path, message });

  const packageDirs = new Set(files.map((f) => PACKAGE_DIR.exec(f.path)?.[0]).filter(Boolean));
  const manifest = new Map();
  for (const dir of packageDirs) {
    for (const [path, asset] of readManifest(dir, files, fail)) manifest.set(path, asset);
  }
  const present = new Set(files.map((f) => f.path.normalize('NFC')));
  for (const path of manifest.keys()) {
    if (!present.has(path)) fail('d', path, 'listed in assets.json but missing');
  }

  for (const { path: rawPath, bytes } of files) {
    const path = rawPath.normalize('NFC');
    const packageDir = PACKAGE_DIR.exec(path)?.[0] ?? '';
    const brandPath = BRAND_PATHS.find((pattern) => pattern.test(path));
    if (brandPath) fail('c', path, `brand asset or party content by file name (${brandPath})`);

    const hasNul = bytes.subarray(0, 8192).includes(0);
    if (ASSET_EXT.test(path) || hasNul) {
      if (!manifest.has(path)) {
        fail('d', path, 'asset not listed in assets.json');
      } else {
        const container = fontContainer(path, bytes);
        if (container === 'unsupported') fail('d', path, 'font container the guard cannot read');
        else if (container === 'font') checkFont(path, bytes, fail);
      }
    }
    if (!hasNul && !NOT_TEXT_EXT.test(path)) checkText(path, bytes, packageDir, fail, warn);
  }
  return { failures, warnings };
}
