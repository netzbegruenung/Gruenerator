/**
 * Maschinenlesbare KI-Kennzeichnung für erzeugte und bearbeitete Bilder
 * (Art. 50 Abs. 2 KI-VO).
 *
 * Das sichtbare Wasserzeichen „KI-Generiert" darf die Nutzer*in abschalten —
 * die maschinenlesbare Kennzeichnung darf sie nicht verlieren. Deshalb wird
 * dieser XMP-Block in JEDEM Ausgabepfad geschrieben, auch bei
 * `kiLabel: 'none'`.
 *
 * Wir schreiben `Iptc4xmpExt:DigitalSourceType = trainedAlgorithmicMedia` —
 * dieselbe IPTC-NewsCode-Vokabel, die auch die C2PA-Spezifikation in ihrer
 * `c2pa.actions`-Assertion für KI-erzeugte Inhalte verwendet, und die Google,
 * LinkedIn und die gängigen Bildredaktionen bereits auslesen. Ein voll
 * signierter C2PA-Manifest-Block setzt ein Signaturzertifikat einer in der
 * C2PA-Trust-List geführten CA voraus; solange das nicht vorliegt, wäre ein
 * selbstsigniertes Manifest zwar vorhanden, aber unvertrauenswürdig — die
 * IPTC-Angabe ist ohne Zertifikat sofort wirksam und C2PA-kompatibel.
 * Follow-up: siehe `docs/CLAUDE-ki-vo.md`.
 */

import sharp from 'sharp';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('aiContentCredentials');

/** IPTC NewsCode für „vollständig von einem trainierten Modell erzeugt". */
const DIGITAL_SOURCE_TYPE =
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

const CREDIT = 'KI-Generiert mit dem Grünerator';

/**
 * Ein XMP-Paket ohne Zeitstempel — der Puffer soll für dieselbe Eingabe
 * reproduzierbar sein, damit Caches und Tests nicht bei jedem Lauf abweichen.
 */
const XMP_PACKET = [
  '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
  '<rdf:Description rdf:about=""',
  ' xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"',
  ' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
  ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
  ` Iptc4xmpExt:DigitalSourceType="${DIGITAL_SOURCE_TYPE}"`,
  ` photoshop:Credit="${CREDIT}">`,
  `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${CREDIT}</rdf:li></rdf:Alt></dc:rights>`,
  '</rdf:Description>',
  '</rdf:RDF>',
  '</x:xmpmeta>',
  '<?xpacket end="w"?>',
].join('');

/**
 * Schreibt die maschinenlesbare KI-Kennzeichnung in die Metadaten.
 *
 * Schlägt das fehl (unbekanntes Format, defekter Puffer), geben wir das Bild
 * unverändert zurück: ein Bild ohne Metadaten ist besser als gar keins, und
 * das sichtbare Wasserzeichen ist in aller Regel ohnehin noch drauf.
 */
export async function embedAiContentCredentials(imageBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(imageBuffer).withXmp(XMP_PACKET).toBuffer();
  } catch (error) {
    log.warn('[aiContentCredentials] XMP konnte nicht geschrieben werden:', error);
    return imageBuffer;
  }
}

export const AI_CONTENT_CREDENTIALS = {
  digitalSourceType: DIGITAL_SOURCE_TYPE,
  credit: CREDIT,
} as const;
