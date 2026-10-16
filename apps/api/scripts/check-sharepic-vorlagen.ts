/**
 * Editorial check of the private sharepic Vorlagen catalogue
 * (`$INTERN_CONTENT_DIR/sharepic-vorlagen/{de,at}.json`, the single Seiten
 * in `seiten/{de,at}.json` and the canvas Vorlagen in `canvas/{de,at}.json`). Run before merging a catalogue change in
 * gruenerator-intern:
 *
 *   INTERN_CONTENT_DIR=… pnpm --filter @gruenerator/api vorlagen:check
 *
 * Fails on entries the loader would skip (logged above the summary), on
 * missing thumbnails and on the problems in `vorlageProblems`/`seiteProblems`.
 * Whether a Seite's text fits each of its formats shows only in the previews.
 */
import { existsSync } from 'node:fs';

import {
  canvasVorlageThumbFile,
  listCanvasVorlagen,
  listSharepicSeiten,
  listSharepicVorlagen,
  sharepicSeiteThumbFile,
  sharepicVorlageThumbFile,
} from '../services/sharepicVorlagen/catalog.js';
import { seiteProblems, vorlageProblems } from '../services/sharepicVorlagen/vorlageProblems.js';

const vorlagen = listSharepicVorlagen(null);
const seiten = listSharepicSeiten(null);
const canvas = listCanvasVorlagen(null);
let failed = vorlagen.length === 0;
if (failed) console.error('No Vorlagen loaded — is INTERN_CONTENT_DIR set?');

function report(id: string, problems: string[]): void {
  if (!problems.length) return;
  failed = true;
  console.error(`${id}:\n  ${problems.join('\n  ')}`);
}

for (const v of vorlagen) {
  const problems = vorlageProblems(v);
  for (let seite = 1; seite <= v.spec.slides.length; seite++) {
    const thumb = sharepicVorlageThumbFile(v.id, seite);
    if (!thumb || !existsSync(thumb))
      problems.push(`no thumbnail for slide ${seite} (run the render script)`);
  }
  report(v.id, problems);
}

for (const s of seiten) {
  const problems = seiteProblems(s, s.locale, vorlagen);
  for (const format of s.formats) {
    const thumb = sharepicSeiteThumbFile(s.id, format);
    if (!thumb || !existsSync(thumb))
      problems.push(`no preview in ${format} (run the render script)`);
  }
  report(`seite ${s.id}`, problems);
}

for (const v of canvas) {
  const thumb = canvasVorlageThumbFile(v.id);
  report(`canvas ${v.id}`, thumb && existsSync(thumb) ? [] : ['no thumbnail (export it again)']);
}

const count = <T extends { locale: string }>(list: T[], locale: string) =>
  list.filter((v) => v.locale === locale).length;
console.log(
  `${vorlagen.length} Vorlagen (DE ${count(vorlagen, 'de-DE')}, AT ${count(vorlagen, 'de-AT')}), ` +
    `${seiten.length} Seiten (DE ${count(seiten, 'de-DE')}, AT ${count(seiten, 'de-AT')}), ` +
    `${canvas.length} canvas Vorlagen (DE ${count(canvas, 'de-DE')}, AT ${count(canvas, 'de-AT')})`
);
process.exit(failed ? 1 : 0);
