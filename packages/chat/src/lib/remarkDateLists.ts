/**
 * Ein deutsches Datum am Zeilenanfang ist für CommonMark eine nummerierte Liste:
 * „28. November 2026: Infostand" wird `<ol start="28"><li>November 2026: …`.
 * Im Notebook stand dadurch „1. November" statt „28. November" in der Antwort
 * (die `ol`-Komponente verlor `start`), und selbst mit `start` bleibt es eine
 * Liste mit Zählmarke statt eines Datums.
 *
 * Auf dem Baum, nicht in `preprocess`: das läuft VOR der Tipp-Animation, und ein
 * Escape `28\.` erst dann, wenn „November" vollständig angekommen ist, bräche
 * deren Präfix-Invariante — dieselbe Falle wie bei den Zitaten, siehe
 * remarkCitationMarkers. Hier sieht die Animation nur rohen Text.
 *
 * Eine nummerierte Liste, deren Einträge ALLE mit einem Monatsnamen beginnen,
 * wird wieder zu ihren Absätzen, jeder mit seiner Zahl aus dem Quelltext davor.
 * Echte Aufzählungen („1. Antrag stellen") bleiben Listen.
 */

const MONTH =
  /^(Januar|Jänner|Februar|Feber|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/;
const MARKER = /^\s*(\d{1,9})[.)]/;

interface Node {
  type: string;
  children?: Node[];
  value?: string;
  ordered?: boolean | null;
  start?: number | null;
  position?: { start: { offset?: number } };
}

interface SourceFile {
  value?: unknown;
}

function firstText(node: Node): Node | null {
  if (node.type === 'text') return node;
  // Nur der Anfang zählt: immer das erste Kind, nie ein späteres Wort im Satz.
  const first = node.children?.[0];
  return first ? firstText(first) : null;
}

function startsWithMonth(item: Node): boolean {
  const text = firstText(item);
  return typeof text?.value === 'string' && MONTH.test(text.value);
}

/** Die Zahl, die im Quelltext vor dem Eintrag stand; mdast merkt sich nur die erste. */
function markerOf(item: Node, source: string | null, fallback: number): number {
  const offset = item.position?.start.offset;
  if (source !== null && offset !== undefined) {
    const match = MARKER.exec(source.slice(offset, offset + 12));
    if (match) return Number(match[1]);
  }
  return fallback;
}

function unwrap(list: Node, source: string | null): Node[] {
  const first = list.start ?? 1;
  return (list.children ?? []).flatMap((item, i) => {
    const text = firstText(item);
    if (text && typeof text.value === 'string') {
      text.value = `${markerOf(item, source, first + i)}. ${text.value}`;
    }
    return item.children ?? [];
  });
}

function walk(parent: Node, source: string | null): void {
  const children = parent.children;
  if (!children) return;
  parent.children = children.flatMap((child) => {
    walk(child, source);
    const isDateList =
      child.type === 'list' &&
      child.ordered === true &&
      (child.children?.length ?? 0) > 0 &&
      child.children!.every(startsWithMonth);
    return isDateList ? unwrap(child, source) : [child];
  });
}

export function remarkDateLists() {
  return (tree: Node, file?: SourceFile) => {
    const source = typeof file?.value === 'string' ? file.value : null;
    walk(tree, source);
  };
}
