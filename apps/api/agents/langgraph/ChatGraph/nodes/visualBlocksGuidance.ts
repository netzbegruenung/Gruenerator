import { type VisualBlockKind } from '@gruenerator/contracts';

/**
 * The visual-block catalogue for the answer prompt: which fences the model may
 * write into an ordinary answer, and when.
 *
 * Only the kinds the client said it draws are listed (`visualBlocks` on the
 * request). A shipped app binary that predates the renderers sends nothing and
 * gets no catalogue — it would show every block as a JSON code block.
 *
 * The number rule is the load-bearing line. The `chart` intent's own guidance
 * still licenses "plausible" data when none is given; an answer that reaches
 * for a block on its own initiative must not, or a made-up figure arrives
 * looking like a sourced one.
 */
const KIND_LINES: Record<VisualBlockKind, string> = {
  bars: '- bars – Werte mit Beschriftung als Balken (Dauern, Anteile, Rangfolgen): {"title":"…","unit":" %","max":100,"items":[{"label":"…","value":42}]} — `from` macht einen Balken zur Spanne (from 3, value 8), eine offene Spanne („über 8") hat from 8 und value 8; `display` ersetzt die Zahl rechts. Farben wechseln von selbst; `tone` ("warning", "danger") nur, wenn die Farbe etwas bedeutet',
  chart:
    '- chart – Achsendiagramm für Reihen und Verläufe: {"type":"bar|line|area|pie|donut","data":[{"jahr":"2020","wert":1}],"xKey":"jahr","yKeys":["wert"]} — `"stacked":true` stapelt mehrere Reihen, `"percent":true` normiert sie auf 100 %',
  stats:
    '- stats – 2–4 Kennzahlen als Kacheln: {"items":[{"label":"CO₂-Ausstoß","value":"−18 %","change":"seit 2020","trend":"down","sentiment":"positive"}]} — `points` (Zahlenreihe) zeichnet optional einen Verlauf',
  callout:
    '- callout – Hinweisbox für etwas, das nicht untergehen darf: {"variant":"info|tip|important|warning","title":"optional","text":"…"}',
  timeline:
    '- timeline – Chronologie: {"items":[{"date":"März 2021","title":"…","text":"optional"}]}',
  steps: '- steps – Schritt-für-Schritt-Anleitung: {"items":[{"title":"…","text":"optional"}]}',
  compare:
    '- compare – 2–3 Spalten nebeneinander (Pro/Contra, Optionen, Positionen): {"columns":[{"title":"Dafür","tone":"pro","items":["…"]},{"title":"Dagegen","tone":"contra","items":["…"]}]} — `"recommended":0` hebt eine Spalte als Empfehlung hervor',
  table:
    '- table – sortierbare Tabelle für viele gleichartige Zeilen (ab etwa 6); kleinere Tabellen bleiben Markdown: {"columns":[{"key":"partei","label":"Partei"},{"key":"anteil","label":"Anteil","format":"percent"}],"rows":[{"partei":"…","anteil":11.6}]} — `format`: text|number|percent|currency|delta',
};

const EXAMPLE = `\`\`\`bars
{"title":"Titel","max":10,"items":[{"label":"Kurz","value":3,"display":"bis 3 Monate"},{"label":"Mittel","from":3,"value":10,"display":"3–10 Monate"},{"label":"Lang","from":10,"value":10,"display":"über 10 Monate","tone":"warning"}],"note":"Quelle"}
\`\`\``;

export function buildVisualBlocksGuidance(kinds: readonly VisualBlockKind[]): string {
  if (kinds.length === 0) return '';
  return `

## VISUELLE BAUSTEINE
Die Oberfläche zeichnet bestimmte Codeblöcke als Grafik: die Sprache des Codeblocks ist der Typ, der Inhalt genau EIN JSON-Objekt.
- Nur wenn ein Baustein das Verständnis klar verbessert: Größen vergleichen, Zeiträume, Abläufe, Gegenüberstellungen, ein wichtiger Warnhinweis. Die meisten Antworten brauchen keinen; höchstens zwei pro Antwort. Nie bei kurzen Antworten oder wenn Text genügt.
- Zahlen NUR aus Quellen, dem Gesprächsverlauf oder einer Berechnung — niemals geschätzt oder erfunden. Ohne belastbare Zahlen kein Zahlen-Baustein. Die Herkunft gehört in "note". Diese Regel nicht in der Antwort kommentieren.
- Ein Baustein ERSETZT die entsprechende Aufzählung im Text: was im Baustein steht, steht nicht noch einmal als Liste davor oder danach. Der Text drumherum ordnet ein und bleibt ohne Grafik verständlich.
- Keine Quellenmarker ([1]) und kein Markdown im JSON — zitiert wird im Fließtext.
- Gültiges JSON: doppelte Anführungszeichen, Zahlen als Zahl (12.5). "title" und "note" sind überall optional.
${kinds.map((kind) => KIND_LINES[kind]).join('\n')}${kinds.includes('bars') ? `\nBeispiel:\n${EXAMPLE}` : ''}`;
}
