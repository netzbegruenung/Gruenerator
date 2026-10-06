/**
 * The forms a sharepic can take. A request that names one gets it; otherwise
 * the creator's first call picks one from `formCatalog()`. Either way the
 * draft is checked against the form before it is accepted.
 */
import {
  SHAREPIC_FORMS,
  sharepicFormLabel,
  type SharepicFormId,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { type ExampleOccasion, type StyleguideChapter } from './styleguide.js';

interface FormRecipe {
  /** When the form fits — what the model reads when it chooses. */
  wann: string;
  kapitel: StyleguideChapter[];
  anlass: ExampleOccasion[];
}

export const FORM_RECIPES: Record<SharepicFormId, FormRecipe> = {
  einzelbild: {
    wann: 'eine Kachel mit Headline – Aufruf, Position oder Thema in einem Satz',
    kapitel: ['texte', 'fotos'],
    anlass: ['aufruf', 'thema'],
  },
  zitat: {
    wann: 'die Aussage einer genannten Person',
    kapitel: ['zitat'],
    anlass: ['zitat'],
  },
  karussell: {
    wann: 'Inhalt, der mehrere Schritte braucht: Erklärung, Kritik oder Geschichte über 3–8 Slides',
    kapitel: ['karussell'],
    anlass: ['karussell-erklaerung'],
  },
  interview: {
    wann: 'Fragen und Antworten einer Person über mehrere Slides',
    kapitel: ['interview'],
    anlass: ['interview'],
  },
  infografik: {
    wann: 'mehrere Punkte, Schritte, Mengen, ein Anteil oder eine große Zahl – jeweils mit gemaltem Bild',
    kapitel: ['infografik'],
    anlass: ['infografik'],
  },
  diagramm: {
    wann: 'eine Zahlenreihe oder eine Entwicklung über die Zeit',
    kapitel: ['diagramme'],
    anlass: ['zahlen'],
  },
  zahl: {
    wann: 'eine einzige Zahl ist die Botschaft, ohne Bild: groß, über die ganze Breite oder als Countdown („Noch 3 Tage“)',
    kapitel: ['liste-zahl'],
    anlass: ['zahlen'],
  },
  rechnung: {
    wann: 'ein Rechenweg oder eine Formel, die zeigt, wie eine Zahl zustande kommt',
    kapitel: ['liste-zahl'],
    anlass: ['zahlen'],
  },
  termine: {
    wann: 'mehrere Termine auf einen Blick – eine Woche, eine Tour, Aktionstage',
    kapitel: ['liste-zahl', 'veranstaltung'],
    anlass: ['veranstaltung'],
  },
  vergleich: {
    wann: 'der Plan der anderen gegen unseren',
    kapitel: ['iconliste-vergleich'],
    anlass: ['vergleich'],
  },
  faktencheck: {
    wann: 'eine verbreitete Behauptung gegen den Fakt',
    kapitel: ['iconliste-vergleich'],
    anlass: ['vergleich'],
  },
  faktenbild: {
    wann: 'eine starke Zahl auf einem gemalten Motiv',
    kapitel: ['faktenbild'],
    anlass: ['zahlen'],
  },
  veranstaltung: {
    wann: 'ein Termin mit Datum und Ort',
    kapitel: ['veranstaltung'],
    anlass: ['veranstaltung'],
  },
};

export function formCatalog(): string {
  return SHAREPIC_FORMS.map((f) => `- \`${f.id}\` — ${FORM_RECIPES[f.id].wann}`).join('\n');
}

// Most specific first: "Karussell mit Infografik" is held to the infographic.
const NAMED: [SharepicFormId, RegExp][] = [
  ['faktenbild', /faktenbild\p{L}*/giu],
  ['faktencheck', /(?:fakten|mythen)-?check\p{L}*/giu],
  ['infografik', /info-?gra(?:f|ph)i[kc]\p{L}*/giu],
  ['diagramm', /(?:balken|kreis|torten|linien)?-?diagramm\p{L}*/giu],
  [
    'vergleich',
    /vergleichs-?(?:grafik|bild|sharepic|kachel)\p{L}*|gegen(?:ü|ue)berstellung\p{L}*|als\s+vergleich|vergleich\s*:/giu,
  ],
  ['interview', /interview\p{L}*/giu],
  ['rechnung', /rechenweg\p{L}*|als\s+rechnung|rechnung\s*:/giu],
  ['termine', /termin(?:en?|übersicht|kalender|liste|plan)(?!\p{L})|save\s+the\s+dates?/giu],
  ['zahl', /gro(?:ß|ss)e[nr]?\s+zahl|countdown|noch\s+\d+\s+tage/giu],
  ['karussell', /karr?uss?ell\p{L}*|slider|carousel/giu],
  ['zitat', /zitat\p{L}*/giu],
  ['veranstaltung', /veranstaltung\p{L}*|einladung\p{L}*|termins?(?!\p{L})/giu],
  ['einzelbild', /einzelbild\p{L}*/giu],
];

// "kein Karussell", "ohne Zitat", "nicht als Infografik".
const NEGATED = /(?:kein\p{L}*|nicht|ohne)\s+(?:\p{L}+\s+)?$/iu;

/** The form a request names itself, or null when the creator should choose. */
export function namedSharepicForm(text: string): SharepicFormId | null {
  for (const [form, pattern] of NAMED) {
    for (const match of text.matchAll(pattern)) {
      const at = match.index;
      if (at > 0 && /\p{L}/u.test(text[at - 1]!)) continue;
      if (NEGATED.test(text.slice(Math.max(0, at - 24), at))) continue;
      return form;
    }
  }
  return null;
}

/** Why a draft is not the form it was meant to be, or null when it is. */
export function formMismatch(
  form: SharepicFormId,
  spec: SharepicSpec,
  hasScene: boolean
): string | null {
  const items = spec.slides.flatMap((slide) => slide.items);
  const has = (type: string) => items.some((item) => item.type === type);
  const label = sharepicFormLabel(form);
  switch (form) {
    case 'einzelbild':
      return spec.slides.length === 1 ? null : `${label}: genau eine Slide.`;
    case 'karussell':
      return spec.slides.length >= 3 ? null : `${label}: 3–8 Slides (Kapitel karussell).`;
    case 'zitat':
      return has('zitat') ? null : `${label}: setz die Aussage als {"type":"zitat"} mit Namen.`;
    case 'interview':
      return has('frage')
        ? null
        : `${label}: Cover-Zitat, dann je Slide eine {"type":"frage"} mit Antwort (Kapitel interview).`;
    case 'infografik':
      return has('infografik')
        ? null
        : `${label}: setz die Punkte als {"type":"infografik","form","punkte":[…]} – mit icon und motiv je Punkt (Kapitel infografik).`;
    case 'diagramm':
      return has('diagramm') ? null : `${label}: setz die Zahlen als {"type":"diagramm"}.`;
    case 'zahl':
      return has('zahl')
        ? null
        : `${label}: setz die Zahl als {"type":"zahl","stil","wert","label"?} (Kapitel liste-zahl).`;
    case 'rechnung':
      return has('rechnung')
        ? null
        : `${label}: setz den Rechenweg als {"type":"rechnung","glieder":[…],"ergebnis"} (Kapitel liste-zahl).`;
    case 'termine':
      return has('termine')
        ? null
        : `${label}: setz die Termine als {"type":"termine","eintraege":[{"datum","titel","ort"?}, …]} auf eine Slide (Kapitel liste-zahl).`;
    case 'vergleich':
      return has('vergleich')
        ? null
        : `${label}: setz die Gegenüberstellung als {"type":"vergleich"}.`;
    case 'faktencheck':
      return has('faktencheck')
        ? null
        : `${label}: setz Mythos und Fakt als {"type":"faktencheck","paare":[…]}.`;
    case 'faktenbild':
      return hasScene
        ? null
        : `${label}: eine Slide (Einzelbild: die Slide, Karussell: das Cover) bekommt background {"kind":"szene","motiv","textSeite"} – motiv auf Englisch, nur die Szene zum Thema, kein Text und keine Zahlen.`;
    case 'veranstaltung':
      return spec.slides.some((slide) => slide.datum)
        ? null
        : `${label}: Datum (und Ort) gehören in "datum" der Slide (Kapitel veranstaltung).`;
  }
}
