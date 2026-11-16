/**
 * Zuordnung KV-Name (wie in den Reden, `ConventionSpeechPublic.kv`) → AGS des
 * Kreises bzw. der kreisfreien Stadt (VG250, NRW-Präfix 05). Schlüssel sind
 * kleingeschrieben; Schreibvarianten stehen als eigene Einträge.
 *
 * - „Aachen“ meint die StädteRegion Aachen (05334); die Stadt Aachen ist Teil davon.
 * - „Bochum&Wattenscheid“ ist der KV der kreisfreien Stadt Bochum.
 * - Landesweite Gliederungen (z. B. GRÜNE JUGEND NRW) haben keinen Kreis → null.
 */
const KV_TO_AGS: Record<string, string> = {
  düsseldorf: '05111',
  duisburg: '05112',
  essen: '05113',
  krefeld: '05114',
  mönchengladbach: '05116',
  'mülheim an der ruhr': '05117',
  mülheim: '05117',
  oberhausen: '05119',
  remscheid: '05120',
  solingen: '05122',
  wuppertal: '05124',
  kleve: '05154',
  mettmann: '05158',
  'rhein-kreis-neuss': '05162',
  'rhein-kreis neuss': '05162',
  neuss: '05162',
  viersen: '05166',
  wesel: '05170',
  bonn: '05314',
  köln: '05315',
  leverkusen: '05316',
  aachen: '05334',
  städteregion: '05334',
  'städteregion aachen': '05334',
  düren: '05358',
  'rhein-erft-kreis': '05362',
  'rhein-erft': '05362',
  euskirchen: '05366',
  heinsberg: '05370',
  oberberg: '05374',
  'oberbergischer kreis': '05374',
  'rheinisch-bergischer kreis': '05378',
  'rhein-sieg': '05382',
  'rhein-sieg-kreis': '05382',
  bottrop: '05512',
  gelsenkirchen: '05513',
  münster: '05515',
  borken: '05554',
  coesfeld: '05558',
  recklinghausen: '05562',
  steinfurt: '05566',
  warendorf: '05570',
  bielefeld: '05711',
  gütersloh: '05754',
  herford: '05758',
  höxter: '05762',
  lippe: '05766',
  'minden-lübbecke': '05770',
  paderborn: '05774',
  bochum: '05911',
  'bochum&wattenscheid': '05911',
  dortmund: '05913',
  hagen: '05914',
  hamm: '05915',
  herne: '05916',
  'ennepe-ruhr': '05954',
  'ennepe-ruhr-kreis': '05954',
  hochsauerland: '05958',
  hochsauerlandkreis: '05958',
  'märkischer kreis': '05962',
  olpe: '05966',
  'siegen-wittgenstein': '05970',
  soest: '05974',
  unna: '05978',
};

export function kvToAgs(kv: string): string | null {
  return KV_TO_AGS[kv.trim().toLowerCase()] ?? null;
}
