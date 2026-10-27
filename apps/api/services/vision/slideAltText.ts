/**
 * Alt-Texte für die Seiten eines Sharepics oder Karussells (Canvas-Editor,
 * Tool „Alt-Texte").
 *
 * Anders als `generateAltText` (ein beliebiges Foto) bekommt das Modell hier
 * neben dem Bild die Texte der Seite aus dem Editor. Die übernimmt es wörtlich,
 * statt sie aus Pixeln zu lesen — gemessen an 86 Seiten der echten
 * Sharepic-Vorlagen mit Gemma 4 31B (19.10.2026): Bildtext-Treue 92,7 % mit dem
 * DBSV-Prompt allein, 99,6 % mit diesem Prompt und den Editor-Texten.
 *
 * Regeln: DBSV (Pflicht zuerst, keine Wertung), WAI „Images of Text" (der
 * sichtbare Text vollständig und wörtlich), Instagram/X: 1000 Zeichen je Bild.
 * Logos fallen bewusst weg: das Modell erfand sie auf Seiten ohne Logo.
 */
import { SLIDE_ALT_TEXT_MAX_CHARS } from '@gruenerator/contracts';

export const SLIDE_ALT_TEXT_PROMPT = `Du schreibst Alternativtexte für Social-Media-Grafiken (Sharepics) von Bündnis 90/Die Grünen. Blinde und sehbehinderte Menschen hören den Alt-Text über einen Screenreader. Er muss ihnen dieselbe Information geben wie das Bild – nicht mehr und nicht weniger.

So baust du den Alt-Text:
1. Erster Satz: das Wesentliche. Zeigt die Folie vor allem Text, beginnt der Alt-Text direkt mit diesem Text. Bei einem Foto: zuerst in einem kurzen Satz das Motiv, dann der Text. Bei Diagrammen und Infografiken: kurz, was dargestellt wird.
2. Gib jeden sichtbaren Text genau einmal wieder – auch nicht noch einmal in deiner Beschreibung, wörtlich und vollständig, in Lesereihenfolge. Setze jeden Textblock in deutsche Anführungszeichen („…"). Das Satzzeichen am Ende gehört in die Anführungszeichen; fehlt eines, ergänze einen Punkt vor dem schließenden Zeichen.
3. Zitate: zuerst der Zitattext in Anführungszeichen, danach einmal „Zitat von <Name>, <Funktion>." Name und Funktion stehen nur in diesem Satz, nicht noch einmal als eigener Block.
4. Die Liste „Texte auf der Folie" stammt direkt aus dem Editor. Sie ist für Schreibweise, Zahlen und Namen maßgeblich, auch bei Platzhaltern wie „Vorname Nachname". Ihre Reihenfolge kann von der Lesereihenfolge abweichen – richte dich nach dem Bild. Text, der im Bild nicht zu sehen ist, lässt du weg.
5. Fotos und Illustrationen: Beschreibe das Motiv in einem kurzen Satz (wer oder was, Handlung, Umgebung). Benenne Personen nur, wenn ihr Name im Bild steht. Keine Vermutungen über Gefühle.
6. Diagramme, Infografiken, Vergleiche, Listen: Nenne alle Werte mit ihrer Beschriftung. Mache die Struktur hörbar, z. B. „Links: … Rechts: …". Häkchen, Kreuze, Emoji und Symbole beschreibst du mit Worten außerhalb der Anführungszeichen (Mit Häkchen: „…". Mit Kreuz: „…". Emoji Wahlurne: „…".) – schreibe nie das Zeichen selbst.
7. Fasse die Aussage nicht in eigenen Worten zusammen und bewerte sie nicht. Der wörtliche Text spricht für sich.
8. Gestaltung (Farben, Schrift, Hintergrund, Formen, Position) nur nennen, wenn sie Bedeutung trägt, etwa die Farben in einem Diagramm. Logos lässt du weg.
9. Pfeile, Seitenzahlen und Wisch-Hinweise lässt du weg. Steht ein KI-Hinweis wie „KI-generiert mit dem Grünerator" in der Liste, gibst du ihn als letzten Satz wieder, ohne Anführungszeichen.
10. Beginne nie mit „Bild", „Foto von", „Grafik" oder „Sharepic" – der Screenreader sagt schon, dass es ein Bild ist.
11. Schlichte, vollständige Sätze. Kein Markdown, keine Aufzählungszeichen, keine Zeilenumbrüche. Höchstens ${SLIDE_ALT_TEXT_MAX_CHARS} Zeichen.

Gib nur den Alt-Text in <alt_text>…</alt_text> aus.`;

export function buildSlideAltTextUserPrompt(
  texts: readonly string[],
  index: number,
  total: number
): string {
  const lines = texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const list = lines.length > 0 ? lines.map((t) => `- ${t}`).join('\n') : '(keine)';
  return `Folie ${index} von ${total}.\n\nTexte auf der Folie:\n${list}`;
}

/** Holt den Text aus dem Tag und glättet, was das Modell trotz Prompt schreibt. */
export function cleanSlideAltText(raw: string): string {
  const tagged = /<alt_text>([\s\S]*?)<\/alt_text>/.exec(raw);
  let text = (tagged ? tagged[1] : raw.replace(/<\/?alt_text>/g, '')).replace(/\s+/g, ' ').trim();
  // „Jeden Tag.“. → „Jeden Tag.“
  text = text.replace(/([.!?…:;])“\./g, '$1“');
  if (text && !/[.!?…“"]$/.test(text)) text += '.';
  return text;
}

/** Gleichzeitige Vision-Aufrufe je Anfrage; ein Karussell hat bis zu 20 Seiten. */
const SLIDE_CONCURRENCY = 4;

/**
 * Beschreibt alle Seiten, höchstens vier zugleich, in Seitenreihenfolge. Eine
 * gescheiterte Seite kostet nicht die übrigen: sie kommt als `null` zurück,
 * und das Tool bietet einen neuen Versuch an.
 */
export async function describeSlides<T>(
  slides: readonly T[],
  describe: (slide: T, index: number) => Promise<string>,
  onError: (index: number, reason: unknown) => void
): Promise<Array<string | null>> {
  const results = new Array<string | null>(slides.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < slides.length) {
      const i = next++;
      try {
        results[i] = await describe(slides[i], i);
      } catch (reason) {
        onError(i, reason);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SLIDE_CONCURRENCY, slides.length) }, worker));
  return results;
}
