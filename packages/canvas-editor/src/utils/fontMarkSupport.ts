/**
 * Welche Auszeichnung eine Schrift tragen kann — abgeleitet aus den
 * `@font-face`-Regeln in `styles/typography.css`, nicht je Vorlage gepflegt.
 *
 * Grund für die Ableitung: Fett und Kursiv brauchen einen ECHTEN Schnitt.
 * Fehlt er, synthetisiert der Browser einen (schräggestellt bzw. verfettet),
 * der Server-Renderer kennt diese Synthese nicht — Vorschau und Export liefen
 * in Breite und Umbruch auseinander. Eine Liste je Vorlage hätte dieselbe
 * Frage an 24 Stellen beantwortet und wäre beim nächsten Schriftwechsel
 * stillschweigend falsch geworden.
 *
 * Unterstreichung steht NICHT hier: sie ist keine Schriftvariante, sondern
 * wird auf beiden Seiten gezeichnet (Konva `textDecoration`, serverseitig
 * `drawRichTextLines`) und gilt deshalb für jede Schrift. Aufzählungen
 * ebenso — sie sind Umbruch, kein Schnitt.
 *
 * `fontFamily` kommt als CSS-Stapel („PT Sans, Arial, sans-serif"); gewertet
 * wird die erste Familie, denn die zeichnet, solange sie geladen ist.
 */

export interface FontMarkSupport {
  bold: boolean;
  italic: boolean;
}

/**
 * Familien mit echten Schnitten. Alles, was hier fehlt, bekommt weder Fett
 * noch Kursiv angeboten — der sichere Standard, wenn jemand eine Schrift
 * hinzufügt und diese Tabelle vergisst.
 *
 * `GothamNarrow-Bold` ist bewusst NICHT der Fettschnitt von
 * `GothamNarrow-Book`: die drei Gotham-Schnitte sind als je eigene Familie
 * deklariert, `font-weight: bold` auf Book träfe keinen von ihnen.
 *
 * `Vollkorn` ist eine Kursiv-Familie — beide Schnitte sind kursiv, einen
 * aufrechten gibt es nicht. Kursiv anzubieten wäre wirkungslos, Fett dagegen
 * trifft `Vollkorn-BoldItalic`.
 */
const FACES: Record<string, FontMarkSupport> = {
  'PT Sans': { bold: true, italic: true },
  Vollkorn: { bold: true, italic: false },
};

const NONE: FontMarkSupport = { bold: false, italic: false };

/** Erste Familie aus einem CSS-Stapel, ohne Anführungszeichen. */
export function primaryFontFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

export function fontMarkSupport(fontFamily: string): FontMarkSupport {
  return FACES[primaryFontFamily(fontFamily)] ?? NONE;
}
