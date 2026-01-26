import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dreizeilen = require('./dreizeilen.json');
const zitat = require('./zitat.json');
const zitat_pure = require('./zitat_pure.json');
const headline = require('./headline.json');
const info = require('./info.json');
const veranstaltung = require('./veranstaltung.json');
const simple = require('./simple.json');

export { dreizeilen, zitat, zitat_pure, headline, info, veranstaltung, simple };

export default {
  dreizeilen,
  zitat,
  zitat_pure,
  headline,
  info,
  veranstaltung,
  simple,
};
