/**
 * Leichte Sprache (A1) — zweiter Nutzer derselben Bauform.
 *
 * Er ist der Beleg dafür, dass die Fabrik trägt: vier Felder unterscheiden ihn
 * von Einfacher Sprache, der Rest ist geteilt. Was sich unterscheidet, ist das
 * Regelwerk der Fassung — die beiden Prüfschritte bewerten nicht das Register,
 * sondern die Treue zum Original, und die misst man in beiden Fällen gleich.
 *
 * `systemRole: null` mit Absicht: anders als die Einfache-Sprache-Persona folgt
 * diese den Regeln des Netzwerks Leichte Sprache und wird redaktionell gepflegt
 * — sie bleibt vorerst in `INTERN_CONTENT_DIR`. Der Unterschied ist die
 * Zuständigkeit, nicht die Vertraulichkeit; ein späterer Umzug ins Repo ist ein
 * Einzeiler.
 */

import { buildTransferPipeline } from './transferPipeline.js';

export const LEICHTE_SPRACHE_PIPELINE = buildTransferPipeline({
  identifier: 'gruenerator-leichte-sprache',
  registerName: 'Leichte Sprache',
  levelLabel: 'Sprachniveau A1',
  versionTag: 'LS-Fassung',
  systemRole: null,
  ownDevices: [
    'eigene Zwischenüberschriften',
    'der Titel in Leichter Sprache',
    'Trennpunkte in zusammengesetzten Wörtern (Wahl·programm)',
    'ein Satz pro Zeile',
    'Aufzählungen anstelle von Fliesstext',
    'Worterklärungen, die das Regelwerk verlangt',
  ],
});
