// Red probes for the ggraphic boundary guard: a clean in-memory package must
// pass, and each probe — the clean package plus one leak — must trip its rule.
import { checkFiles } from './rules.mjs';
import { buildSfnt, toWoff, toWoff2 } from './syntheticFonts.mjs';

const PKG = 'packages/ggraphic-core';
const SPDX = '// SPDX-License-Identifier: MPL-2.0\n';
const OFL_NOTICE = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.';
const OFL_FONT = [
  [0, 'Copyright 2020 The Probe Authors'],
  [13, OFL_NOTICE],
];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const text = (path, content) => ({ path: `${PKG}/${path}`, bytes: Buffer.from(content, 'utf8') });
const binary = (path, bytes) => ({ path: `${PKG}/${path}`, bytes });
const source = (content) => text('src/probe.ts', `${SPDX}${content}\n`);
const css = (content) =>
  text('src/probe.css', `/* SPDX-License-Identifier: MPL-2.0 */\n${content}\n`);
const entry = (path, license = 'OFL-1.1') => ({
  path,
  source: 'https://example.org/probe',
  license,
});
const svgAsset = (path, body) => ({
  files: [text(path, `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`)],
  assets: [entry(path, 'CC0-1.0')],
});
const listedFont = (path, bytes) => ({ files: [binary(path, bytes)], assets: [entry(path)] });

function pkg({ files = [], assets = [] } = {}) {
  const ofl = buildSfnt(OFL_FONT);
  const fonts = [
    ['fonts/Probe.ttf', ofl],
    ['fonts/Probe.woff', toWoff(ofl)],
    ['fonts/Probe.woff2', toWoff2(ofl)],
  ];
  const peep = svgAsset(
    'img/peep.svg',
    '<path d="M271.005538 90.28442-52.621"/>' +
      '<image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE="/>'
  );
  return [
    text(
      'package.json',
      JSON.stringify({ name: '@ggraphic/core', private: true, license: 'MPL-2.0' })
    ),
    text(
      'src/index.ts',
      `${SPDX}import { y } from '../src/y';\n` +
        `export const flag = '#003399';\nexport const white = '#FFFFFF';\n` +
        `export const note = 'grüne Fläche, die grünen Flächen, Picknick im Grünen';\n` +
        `export const word = 'Vorlage';\nexport const seed = 316049;\n` +
        'export const a = `data:image/svg+xml;base64,${btoa(y)}`;\n' +
        'export const b = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(y)}`;\n' +
        `export const docs = 'https://example.org/api/v1/items';\n`
    ),
    text(
      'assets.json',
      JSON.stringify({
        assets: [...fonts.map(([path]) => entry(path)), ...peep.assets, ...assets],
      })
    ),
    ...fonts.map(([path, bytes]) => binary(path, bytes)),
    ...peep.files,
    ...files,
  ];
}

// [rules, label, leak] — a string leak is the body of src/probe.ts.
const PROBES = [
  ['a', 'party name', `export const s = 'Bündnis 90/Die Grünen';`],
  ['a', 'escaped umlaut', `export const s = 'KI-generiert mit dem Gr\\u00fcnerator';`],
  ['a', 'decomposed umlaut (NFD)', `export const s = 'Grünerator';`.normalize('NFD')],
  ['a', 'politician', `export const s = 'Felix Banaszak';`],
  ['a', 'local machine path', `export const s = '/Users/someone/x';`],
  ['a', 'import out of the package', `import x from '../../canvas-editor/src/x';`],
  ['a', 'party name with JS escape', `export const s = 'Die Gr\\u00fcnen';`],
  ['a', 'party name with entity', `export const s = 'B&Uuml;NDNIS 90';`],
  [
    'a',
    'party name with numeric entity in SVG',
    svgAsset('img/t.svg', '<title>DIE GR&#xDC;NEN</title>'),
  ],
  ['a', 'decimal entity', `export const s = 'Gr&#252;nerator';`],
  ['a', 'ES2015 escape', `export const s = 'Gr\\u{fc}nerator';`],
  ['a', 'hex escape', `export const s = 'Gr\\xfcnerator';`],
  [
    'a',
    'Latin-1 file',
    { files: [binary('docs/notes.md', Buffer.from('Mit dem Grünerator\n', 'latin1'))] },
  ],
  ['a', 'ASCII party name', `export const s = 'Die Gruenen';`],
  ['a', 'ASCII party name upper case', `export const s = 'BUENDNIS 90/DIE GRUENEN';`],
  ['a', 'party slug', `export const s = 'buendnis-90-die-gruenen';`],
  ['a', 'party name lower case', `export const s = 'bündnis 90';`],
  ['a', 'party hashtag', `export const s = '#DieGrünen';`],
  ['a', 'party compound', `export const s = 'Grünen-Fraktion';`],
  ['a', 'party youth', `export const s = 'Grüne Jugend';`],
  ['a', 'operator name', `export const s = '© netzbegrünung e.V.';`],
  ['a', 'bare party handle', `export const s = '@gruene';`],
  ['a', 'CSS @import out of the package', { files: [css(`@import '../../canvas-editor/x.css';`)] }],
  [
    'a',
    'CSS url() out of the package',
    { files: [css(`a { src: url('../../canvas-editor/x.woff2'); }`)] },
  ],
  [
    'a',
    'unquoted url() out of the package',
    { files: [css('a { background: url(../../../apps/web/public/x.svg); }')] },
  ],
  [
    'a',
    'new URL() out of the package',
    `export const u = new URL('../../../apps/web/x.svg', import.meta.url);`,
  ],
  ['a', 'triple-slash reference out of the package', `/// <reference path="../../x.d.ts" />`],
  ['a', 'brand asset id', `export const s = 'gruene-de-logo';`],
  ['a', 'suffixed wordmark identifier', `export const DE_WORDMARKS = [];`],
  ['a', 'suffixed Balken identifier', `export type BalkenGroupProps = {};`],
  ['a', 'logo variant identifier', `export const logoAtWhite = 1;`],
  ['b', 'CD colour in CSS', { files: [css('a { color: #005538; }')] }],
  ['b', 'CD colour with alpha', `export const c = '#005538CC';`],
  ['b', 'URL-encoded CD colour', `export const c = '%23f5f1e9';`],
  ['b', 'CD colour as rgba()', { files: [css('a { color: rgba(0, 85, 56, 0.3); }')] }],
  ['b', 'CD colour as ARGB literal', `export const c = 0xFF005538;`],
  ['b', 'CD colour inside a listed SVG', svgAsset('img/fill.svg', '<rect fill="#005538"/>')],
  [
    ['c', 'd'],
    'brand font file name',
    { files: [binary('fonts/GrueneType.woff2', toWoff2(buildSfnt(OFL_FONT)))] },
  ],
  ['c', 'party logo with umlaut', { files: [binary('img/Grüne_at_Logo.svg.png', PNG_SIGNATURE)] }],
  ['c', 'unDraw thumbnail', { files: [binary('img/thumbs/undraw/x.png', PNG_SIGNATURE)] }],
  ['c', 'unDraw registry', { files: [text('src/undraw.ts', `${SPDX}export {};\n`)] }],
  ['c', 'logo before party name', svgAsset('img/logo-gruene.svg', '')],
  ['d', 'binary without manifest entry', { files: [binary('img/x.png', PNG_SIGNATURE)] }],
  [
    'd',
    'font owned by Baianat',
    listedFont(
      'fonts/Other.woff',
      toWoff(
        buildSfnt([
          [0, 'Copyright 2023 by Baianat. All rights reserved.'],
          [13, OFL_NOTICE],
        ])
      )
    ),
  ],
  [
    'd',
    'font without license name',
    listedFont('fonts/Bare.woff2', toWoff2(buildSfnt([[0, 'Copyright 2020 Probe']]))),
  ],
  [
    'd',
    'font under a neutral extension',
    listedFont(
      'fonts/Neutral.bin',
      toWoff(
        buildSfnt([
          [0, 'Copyright Hoefler & Co.'],
          [13, OFL_NOTICE],
        ])
      )
    ),
  ],
  [
    'd',
    'font naming the party',
    listedFont(
      'fonts/Party.ttf',
      buildSfnt([
        [0, 'Copyright Die Grünen'],
        [13, OFL_NOTICE],
      ])
    ),
  ],
  [
    'd',
    'font collection',
    listedFont('fonts/x.ttc', Buffer.concat([Buffer.from('ttcf'), Buffer.alloc(12)])),
  ],
  [
    'd',
    'EOT font',
    listedFont('fonts/x.eot', Object.assign(Buffer.alloc(64), { 34: 0x4c, 35: 0x50 })),
  ],
  [
    'd',
    'license outside the allowlist',
    {
      files: [text('img/flag.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')],
      assets: [entry('img/flag.svg', 'CC-BY-NC-SA-4.0')],
    },
  ],
  ['d', 'manifest entry without file', { assets: [entry('img/missing.svg', 'CC0-1.0')] }],
  ['d', 'inline base64 asset', `export const i = 'data:image/svg+xml;base64,PHN2Zz4=';`],
  [
    'd',
    'inline font with charset',
    `export const i = 'data:font/woff2;charset=utf-8;base64,d09GMgABAAAA';`,
  ],
  [
    'd',
    'inline font as application type',
    `export const i = 'data:application/font-woff;charset=utf-8;base64,d09GRgABAAAA';`,
  ],
  [
    'd',
    'inline asset in upper case',
    `export const i = 'DATA:IMAGE/PNG;BASE64,iVBORw0KGgoAAAANSUhEUg==';`,
  ],
  [
    'd',
    'inline SVG literal',
    `export const i = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";`,
  ],
  [
    'd',
    'NUL bytes under an unknown extension',
    { files: [binary('misc/blob.dat', Buffer.from([0x41, 0x00, 0x42]))] },
  ],
  ['e', 'root-relative asset path', `export const s = '/sonnenblume_tanne.svg';`],
  ['e', 'API path', `export const s = '/api/share/abc';`],
  [
    'e',
    'host root in a template',
    'export const s = `${baseUrl}/illustrations/${source}/${file}`;',
  ],
  ['e', 'host root concatenated', `export const s = '/illustrations/' + name;`],
  ['e', 'asset path with query', `export const s = '/x.svg?v=2';`],
  ['e', 'unquoted host url()', { files: [css('a { background: url(/imagine/previews/x.jpg); }')] }],
  ['f', 'missing SPDX header', { files: [text('src/probe.ts', 'export const s = 1;\n')] }],
];

export const PROBE_COUNT = PROBES.length + 1;

export function runSelfTest() {
  const problems = [];
  const clean = checkFiles(pkg());
  if (clean.failures.length > 0 || clean.warnings.length > 0) {
    problems.push(
      `clean package not clean: ${JSON.stringify([...clean.failures, ...clean.warnings])}`
    );
  }
  for (const [rules, label, leak] of PROBES) {
    const probe = typeof leak === 'string' ? { files: [source(leak)] } : leak;
    const tripped = new Set(checkFiles(pkg(probe)).failures.map((f) => f.rule));
    for (const rule of [rules].flat()) {
      if (!tripped.has(rule)) {
        problems.push(
          `probe "${label}" did not trip (${rule}); tripped: ${[...tripped].join(', ') || 'nothing'}`
        );
      }
    }
  }
  const ambiguous = checkFiles(pkg({ files: [source(`export const s = 'Tanne';`)] }));
  if (ambiguous.failures.length > 0 || ambiguous.warnings.length === 0) {
    problems.push('probe "ambiguous word" must warn without failing');
  }
  return problems;
}
