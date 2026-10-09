/**
 * Editorial check of the private sharepic Vorlagen catalogue
 * (`$INTERN_CONTENT_DIR/sharepic-vorlagen/{de,at}.json`). Run before merging a
 * catalogue change in gruenerator-intern:
 *
 *   INTERN_CONTENT_DIR=… pnpm --filter @gruenerator/api vorlagen:check
 *
 * Fails on entries the loader would skip (logged above the summary), on
 * missing thumbnails and on the problems in `vorlageProblems`.
 */
import { existsSync } from 'node:fs';

import {
  listSharepicVorlagen,
  sharepicVorlageThumbFile,
} from '../services/sharepicVorlagen/catalog.js';
import { vorlageProblems } from '../services/sharepicVorlagen/vorlageProblems.js';

const vorlagen = listSharepicVorlagen(null);
let failed = vorlagen.length === 0;
if (failed) console.error('No Vorlagen loaded — is INTERN_CONTENT_DIR set?');

for (const v of vorlagen) {
  const problems = vorlageProblems(v);
  const thumb = sharepicVorlageThumbFile(v.id);
  if (!thumb || !existsSync(thumb)) problems.push('no thumbnail (run the render script)');
  if (problems.length) {
    failed = true;
    console.error(`${v.id}:\n  ${problems.join('\n  ')}`);
  }
}

const count = (locale: string) => vorlagen.filter((v) => v.locale === locale).length;
console.log(`${vorlagen.length} Vorlagen (DE ${count('de-DE')}, AT ${count('de-AT')})`);
process.exit(failed ? 1 : 0);
