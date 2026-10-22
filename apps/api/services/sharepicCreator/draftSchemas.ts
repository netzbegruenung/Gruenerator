import {
  SHAREPIC_EMOJI,
  SHAREPIC_FORMS,
  sharepicCreatorLocaleSchema,
  sharepicFormSchema,
  sharepicFormatSchema,
  sharepicBackgroundSchema,
  sharepicIconSchema,
  sharepicItemSchema,
  sharepicSlideSchema,
  sharepicTextSideSchema,
  sharepicThemaSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

import {
  EXAMPLE_OCCASIONS,
  exampleOccasionSchema,
  STYLEGUIDE_CHAPTERS,
  styleguideChapterSchema,
} from './styleguide.js';
import { structureOf } from './toolSchema.js';

export const needsSchema = z.object({
  land: sharepicCreatorLocaleSchema,
  anlass: z.array(exampleOccasionSchema).max(2),
  kapitel: z.array(styleguideChapterSchema).max(Object.keys(STYLEGUIDE_CHAPTERS).length),
  // A carousel may want a photo per slide.
  fotos_suchen: z.array(z.string().trim().min(2)).max(6),
  form: sharepicFormSchema,
  alternativen: z.array(sharepicFormSchema).max(2),
});
export type Needs = z.infer<typeof needsSchema>;

export const NEEDS_SCHEMA = {
  type: 'object',
  properties: {
    land: {
      type: 'string',
      enum: ['de-DE', 'de-AT'],
      description:
        'Für welches Land: Corporate Design der deutschen oder der österreichischen Grünen',
    },
    anlass: {
      type: 'array',
      items: { type: 'string', enum: [...EXAMPLE_OCCASIONS] },
      description: 'Welche Beispiel-Sharepics passen (1–2)',
    },
    kapitel: { type: 'array', items: { type: 'string', enum: Object.keys(STYLEGUIDE_CHAPTERS) } },
    fotos_suchen: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Englische Suchbegriffe für Stockfotos (bei Karussells auch mehrere), leer wenn kein Foto',
    },
    form: {
      type: 'string',
      enum: SHAREPIC_FORMS.map((f) => f.id),
      description: 'Welche Form das Sharepic bekommt',
    },
    alternativen: {
      type: 'array',
      items: { type: 'string', enum: SHAREPIC_FORMS.map((f) => f.id) },
      description: 'Zwei andere Formen, die zum selben Auftrag auch passen würden',
    },
  },
  required: ['land', 'anlass', 'kapitel', 'fotos_suchen', 'form', 'alternativen'],
};

/** `takeScene` turns it into a painted background before the spec is validated. */
const SCENE_BACKGROUND = {
  type: 'object',
  properties: {
    kind: { type: 'string', const: 'szene' },
    motiv: { type: 'string' },
    textSeite: { type: 'string', enum: sharepicTextSideSchema.options },
  },
  required: ['kind', 'motiv', 'textSeite'],
};

const BACKGROUND_STRUCTURE = structureOf(sharepicBackgroundSchema);
const slideShape = sharepicSlideSchema.shape;

const SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    background: {
      anyOf: [...(BACKGROUND_STRUCTURE.anyOf as unknown[]), SCENE_BACKGROUND],
      description:
        '{"kind":"farbe","color"} | {"kind":"foto","filename","textSeite":"unten"|"oben"|"links"|"rechts"} | {"kind":"foto-oben","filename","panelColor"} | {"kind":"foto-unten","filename","panelColor"} | {"kind":"szene","motiv","textSeite"} (filename: Stockfoto-Datei, id eines eigenen Fotos wie "upload:1" oder ein schon gemalter Hintergrund "ki:…", in einer Vorlage auch ihr Foto "vorlage:…"; szene: ein neu gemalter Hintergrund nur für ein Faktenbild, motiv auf Englisch, nur die Szene)',
    },
    position: { type: 'string', enum: ['oben', 'mitte', 'unten'] },
    align: { type: 'string', enum: ['links', 'zentriert'] },
    items: {
      type: 'array',
      description: `Der Textblock in Lesereihenfolge: {"type":"dachzeile","text"} | {"type":"headline","lines":[…],"akzent"?:Zeilenindex oder [Indizes],"groesse"?:"gross"} (groesse nur, wenn die Person die Headline bzw. Schrift größer haben will – dann groesse setzen und die Zeilen NICHT neu umbrechen oder kürzen; das Programm setzt sie größer) | {"type":"absatz","text","betont"?:true} | {"type":"text","text"} | {"type":"zitat","text","name","funktion"?,"quelle"?,"seite"?:"gegner"} (gegner: die Aussage der anderen Seite, gedämpft mit ✗ – die nächsten Slides antworten mit „Fakt ist:“) | {"type":"schlagzeile","stil":"ausriss"|"karte","medium","titel","datum"?} (nur eine Schlagzeile, die Auftrag oder Quellen wörtlich nennen) | {"type":"bingo","felder":[…9 oder 16 kurze Phrasen]} | {"type":"frage","text","von"?} | {"type":"liste","items":[…],"stil"?:"punkte"|"ziffern"|"pfeile"|"haken"|"emoji","zeichen"?:[…]} (emoji: vor jedem Punkt ein Emoji als Bild, zeichen = genau ein Emoji je Punkt in derselben Reihenfolge, nur bei stil "emoji"; das Emoji nicht in den Punkt-Text schreiben) | {"type":"zahl","stil":"stapel"|"riesenwort"|"countdown","wert","label"?} (eine Zahl als Held der Slide, wert z. B. "−40°", "6,3 Mrd. €") | {"type":"rechnung","glieder":[{"op"?:"+"|"−"|"×"|"÷","wert","label"?}, …2–4],"ergebnis":{"wert","label"?}} (muss aufgehen; auch als Formel in Worten) | {"type":"termine","eintraege":[{"datum","titel","ort"?}, …2–6]} | {"type":"iconliste","zeilen":[{"icon","text"}, …2–4]} | {"type":"vergleich","links":{"titel","punkte":[…2–3]},"rechts":{"titel","punkte":[…2–3]}} (links der Plan der anderen, rechts unserer) | {"type":"faktencheck","paare":[{"mythos","fakt"}, …1–3]} (eine verbreitete Behauptung und ihre Richtigstellung) | {"type":"bild","quelle","ausschnitt":"streifen-unten"|"streifen-oben"|"karte"|"kreis"|"freigestellt","filter":"gruen"|"grau"|"original"} (ein Foto in der Slide neben dem Text, nur auf einer Farbfläche und nur mit dachzeile, headline, absatz, text, zitat, frage, button oder steckbrief, höchstens eins je Slide; quelle wie filename beim Hintergrund; streifen-unten/-oben = Fotostreifen über das untere bzw. obere Drittel, karte = Foto auf weißer Karte unter dem Text, kreis = rundes Foto, freigestellt = die Person ohne Hintergrund, vom unteren Rand aufsteigend – das Freistellen übernimmt der Grünerator; gruen = grün eingefärbt) | {"type":"button","text"} | {"type":"aufruf","stil":"ausruf"|"kernsatz"|"petition","text","adressat"?,"hinweis"?} (nur auf der letzten Slide, allein oder unter einer dachzeile: ausruf = riesiges „!“ über Forderung und adressat; kernsatz = der Satz, der hängen bleibt, mittig über dem Logo; petition = Aufforderung mit hinweis als Pille, z. B. „Link in der Bio“ – hinweis und adressat nur, wenn der Auftrag sie nennt) | {"type":"diagramm","art":"balken"|"balken-quer"|"linie"|"kreis"|"donut","werte":[{"name","wert":Zahl}, …1–8],"einheit"?:"%","titel"?} | {"type":"infografik","form":"raster"|"ablauf"|"mengen"|"anteil"|"zahl","punkte":[{"titel","text"?,"icon","motiv"?,"wert"?:Zahl bei mengen und anteil,"von"?:Ganzes nur bei anteil}, …2–6, anteil 1–3, zahl genau 1]} (motiv auf Englisch: ein Gegenstand, kein Text; anteil ohne motiv) | {"type":"steckbrief","gruss","name","merkmale":[…3–10]} (eine Person stellt sich vor: gruss klein über dem Namen, meist „Hallo, ich bin“, bis 24 Zeichen; name bis 24 Zeichen; merkmale kurze Stichworte bis 32 Zeichen, nur was der Auftrag über die Person sagt. Füllt die Slide allein: ein Foto der Person als background {"kind":"foto","textSeite":"oben"} und sonst kein Element (ein eigenes Foto, upload:N, immer so); oder background {"kind":"farbe"} mit genau steckbrief und einem bild mit ausschnitt "freigestellt" – die Person freigestellt unten in der Mitte (nur Stock- oder gemalte Fotos, die stellt der Grünerator frei). Ohne stoerer, datum, ort, nummer, zeilenboxen, blume, quelle). Einzelne Wörter mit ==…== hervorheben; ein, zwei Schlüsselwörter pro Slide in headline, absatz, text oder zitat dürfen von Hand markiert sein: ((Wort)) kreist ein, __Wort__ unterstreicht; nur Deutschland: bis zu 2 Passagen in zitat, absatz oder headline mit ++…++ (Textmarker-Box). icon ist einer von: ${sharepicIconSchema.options.join(', ')}. zeichen ist eines von: ${SHAREPIC_EMOJI.join(' ')}.`,
      items: structureOf(sharepicItemSchema),
    },
    stoerer: {
      ...structureOf(slideShape.stoerer.unwrap()),
      description: '{"text"} oder weglassen',
    },
    datum: {
      ...structureOf(slideShape.datum.unwrap()),
      description:
        '{"weekday"?,"date"?,"time"?} (weekday oder date) oder weglassen; jedes Feld nur, wenn der Auftrag es nennt',
    },
    ort: {
      ...structureOf(slideShape.ort.unwrap()),
      description:
        '{"lines":[Name des Orts, Adresse?]} als eigene Zeilen – oder weglassen, wenn der Ort schon im Text steht (nie beides) oder der Auftrag keinen nennt',
    },
    quelle: { type: 'string', description: 'Quelle einer Zahl, nur wenn sie im Auftrag steht' },
    zeilenboxen: { type: 'boolean', description: 'nur Deutschland: jede Zeile in einer Box' },
    nummer: {
      type: 'string',
      enum: ['gross', 'geist'],
      description:
        'Ein Punkt pro Slide („5 Gründe …“): die Ziffer setzt das Programm selbst – gross = groß über dem Text, geist = blass dahinter. Dann keine Zahl in den Text schreiben. Sonst weglassen.',
    },
    weiter: {
      type: 'string',
      description:
        'Karussell, nicht auf der letzten Slide: kurzer Teaser neben dem Weiter-Pfeil, der zur nächsten Slide zieht („Denn →“, „Und jetzt?“, „Wie stoppen wir das?“) oder weglassen',
    },
    logo: { type: 'boolean' },
  },
  required: ['background', 'position', 'align', 'items', 'logo'],
};

export const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    format: {
      type: 'string',
      enum: sharepicFormatSchema.options,
      description:
        '"post-portrait-tall" (3:4) nur, wenn der Auftrag ausdrücklich 3:4 verlangt; sonst weglassen (4:5).',
    },
    seitenzahl: {
      type: 'string',
      enum: ['punkte', 'bruch'],
      description:
        'Nur Karussell und nur, wenn Zählen hilft (nummerierte Gründe, Schritte, ab 4 Slides): punkte = Punktreihe oben, bruch = „2/5“ in der Ecke. Sonst weglassen.',
    },
    pfeil: {
      type: 'boolean',
      description:
        'Nur Karussell: false, wenn der Weiter-Pfeil stört (Satzbrücke mit „…“ zieht schon weiter, Bild läuft über die Kante). Sonst weglassen – dann steht er.',
    },
    thema: {
      type: 'string',
      enum: sharepicThemaSchema.options,
      description:
        'Nur wenn der Auftrag das Thema hat: "queer" für Pride, CSD, IDAHOBIT, Coming-out-Day; "frauen" für 8. März, Equal Pay Day, Safe Abortion Day, Frauenrechte; "europa" für Europatag, Schengen, EU-Beschlüsse, Europaparlament. Erlaubt die Themenflächen (queer: violett, pride; frauen: lila, flieder; europa: europablau, himmelblau). Sonst weglassen.',
    },
    slides: {
      type: 'array',
      description: 'Eine Slide für ein Einzelbild, 2–8 für ein Karussell – in Wischreihenfolge.',
      items: SLIDE_SCHEMA,
    },
  },
  required: ['slides'],
};

/**
 * DE-only spec options from the party's and the candidates' posts (10/2026).
 * Only the German draft sees them, so the Austrian tool schema stays as it is.
 */
const DE_ITEMS_NOTE =
  ' Nur Deutschland: {"type":"vergleich",…,"stil":"spalten"} teilt die Slide randlos (links Mint, rechts Grasgrün, VS dazwischen; dann allein auf der Slide, titel bis 48 Zeichen mit einer ++…++-Box, 2–5 punkte bis 70 Zeichen; ein Punkt der anderen Seite, der stimmt, beginnt mit „✓ “); in termine darf der titel eines Eintrags mit dem Ort in ++…++ beginnen („++Altstadt++ Radtour“); {"type":"liste","stil":"kasten"} ohne Aufzählungszeichen, jeder Punkt beginnt mit seiner Kennzahl in ++…++ („++fast 7 Jahre++ die Finanzierung …“); {"type":"absatz",…,"klein":true} hält einen Absatz in Grundschrift (Schlusszeile „Das ganze Interview auf ++medium.de++“, lange Textseiten); ein zitat darf bis 600, ein absatz bis 500 Zeichen lang sein – lange Textseiten wie Interview-Auszüge.';

export const SPEC_SCHEMA_DE = {
  ...SPEC_SCHEMA,
  properties: {
    ...SPEC_SCHEMA.properties,
    slides: {
      ...SPEC_SCHEMA.properties.slides,
      items: {
        ...SLIDE_SCHEMA,
        properties: {
          ...SLIDE_SCHEMA.properties,
          background: {
            ...SLIDE_SCHEMA.properties.background,
            description: `${SLIDE_SCHEMA.properties.background.description} Nur Deutschland: bei "farbe" optional "kopfband" (eine zweite Farbe): ein Band in dieser Farbe hinter dem Text über einer Karte (liste, diagramm, vergleich, faktencheck, schlagzeile; die Karte ist das letzte Element), "color" ist dann der Grund unter der Karte – z. B. dunkeltanne über mint.`,
          },
          items: {
            ...SLIDE_SCHEMA.properties.items,
            description: `${SLIDE_SCHEMA.properties.items.description}${DE_ITEMS_NOTE}`,
          },
          blume: {
            type: 'boolean',
            description:
              'nur Deutschland, nur auf einer Farbfläche: große blasse Sonnenblume im Ton der Fläche, von der Ecke angeschnitten (Info- und Schluss-Slides)',
          },
        },
      },
    },
  },
};
