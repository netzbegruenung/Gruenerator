/**
 * Words that never belong on a party sharepic unless the request itself uses
 * them. The model slips now and then — „Busen" for the plural of „Bus" — and
 * the review cannot catch it: the word is spelled correctly, only wrong.
 *
 * Whole words only, lowercase. A compound that contains one („Sexualkunde")
 * is a different word and passes; add its forms here if it must not.
 */
export const EMBARRASSING_WORDS: ReadonlySet<string> = new Set([
  // body
  'busen',
  'brüste',
  'titten',
  'arsch',
  'ärsche',
  'hintern',
  'penis',
  'vagina',
  'schwanz',
  'möse',
  'fotze',
  'nackt',
  'nackte',
  'nackten',
  'nackter',
  // sex
  'sex',
  'sexy',
  'porno',
  'pornos',
  'geil',
  'geile',
  'geiler',
  'geilen',
  'fick',
  'ficken',
  'fickt',
  'gefickt',
  'wichsen',
  'wichser',
  'hure',
  'huren',
  'nutte',
  'nutten',
  'schlampe',
  'schlampen',
  'puff',
  'bordell',
  'orgasmus',
  // vulgar
  'scheiße',
  'scheisse',
  'scheiß',
  'scheiss',
  'kacke',
  'pisse',
  'arschloch',
  'arschlöcher',
  // insults
  'idiot',
  'idioten',
  'vollidiot',
  'vollidioten',
  'trottel',
  'depp',
  'deppen',
  'spast',
  'spasti',
  'missgeburt',
  'versager',
  // Austrian
  'oasch',
  'gschissen',
  'wappler',
  'beidl',
  'fut',
]);
