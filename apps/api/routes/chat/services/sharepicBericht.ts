/**
 * Der Bericht des Sharepic-Creators in zwei Sprachen: kurze Sätze für die
 * Person (Antwort) und sachliche Zeilen für das Modell (Kontextblock,
 * Loop-Werkzeuge). Beide lesen dieselben Einträge.
 */

import { sharepicFormLabel, type SharepicBerichtEintrag } from '@gruenerator/contracts';

const MAX_SAETZE = 2;

type Foto = Extract<SharepicBerichtEintrag, { art: 'foto' }>;

const TERMIN_SATZ =
  'Den Termin habe ich weggelassen, weil er im Auftrag fehlt. Nenn mir Datum und Ort, dann setze ich ihn ein.';
const REPARATUR_SATZ =
  'Ein Datum oder eine Uhrzeit, die nicht in deinem Auftrag standen, habe ich weggelassen.';

function fotoSatz(e: Foto): string {
  switch (e.status) {
    case 'freigestellt':
      return 'Dein Foto ist freigestellt auf dem Sharepic.';
    case 'ungeschnitten':
      return 'Dein Foto steht ungeschnitten auf dem Sharepic – freistellen hat nicht geklappt.';
    case 'nicht_verwendet':
      return e.grund
        ? `Dein Foto habe ich nicht verwendet: ${e.grund.replace(/[.\s]+$/, '')}.`
        : 'Dein Foto habe ich nicht verwendet.';
    case 'in_szene':
      return 'Dich habe ich mit deinem Foto als Vorlage in die Szene malen lassen.';
    case 'collage':
      return 'Die Szene mit dir hat nicht geklappt – ich habe dein Foto freigestellt davorgestellt.';
    case 'verwendet':
      return 'Dein Foto ist auf dem Sharepic.';
  }
}

/** Sätze für die Person: fehlt > foto > gestaltung > Rest, höchstens zwei. */
export function berichtSaetze(bericht: readonly SharepicBerichtEintrag[]): string[] {
  const saetze: string[] = [];
  for (const e of bericht) if (e.art === 'fehlt') saetze.push(TERMIN_SATZ);
  for (const e of bericht) if (e.art === 'foto') saetze.push(fotoSatz(e));
  for (const e of bericht) if (e.art === 'gestaltung') saetze.push(e.text);
  for (const e of bericht) {
    if (e.art === 'form' && e.statt) {
      saetze.push(
        `Als ${sharepicFormLabel(e.statt)} fehlte mir der Stoff, darum ist es ein ${sharepicFormLabel(e.form)} geworden.`
      );
    }
  }
  if (bericht.some((e) => e.art === 'repariert')) saetze.push(REPARATUR_SATZ);
  return [...new Set(saetze)].slice(0, MAX_SAETZE);
}

function zeile(e: SharepicBerichtEintrag): string {
  switch (e.art) {
    case 'fehlt':
      return 'Termin fehlte im Auftrag und wurde weggelassen.';
    case 'repariert':
      return `${e.feld} "${e.wert}" entfernt (stand nicht im Auftrag).`;
    case 'form':
      return e.statt
        ? `Form ${sharepicFormLabel(e.form)} statt ${sharepicFormLabel(e.statt)} (Stoff fehlte).`
        : `Form ${sharepicFormLabel(e.form)} (gewählt von ${e.von === 'person' ? 'der Person' : 'dem Creator'}).`;
    case 'foto': {
      const status = e.status.replace(/_/g, ' ');
      return `eigenes Foto ${e.id} – ${status}${e.grund ? ` (${e.grund})` : ''}.`;
    }
    case 'gestaltung':
      return e.text;
  }
}

/** Eine Zeile je Eintrag fürs Modell; leer bei leerem Bericht. */
export function berichtFuerKi(bericht: readonly SharepicBerichtEintrag[]): string {
  return bericht.map((e) => `Beim Erstellen: ${zeile(e)}`).join('\n');
}
