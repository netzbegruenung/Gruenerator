import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dreizeilen = require('./dreizeilen.json');
// Österreich: eigenes Satzmaß (max 15 statt 35 Zeichen pro Zeile) plus der
// Hinweis, dass Zeile 2 die gelbe kursive Betonung trägt. Der Handler wählt
// diesen Eintrag über die Konvention `<type>_at`, wenn userLocale de-AT ist.
const dreizeilen_at = require('./dreizeilen_at.json');
const info = require('./info.json');
const simple = require('./simple.json');
const slider = require('./slider.json');
const veranstaltung = require('./veranstaltung.json');
const zitat = require('./zitat.json');
const zitat_pure = require('./zitat_pure.json');

export { dreizeilen, dreizeilen_at, zitat, zitat_pure, info, veranstaltung, simple, slider };

export default {
  dreizeilen,
  dreizeilen_at,
  zitat,
  zitat_pure,
  info,
  veranstaltung,
  simple,
  slider,
};
