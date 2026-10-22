import { type SharepicItem, type SharepicSlide } from '@gruenerator/contracts';

/** The texts one item puts on the slide, in reading order. */
export function itemTexts(item: SharepicItem): string[] {
  switch (item.type) {
    case 'headline':
      return item.lines;
    case 'liste':
      return item.items;
    case 'iconliste':
      return item.zeilen.map((z) => z.text);
    case 'vergleich':
      return [item.links, item.rechts].flatMap((side) => [side.titel, ...side.punkte]);
    case 'faktencheck':
      return item.paare.flatMap((p) => [p.mythos, p.fakt]);
    case 'zitat':
      return [item.text, item.name, item.funktion ?? '', item.quelle ?? ''];
    case 'frage':
      return [item.text, item.von ?? ''];
    case 'infografik':
      return item.punkte.flatMap((p) => [p.titel, p.text ?? '']);
    // The values are checked on their own, with a repair hint that fits a chart.
    case 'diagramm':
      return [item.titel ?? '', item.einheit ?? '', ...item.werte.map((w) => w.name)];
    case 'aufruf':
      return [item.text, item.adressat ?? '', item.hinweis ?? ''];
    case 'zahl':
      return [item.wert, item.label ?? ''];
    case 'rechnung':
      return [...item.glieder, item.ergebnis].flatMap((g) => [g.wert, g.label ?? '']);
    case 'termine':
      return item.eintraege.flatMap((e) => [e.datum, e.titel, e.ort ?? '']);
    case 'schlagzeile':
      return [item.medium, item.titel, item.datum ?? ''];
    case 'bingo':
      return item.felder;
    case 'steckbrief':
      return [item.gruss, item.name, ...item.merkmale];
    case 'bild':
      return [];
    default:
      return [item.text];
  }
}

export function textsOf(slide: SharepicSlide): string[] {
  const texts = slide.items.flatMap(itemTexts);
  if (slide.weiter) texts.push(slide.weiter);
  if (slide.stoerer) texts.push(slide.stoerer.text);
  if (slide.ort) texts.push(...slide.ort.lines);
  if (slide.quelle) texts.push(slide.quelle);
  return texts;
}

/** Every string inside a value (item, footer part). */
export function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

const NOT_TEXT = new Set(['type', 'stil', 'art', 'form', 'seite', 'icon', 'op', 'bild']);

/** The words an item shows, shortened — enough to recognise it. */
export function itemText(item: SharepicItem): string {
  const words: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (NOT_TEXT.has(key)) return;
    if (typeof value === 'string') words.push(value);
    else if (Array.isArray(value)) value.forEach((v) => walk(v, ''));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  if (item.type === 'headline') words.push(item.lines.join(' '));
  else walk(item, '');
  const text = words.join(' · ').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}
