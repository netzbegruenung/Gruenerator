import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dreizeilen = require('./dreizeilen.json');
const headline = require('./headline.json');
const info = require('./info.json');
const simple = require('./simple.json');
const slider = require('./slider.json');
const veranstaltung = require('./veranstaltung.json');
const zitat = require('./zitat.json');
const zitat_pure = require('./zitat_pure.json');

export { dreizeilen, zitat, zitat_pure, headline, info, veranstaltung, simple, slider };

export default {
  dreizeilen,
  zitat,
  zitat_pure,
  headline,
  info,
  veranstaltung,
  simple,
  slider,
};
