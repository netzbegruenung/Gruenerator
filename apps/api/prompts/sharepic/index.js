import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dreizeilen = require('./dreizeilen.json');
const zitat = require('./zitat.json');
const zitat_pure = require('./zitat_pure.json');
const headline = require('./headline.json');
const info = require('./info.json');
const text2sharepic = require('./text2sharepic.json');
const veranstaltung = require('./veranstaltung.json');

export {
  dreizeilen,
  zitat,
  zitat_pure,
  headline,
  info,
  text2sharepic,
  veranstaltung
};

export default {
  dreizeilen,
  zitat,
  zitat_pure,
  headline,
  info,
  text2sharepic,
  veranstaltung
};
