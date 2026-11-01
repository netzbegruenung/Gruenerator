/**
 * Platzhalterfolien der Deck-Vorlagen: je Folientyp ein Beispiel mit
 * erkennbar leerem Text. Die Vorschauen und die Folie, die ein Klick in den
 * Vorlagen-Tab einfügt, bauen aus demselben Satz.
 */
import { type FolienTypId, type FolieSpec } from '@gruenerator/contracts/slides';

export const DECK_FOLIE_SAMPLES: Record<FolienTypId, FolieSpec> = {
  titel: { typ: 'titel', slots: { headline: 'Überschrift', unterzeile: 'Untertitel oder Anlass' } },
  liste: {
    typ: 'liste',
    slots: { headline: 'Überschrift', punkte: ['Erster Punkt', 'Zweiter Punkt', 'Dritter Punkt'] },
  },
  text: {
    typ: 'text',
    slots: { headline: 'Überschrift', text: 'Hier steht ein kurzer Fließtext zum Thema.' },
  },
  kernsatz: { typ: 'kernsatz', slots: { satz: 'Hier steht der Kernsatz' } },
  zahl: {
    typ: 'zahl',
    slots: { zahl: '42 %', text: 'Hier steht, was die Zahl bedeutet', quelle: 'Quelle' },
  },
  zitat: { typ: 'zitat', slots: { zitat: 'Hier steht das Zitat', name: 'Name' } },
  danke: { typ: 'danke', slots: { kontakt: 'Kontaktdaten' } },
};
