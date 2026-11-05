/**
 * Der Bericht des Sharepic-Creators fürs Modell (Kontextblock, Loop-Werkzeuge):
 * sachliche Zeilen. Die Sätze für die Person: `berichtSaetze` in @gruenerator/shared.
 */

import { sharepicFormLabel, type SharepicBerichtEintrag } from '@gruenerator/contracts';

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
