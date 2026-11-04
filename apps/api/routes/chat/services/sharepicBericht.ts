/**
 * Der Bericht des Sharepic-Creators in zwei Sprachen: kurze Sätze für die
 * Person (Antwort) und sachliche Zeilen für das Modell (Kontextblock,
 * Loop-Werkzeuge). Beide lesen dieselben Einträge.
 */

import { sharepicFormLabel, type SharepicBerichtEintrag } from '@gruenerator/contracts';

const MAX_REST_SAETZE = 2;

type Foto = Extract<SharepicBerichtEintrag, { art: 'foto' }>;

const TERMIN_SATZ =
  'Den Termin habe ich weggelassen, weil er im Auftrag fehlt. Nenn mir Datum und Ort, dann setze ich ihn ein.';
const REPARATUR_SATZ =
  'Ein Datum oder eine Uhrzeit, die nicht in deinem Auftrag standen, habe ich weggelassen.';

function fotoSatz(status: Foto['status'], gruende: string[], mehrere: boolean): string {
  const dein = mehrere ? 'Deine Fotos' : 'Dein Foto';
  switch (status) {
    case 'freigestellt':
      return `${dein} ${mehrere ? 'sind' : 'ist'} freigestellt auf dem Sharepic.`;
    case 'ungeschnitten': {
      // The Szene reason carries both failures; the plain cut-out one is this sentence already.
      const szene = gruende.find((g) => g.startsWith('Die Szene'));
      if (szene) {
        return `${dein} ${mehrere ? 'stehen' : 'steht'} ungeschnitten auf dem Sharepic – ${szene.replace(/[.\s]+$/, '')}.`;
      }
      return `${dein} ${mehrere ? 'stehen' : 'steht'} ungeschnitten auf dem Sharepic – freistellen hat nicht geklappt.`;
    }
    case 'nicht_verwendet': {
      const grund = gruende.map((g) => g.replace(/[.\s]+$/, '')).join('; ');
      return `${dein} habe ich nicht verwendet${grund ? `: ${grund}` : ''}.`;
    }
    case 'in_szene':
      return mehrere
        ? 'Dich habe ich mit deinen Fotos als Vorlage in die Szene malen lassen.'
        : 'Dich habe ich mit deinem Foto als Vorlage in die Szene malen lassen.';
    case 'collage':
      return mehrere
        ? 'Die Szene mit dir hat nicht geklappt – ich habe deine Fotos freigestellt davorgestellt.'
        : 'Die Szene mit dir hat nicht geklappt – ich habe dein Foto freigestellt davorgestellt.';
    case 'verwendet':
      return `${dein} ${mehrere ? 'sind' : 'ist'} auf dem Sharepic.`;
  }
}

/**
 * Sätze für die Person: fehlt > foto > gestaltung > Rest. Fotos gleichen
 * Status' ergeben einen Satz. Gekappt wird nur der Rest (form, repariert) auf
 * zwei — was ein Foto oder die Szene betrifft, verschwindet nie.
 */
export function berichtSaetze(bericht: readonly SharepicBerichtEintrag[]): string[] {
  const saetze: string[] = [];
  for (const e of bericht) if (e.art === 'fehlt') saetze.push(TERMIN_SATZ);
  const fotos = new Map<Foto['status'], Foto[]>();
  for (const e of bericht) {
    if (e.art === 'foto') fotos.set(e.status, [...(fotos.get(e.status) ?? []), e]);
  }
  for (const [status, liste] of fotos) {
    const gruende = liste.flatMap((f) => (f.grund ? [f.grund] : []));
    saetze.push(fotoSatz(status, gruende, liste.length > 1));
  }
  for (const e of bericht) if (e.art === 'gestaltung') saetze.push(e.text);
  const rest: string[] = [];
  for (const e of bericht) {
    if (e.art === 'form' && e.statt) {
      rest.push(
        `Als ${sharepicFormLabel(e.statt)} fehlte mir der Stoff, darum ist es ein ${sharepicFormLabel(e.form)} geworden.`
      );
    }
  }
  if (bericht.some((e) => e.art === 'repariert')) rest.push(REPARATUR_SATZ);
  return [...new Set([...saetze, ...rest.slice(0, MAX_REST_SAETZE)])];
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
