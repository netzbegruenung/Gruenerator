/**
 * Presentations as canvas decks (`slide-16-9`), generated from a prompt.
 *
 * The model picks a Folientyp per slide and fills its slots; the composer in
 * `@gruenerator/contracts/slides` builds the pages in the chosen Vorlage
 * (Stil), the server measures the wrapped text and shrinks what still
 * overflows, and the deck is persisted as a seeded canvas. Used by chat,
 * boards and the web AI button.
 */

import {
  composeSlideDeck,
  deckSpecSchema,
  folieSpecSchema,
  FOLIEN_TYP_IDS,
  FOLIEN_TYPEN,
  folienSlotsOf,
  MAX_SLIDES,
  type ComposedSlideDeck,
  type DeckSpec,
  type FolieSpec,
  type FolienTypId,
} from '@gruenerator/contracts/slides';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { createCanvas } from '../canvas/canvasRepository.js';
import { seedCanvasPages } from '../canvas/canvasStateService.js';
import { insertCanvasVersion } from '../canvas/canvasVersionRepository.js';
import { defaultDeckStil, listFolienVorlagen } from '../sharepicVorlagen/catalog.js';

import { prepareOverflowMeasuring, serverMeasureText } from './canvasDeckOverflow.js';

const log = createLogger('canvasDeckGeneration');

export type DeckLocale = 'de-DE' | 'de-AT';

export interface CreatedCanvasDeck {
  documentId: string;
  title: string;
  subtype: 'canvas';
  url: string;
}

/** Die Typen, die das Modell wählen darf: die Bildfolie nur, wenn ein Bild dabei ist. */
const typIds = (withPhoto: boolean) => FOLIEN_TYP_IDS.filter((id) => withPhoto || id !== 'bild');

function typCatalog(withPhoto: boolean): string {
  return typIds(withPhoto)
    .map((id) => {
      const def = FOLIEN_TYPEN[id];
      const slots = Object.entries(folienSlotsOf(id))
        .map(([name, slot]) =>
          slot.kind === 'list'
            ? `    - ${name}${slot.required ? '' : ' (optional)'}: Array von Texten mit ${slot.minItems} bis ${slot.maxItems} Einträgen, ${slot.hint}, je höchstens ${slot.maxChars} Zeichen`
            : `    - ${name}${slot.required ? '' : ' (optional)'}: ${slot.hint}, höchstens ${slot.maxChars} Zeichen`
        )
        .join('\n');
      return `- "${id}" — ${def.label}: ${def.use}\n${slots}`;
    })
    .join('\n');
}

function vorlagenList(locale: DeckLocale): string {
  return listFolienVorlagen(locale)
    .map((v) => `${v.id} (${v.titel})`)
    .join(', ');
}

const AT_BLOCK = `

ÖSTERREICH: Die Präsentation ist für ein österreichisches Publikum. Schreibe österreichisches Deutsch (z. B. "Nationalrat", "Bundesland", "Gemeinde", "Landesregierung", "Jänner", "heuer"), nenne keine deutschen Institutionen (Bundestag, Bundesländer-Ministerien), wenn der Auftrag nichts anderes sagt.`;

const PHOTO_RULE = `
- Zum Auftrag gehört ein Bild aus dem Gespräch: setz genau eine Folie vom Typ "bild", meist direkt nach der Titelfolie. Das Bild setzt das System ein; du schreibst nur die Zeile dazu (\`unterschrift\`, darf fehlen)`;

export function deckSystemPrompt(locale: DeckLocale, withPhoto = false): string {
  return `Du bist ein Präsentations-Assistent für die Grünen. Erstelle einen Foliensatz im Corporate Design: du wählst je Folie einen Typ und füllst dessen Felder. Wie die Folien aussehen, bestimmt die Vorlage, nicht du.

Verfügbare Folientypen und ihre Felder:
${typCatalog(withPhoto)}

Regeln:
${withPhoto ? PHOTO_RULE.trimStart() + '\n' : ''}- Ohne genannte Zahl 5 bis 12 Folien (höchstens ${MAX_SLIDES}); die erste Folie ist eine "titel"-Folie, die letzte darf "danke" sein
- Nennt die Person eine Folienzahl, ist das die Gesamtzahl — Titel- und Danke-Folie zählen mit. "4 Folien" heißt genau vier Folien insgesamt, keine fünfte als Danke-Folie
- Wähle je Folie den passenden Typ. Für drei bis sechs kurze Punkte nimm \`liste\`, nicht \`text\`. Wechsle die Typen ab; zwei gleiche Typen hintereinander nur, wenn der Inhalt es verlangt
- \`zahl\` nur mit einer Zahl aus dem Material und ihrer Quelle. Ohne Quelle keine Zahl-Folie. Steht eine belegte Zahl im Auftrag, bekommt sie ihre Zahl-Folie
- \`zitat\` nur mit einem wörtlichen Zitat aus dem Auftrag samt Urheber*in. Schreib nie jemandem ein Zitat zu, das nicht im Auftrag steht — eine eigene Botschaft ist ein \`kernsatz\`
- Jede Überschrift sagt schon die Aussage der Folie („Busse alle zehn Minuten“ statt „Unser Vorschlag“). Keine Floskeln wie „Unsere Vision“, „Unser Ziel“, „Gemeinsam voran“, „Ausblick“
- Höchstens EINE Hervorhebung \`==…==\` pro Folie, auf dem einen Wort (höchstens zwei), das die Aussage trägt — nie auf Füllwörtern wie „Zukunft“, „du“, „weiter“. Danke-Folie ohne Hervorhebung
- Listenpunkte kurz und konkret (am besten unter 45 Zeichen), mit Verb oder Zahl statt Substantivketten
- Fließtext (\`text\`) höchstens drei kurze Sätze; eine Folie ist kein Handout. Die Unterzeile der Titelfolie ist eine kurze Zeile, kein Satz, ohne Trennstriche wie „|“
- \`vorlage\` nur setzen, wenn die Person eine Gestaltung nennt; erlaubte Ids: ${vorlagenList(locale)}.
- Halte die Zeichenbudgets strikt ein — Text darüber läuft aus der Folie. Lieber kürzen als umbrechen
- Einträge einer Liste sind reine Texte ohne vorangestellte Aufzählungszeichen. Das Listenfeld heißt \`punkte\` (Mehrzahl) und ist ein Array, z. B. {"typ": "liste", "slots": {"headline": "Was wir fordern", "punkte": ["Busse im Zehn-Minuten-Takt", "Sichere Radwege an jeder Schule", "Ein Ticket für die ganze Region"]}}
- "notes" sind Sprechernotizen (ausführlicher, darf leer sein)
- Schreibe jede Folie inhaltlich aus. NIEMALS Platzhalter wie "Kernpunkt 1" oder "hier Inhalt einfügen"; was der Auftrag nicht hergibt, lässt du weg
- Erfinde keine Zahlen, Namen, Kontaktdaten oder Quellen. Ein optionales Feld ohne Inhalt lässt du weg
- Enthält der Auftrag recherchierte Quellen (Zeilen der Form "[1] Titel <URL> — Auszug"), nutze deren Fakten und nenne die Quellen auf einer Textfolie am Ende
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern * nur an Personenbezeichnungen mit weiblicher und männlicher Form wie Bürger*innen, nie an Wörtern wie „Kinder“ oder „Menschen“, keine Doppelformen wie „jeder*jede“ — dann „alle“)${locale === 'de-AT' ? AT_BLOCK : ''}`;
}

function typFieldList(withPhoto: boolean): string {
  return typIds(withPhoto)
    .map((id) => `${id} → ${Object.keys(folienSlotsOf(id)).join(', ')}`)
    .join('; ');
}

/** Loose wire schema; `deckSpecSchema` stays the strict gate. */
export function deckToolSchema(withPhoto = false): Record<string, unknown> {
  const slotShapes = new Map<string, Record<string, unknown>>();
  for (const id of typIds(withPhoto)) {
    for (const [name, slot] of Object.entries(folienSlotsOf(id))) {
      const shape: Record<string, unknown> =
        slot.kind === 'list'
          ? {
              type: 'array',
              items: { type: 'string' },
              description: `Array von Texten, ein Eintrag je Punkt (Feldname "${name}")`,
            }
          : { type: 'string' };
      const known = slotShapes.get(name);
      // Dieselbe Bezeichnung mit anderer Art in zwei Typen: dann ohne Typangabe.
      slotShapes.set(name, known && known['type'] !== shape.type ? {} : shape);
    }
  }
  return {
    type: 'object',
    required: ['title', 'slides'],
    properties: {
      title: { type: 'string', description: 'Titel der Präsentation (höchstens 50 Zeichen)' },
      vorlage: {
        type: 'string',
        description: 'Id der Vorlage, nur wenn die Person eine Gestaltung nennt',
      },
      slides: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_SLIDES,
        items: {
          type: 'object',
          required: ['typ', 'slots'],
          properties: {
            typ: { type: 'string', enum: typIds(withPhoto) },
            slots: {
              type: 'object',
              description: `Nur die Felder des gewählten Typs: ${typFieldList(withPhoto)}. Leere Felder weglassen`,
              properties: Object.fromEntries(slotShapes),
              additionalProperties: false,
            },
            notes: { type: 'string', description: 'Sprechernotizen, darf leer sein' },
          },
        },
      },
    },
  };
}

/**
 * Modelle erfinden für die Liste gern die Einzahl `punkt` (Live-Test 30.10.).
 * Gemeint ist eindeutig `punkte`; die Einzahl wird umbenannt, bevor das
 * strikte Schema sie als unbekanntes Feld ablehnt.
 */
const SLOT_ALIASES: Readonly<Record<string, string>> = { punkt: 'punkte' };

const isEmptySlot = (v: unknown) =>
  v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * Felder eines fremden Folientyps. Das Werkzeug-Schema bietet alle Feldnamen
 * flach an, und Modelle setzen sie quer (Live-Test 22.11., sechs Decks):
 * `kontakt` auf einem Kernsatz, meist als Kopie des Satzes, oder `zitat` statt
 * `text` auf der Zahl-Folie. Die Rückfrage half nicht, der zweite Versuch
 * wiederholte den Fehler und das Deck scheiterte. Fehlt dem Typ genau ein
 * Pflichtfeld derselben Art, ist es gemeint; sonst ist das Feld überzählig.
 */
function placeForeignSlots(typ: FolienTypId, slots: Record<string, unknown>) {
  const own = folienSlotsOf(typ);
  for (const key of Object.keys(slots)) {
    if (key in own) continue;
    const value = slots[key];
    delete slots[key];
    const kind = Array.isArray(value) ? 'list' : 'text';
    const missing = Object.entries(own).filter(
      ([name, slot]) => slot.required && slot.kind === kind && isEmptySlot(slots[name])
    );
    if (missing.length === 1) slots[missing[0]![0]] = value;
  }
}

/** Bringt die Antwort des Modells in die Form des strikten Schemas, soweit sie eindeutig ist. */
function normalizeDeck(input: unknown): unknown {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { slides?: unknown }).slides))
    return input;
  const deck = input as { slides: unknown[] };
  const slides = deck.slides.map((slide) => {
    const slots = (slide as { slots?: unknown } | null)?.slots;
    if (!slots || typeof slots !== 'object') return slide;
    // Leere Felder heißen „nichts“.
    const renamed: Record<string, unknown> = Object.fromEntries(
      Object.entries(slots as Record<string, unknown>).filter(([, v]) => !isEmptySlot(v))
    );
    for (const [alias, name] of Object.entries(SLOT_ALIASES)) {
      if (!(alias in renamed) || name in renamed) continue;
      const value = renamed[alias];
      delete renamed[alias];
      renamed[name] = typeof value === 'string' ? [value] : value;
    }
    const typ = (slide as { typ?: unknown } | null)?.typ;
    if ((FOLIEN_TYP_IDS as readonly unknown[]).includes(typ)) {
      placeForeignSlots(typ as FolienTypId, renamed);
    }
    // „Vielen Dank!“ ist der Standard der Schlussfolie, nur mit Satzzeichen; als eigene
    // Zeile gelesen, fiele „für eure Aufmerksamkeit“ darunter weg.
    const headline = renamed['headline'];
    if (
      typ === 'danke' &&
      typeof headline === 'string' &&
      /^\s*vielen dank\s*[.!]?\s*$/i.test(headline)
    ) {
      delete renamed['headline'];
    }
    // Die Zeile über dem Kernsatz ist frei; eine Floskel wie „Unser Ziel“ sagt dort nichts,
    // stand trotz Promptregel in drei von sechs Decks (Design-Review 22.11.) und fällt weg.
    const kicker = renamed['ueberschrift'];
    if (typ === 'kernsatz' && typeof kicker === 'string' && STOCK_KICKER.test(kicker)) {
      delete renamed['ueberschrift'];
    }
    return { ...(slide as object), slots: renamed };
  });
  // Eine leere Vorlage heißt „keine“, wie ein leeres Feld (live 22.11.: `vorlage: ""`
  // im zweiten Versuch kostete das ganze Deck).
  const vorlage = (deck as { vorlage?: unknown }).vorlage;
  if (typeof vorlage === 'string' && vorlage.trim() === '') {
    const { vorlage: _empty, ...rest } = deck as { vorlage?: unknown; slides: unknown[] };
    return { ...rest, slides };
  }
  return { ...deck, slides };
}

/**
 * Das Deck ohne die Folien, die das Schema nicht bestehen; null, wenn danach
 * keine zwei Folien bleiben (ein Deck aus Titel allein ist kein Ergebnis).
 */
function withoutBrokenSlides(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const slides = (input as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return null;
  const kept = slides.filter((folie) => folieSpecSchema.safeParse(folie).success);
  if (kept.length < 2 || kept.length === slides.length) return null;
  const parsed = deckSpecSchema.safeParse({ ...input, slides: kept });
  if (!parsed.success) return null;
  log.warn(`Deck kept without ${slides.length - kept.length} invalid slide(s) on the last attempt`);
  return parsed;
}

/** Floskeln als ganze Zeile: „Unser Ziel“, „Unsere Vision:“, „Fazit“, „Kernbotschaft“ … */
const STOCK_KICKER =
  /^\s*(?:(?:unser(?:e|er)?|meine?|das|die|der)\s+)?(?:ziel|ziele|vision|versprechen|anspruch|auftrag|plan|weg|botschaft|kernbotschaft|kernaussage|haltung|überzeugung|forderung|fazit|ausblick|zusammenfassung|fokus)\s*[.:!]?\s*$/i;

/**
 * Zitat-Folien, deren Urheber*in im Auftrag nicht vorkommt. Das Modell schrieb
 * trotz Regel einen Satz von Barack Obama António Guterres zu (Live-Test 22.11.):
 * ein erfundenes Zitat mit echtem Namen darf nicht auf eine Parteifolie.
 */
function unsourcedQuotes(spec: DeckSpec, prompt: string): number[] {
  const haystack = prompt.toLowerCase();
  return spec.slides.flatMap((folie, i) => {
    if (folie.typ !== 'zitat') return [];
    const name = (folie.slots as { name?: string }).name?.trim();
    if (!name) return [];
    // Der Nachname genügt: „Guterres“ deckt „António Guterres, UN-Generalsekretär“.
    const words = name.split(/[\s,]+/).filter((w) => w.length > 2);
    return words.some((w) => haystack.includes(w.toLowerCase())) ? [] : [i];
  });
}

function withoutNames(spec: DeckSpec, indexes: number[]): DeckSpec {
  return {
    ...spec,
    slides: spec.slides.map((folie, i) => {
      if (!indexes.includes(i) || folie.typ !== 'zitat') return folie;
      const { name: _name, ...slots } = folie.slots as Record<string, unknown>;
      return { ...folie, slots } as FolieSpec;
    }),
  };
}

function describeIssues(
  error: {
    issues: Array<{ path: PropertyKey[]; message: string; code?: string; keys?: string[] }>;
  },
  input: unknown
): string {
  const typOf = (index: number): unknown =>
    (input as { slides?: Array<{ typ?: unknown } | null> } | null)?.slides?.[index]?.typ;
  return error.issues
    .slice(0, 8)
    .map((i) => {
      const [first, second, third] = i.path;
      if (first !== 'slides' || typeof second !== 'number')
        return `${i.path.join('.')}: ${i.message}`;
      const folie = `Folie ${second + 1}`;
      if (third !== 'slots') return `${folie}: ${i.message}`;
      if (i.code === 'unrecognized_keys' && i.keys) {
        const typ = typOf(second);
        const allowed = (FOLIEN_TYP_IDS as readonly unknown[]).includes(typ)
          ? `; erlaubt: ${Object.keys(folienSlotsOf(typ as (typeof FOLIEN_TYP_IDS)[number])).join(', ')}`
          : '';
        return `${folie}, Feld ${i.keys.join(', ')}: unbekanntes Feld${allowed}`;
      }
      return `${folie}, Feld ${String(i.path[3] ?? '')}: ${i.message}`;
    })
    .join('; ');
}

/** `vorlage` des Modells, wenn sie eine Katalog-Id des Landes ist, sonst der Standard des Landes. */
function stilFor(vorlage: string | undefined, locale: DeckLocale) {
  const named = vorlage ? listFolienVorlagen(locale).find((v) => v.id === vorlage) : undefined;
  return named?.stil ?? defaultDeckStil(locale);
}

/**
 * Puts the thread image on the deck's Bildfolien. The model never names an
 * address (the schema has no field for it); a Bildfolie without an image to
 * show is refused, it would stand on the editor's placeholder photo.
 */
export function withDeckPhoto(
  spec: DeckSpec,
  photo: string | null
): { ok: true; spec: DeckSpec; hasPhoto: boolean } | { ok: false; error: string } {
  const bilder = spec.slides.filter((s) => s.typ === 'bild').length;
  if (bilder > 0 && !photo) {
    return {
      ok: false,
      error: 'Den Folientyp "bild" gibt es hier nicht: zu diesem Auftrag gehört kein Bild.',
    };
  }
  return {
    ok: true,
    hasPhoto: bilder > 0,
    spec: {
      ...spec,
      slides: spec.slides.map((s) => (s.typ === 'bild' && photo ? { ...s, bild: photo } : s)),
    },
  };
}

/**
 * A Bildfolie behind the first slide. A full deck gives up its last slide for it:
 * the chat answer says the image is in the deck, so it must be.
 */
export function withBildfolie(spec: DeckSpec, photo: string): DeckSpec {
  const slides = [...spec.slides];
  if (slides.length >= MAX_SLIDES) slides.pop();
  slides.splice(1, 0, { typ: 'bild', slots: {}, bild: photo });
  return { ...spec, slides };
}

/**
 * Generates, composes, measures and persists a canvas deck. Returns null when
 * the model produced no usable structure after its repair attempts.
 */
export async function generateCanvasDeck(opts: {
  prompt: string;
  userId: string;
  locale: DeckLocale;
  /** Called once after generation succeeded, right before the DB write. */
  onCommit?: () => void;
  abandoned?: AbortSignal;
  /** The thread image the turn means (Mediathek URL), for one Bildfolie. */
  photo?: string;
}): Promise<CreatedCanvasDeck | null> {
  const { prompt, userId, locale } = opts;
  const photo = opts.photo ?? null;
  const date = new Date();
  const measure = (await prepareOverflowMeasuring(locale)) ? serverMeasureText(locale) : null;
  const compose = (spec: DeckSpec) =>
    composeSlideDeck(spec, { locale, date, stil: stilFor(spec.vorlage, locale), measure });

  const generated = await aiObject({
    lane: 'doc_generation',
    system: deckSystemPrompt(locale, photo !== null),
    prompt,
    toolName: 'create_presentation',
    toolDescription: 'Erzeugt den Foliensatz aus Folientypen und ihren Feldern.',
    schema: deckToolSchema(photo !== null),
    validate: (raw, attempt, attempts) => {
      const input = normalizeDeck(raw);
      let parsed = deckSpecSchema.safeParse(input);
      if (!parsed.success && attempt === attempts) {
        // Letzter Versuch: eine kaputte Folie kostet nicht das ganze Deck. Live 22.11.: Runde 1
        // „Feld zahl: höchstens 8 Zeichen“, die Reparatur ließ `text` und `quelle` weg, und die
        // Person bekam statt sieben guter Folien die Bitte, ihren Auftrag zu wiederholen.
        const salvaged = withoutBrokenSlides(input);
        if (salvaged) parsed = salvaged;
      }
      if (!parsed.success) {
        return { ok: false as const, error: describeIssues(parsed.error, input) };
      }
      const quoted = unsourcedQuotes(parsed.data as DeckSpec, prompt);
      if (quoted.length > 0 && attempt < attempts) {
        return {
          ok: false as const,
          error: `${quoted.map((i) => `Folie ${i + 1}`).join(', ')}: dieses Zitat steht nicht im Auftrag. Nimm stattdessen einen \`kernsatz\` mit eigener Botschaft.`,
        };
      }
      // Ein Zitat ohne Urheber*in ist ein Kernsatz in Anführungszeichen (Design-Review 22.11.).
      const nameless = (parsed.data as DeckSpec).slides.flatMap((folie, i) =>
        folie.typ === 'zitat' && !(folie.slots as { name?: string }).name?.trim() ? [i] : []
      );
      if (nameless.length > 0 && attempt < attempts) {
        return {
          ok: false as const,
          error: `${nameless.map((i) => `Folie ${i + 1}`).join(', ')}: ein Zitat braucht \`name\`; ohne Urheber*in ist es ein \`kernsatz\` (Satz höchstens 110 Zeichen).`,
        };
      }
      // The last attempt keeps the sentence but not the invented attribution.
      const placed = withDeckPhoto(withoutNames(parsed.data as DeckSpec, quoted), photo);
      if (!placed.ok) return { ok: false as const, error: placed.error };
      if (photo && !placed.hasPhoto && attempt < attempts) {
        return {
          ok: false as const,
          error: 'Setz eine Folie vom Typ "bild" für das Bild aus dem Gespräch.',
        };
      }
      // The last attempt gets the Bildfolie behind the title instead of losing the image.
      const spec = photo && !placed.hasPhoto ? withBildfolie(placed.spec, photo) : placed.spec;
      // The last attempt takes overflow as it is: the minimum size is the fallback.
      if (measure && attempt < attempts) {
        const { overflow } = compose(spec);
        if (overflow.length > 0) {
          return {
            ok: false as const,
            error: `Text passt auch in kleinster Schrift nicht in die Folie: ${overflow
              .slice(0, 6)
              .map((o) => {
                const [slide, id] = o.split(':');
                return `Folie ${slide}, ${id}`;
              })
              .join('; ')} — kürze diese Felder deutlich.`,
          };
        }
      }
      return { ok: true as const, value: spec };
    },
    temperature: 0.4,
    label: 'presentation-canvas',
  });
  if (!generated.ok) {
    log.warn(`Canvas deck generation failed: ${generated.error}`);
    return null;
  }
  if (opts.abandoned?.aborted) return null;
  opts.onCommit?.();

  const spec = generated.data;
  const deck = compose(spec);
  if (deck.overflow.length > 0) {
    log.warn(`Deck text still overflows at minimum size: ${deck.overflow.join(', ')}`);
  }
  return persistCanvasDeck(userId, spec.title, deck);
}

export async function persistCanvasDeck(
  userId: string,
  title: string,
  deck: ComposedSlideDeck
): Promise<CreatedCanvasDeck> {
  const first = deck.pages[0];
  const initialState: Record<string, unknown> = { ...(first?.state ?? {}), pages: deck.pages };
  const canvas = await createCanvas(userId, {
    title,
    template_type: deck.templateType,
    format: 'slide-16-9',
    initial_state: initialState,
    page_count: deck.pages.length,
  });
  // Authoritative Yjs seed before any studio tab opens.
  await seedCanvasPages(canvas.id, deck.templateType, initialState);
  await insertCanvasVersion({
    canvasId: canvas.id,
    state: initialState,
    summary: 'Aus dem Chat erstellt',
    origin: 'mint',
    userId,
  });
  return {
    documentId: canvas.id,
    title: canvas.title ?? title,
    subtype: 'canvas',
    url: `/studio/canvas/${canvas.id}`,
  };
}
