/**
 * Reine Hilfsfunktionen für `POST /api/texte/website` — ohne Express, ohne
 * Dienste, damit sie einzeln prüfbar sind. Der Vertrags-Router reicht nur
 * Modellantwort und Bildwähler herein.
 */
import { type WebsiteContent } from '@gruenerator/contracts';

/** Höchstzahl Themen bzw. Aktionen — die Seitenvorlage zeigt nicht mehr an. */
export const MAX_SECTION_ITEMS = 3;

/**
 * Modellantwort in JSON verwandeln.
 *
 * Zäunt zwei Eigenheiten ein, die beide beobachtet wurden, obwohl der Prompt
 * das Gegenteil verlangt: der Code-Zaun (```json) um die Antwort, und echte
 * Zeilenumbrüche INNERHALB von Zeichenketten, an denen `JSON.parse` abbricht.
 *
 * Wirft bei unlesbarer Eingabe — der Aufrufer wandelt das in eine Absage.
 */
export function parseModelJson(raw: string): unknown {
  const unfenced = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const escaped = unfenced.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  );
  return JSON.parse(escaped);
}

/** Auf die Zahl von Abschnitten kürzen, die die Vorlage darstellen kann. */
export function clampSections(content: WebsiteContent): WebsiteContent {
  return {
    ...content,
    themes: content.themes.slice(0, MAX_SECTION_ITEMS),
    actions: content.actions.slice(0, MAX_SECTION_ITEMS),
  };
}

/**
 * Bild-URLs für Held, Themen, Aktionen und Kontakt nachtragen.
 *
 * Die Zuordnung läuft über die tatsächlichen Längen, nicht über feste Indizes.
 * Der Vorgänger schnitt `slice(1, 4)` / `slice(4, 7)` / `[7]` aus einem flachen
 * Ergebnis-Array und rechnete damit fest mit je drei Themen und Aktionen —
 * lieferte das Modell zwei, bekamen die Aktionen die Bilder der Themen und das
 * Kontaktbild fiel ganz weg.
 *
 * @param pick Liefert eine Bild-URL zu einem Text, oder '' wenn nichts passt.
 */
export async function attachImages(
  content: WebsiteContent,
  pick: (text: string) => Promise<string>
): Promise<WebsiteContent> {
  const [heroUrl, themeUrls, actionUrls, contactUrl] = await Promise.all([
    pick(`${content.hero_image.title} ${content.hero_image.subtitle}`),
    Promise.all(content.themes.map((theme) => pick(`${theme.title} ${theme.content}`))),
    Promise.all(content.actions.map((action) => pick(action.text))),
    pick(`${content.contact.title} Kontakt Politik Grüne`),
  ]);

  return {
    ...content,
    hero_image: { ...content.hero_image, imageUrl: heroUrl },
    themes: content.themes.map((theme, i) => ({ ...theme, imageUrl: themeUrls[i] ?? '' })),
    actions: content.actions.map((action, i) => ({ ...action, imageUrl: actionUrls[i] ?? '' })),
    contact: { ...content.contact, backgroundImageUrl: contactUrl },
  };
}
