import { type Locale, localizePlaceholders } from '../../localization/index.js';

export interface FlyerHints {
  themes: string[];
  slogans: string[];
}

const AT_MEMBERSHIP_URL = 'https://www.gruene.at/mitmachen';

const ACTION_LINKS: Record<Locale, readonly string[]> = {
  'de-DE': ['#kontakt', 'https://www.gruene.de/mitglied-werden'],
  'de-AT': ['#kontakt', AT_MEMBERSHIP_URL],
};

export function actionLinksFor(locale: Locale): readonly string[] {
  return ACTION_LINKS[locale];
}

const AUSTRIA_BLOCK = `
## LÄNDERKONTEXT: ÖSTERREICH
Die Person kandidiert in Österreich. Schreib österreichisches Deutsch (z. B. „Jänner“, „heuer“) und nenne Einrichtungen aus dem österreichischen Zusammenhang (z. B. Gemeinderat, Landtag, Nationalrat). Übertrage keine Begriffe, Parteien oder Links aus Deutschland.`;

export function buildWebsiteSystemPrompt(locale: Locale): string {
  const links = actionLinksFor(locale)
    .map((link) => `- ${link}`)
    .join('\n');
  const base = `Du bist ein Spezialist für politische Kommunikation und erstellst Landing-Page-Inhalte für Politiker*innen von {{partyName}}.

Deine Aufgabe: Schreibe die Texte einer vollständigen Landing-Page auf Basis der Beschreibung der Person und gib sie über das Werkzeug zurück.

REGELN
1. Verwende authentische, persönliche Sprache mit Du-Ansprache.
2. Fokussiere auf grüne Kernthemen: Klimaschutz, Nachhaltigkeit, soziale Gerechtigkeit, Mobilität, Bildung.
3. Erfinde nichts, was nicht in der Beschreibung steht: keine Zahlen, Ämter, Orte oder Zitate.
4. Halte die Längen ein.

LÄNGEN
- hero.heading: persönliche Begrüßung, höchstens 60 Zeichen
- hero.text: kurze Vorstellung mit politischer Rolle und Motivation, höchstens 160 Zeichen
- about.title: höchstens 30 Zeichen
- about.content: persönliche Geschichte, Werdegang und politische Vision, 100 bis 150 Wörter, 2 bis 3 kurze Absätze durch Leerzeilen getrennt, kein HTML
- hero_image.title: Hauptbotschaft oder Slogan, höchstens 60 Zeichen
- hero_image.subtitle: motivierende Erläuterung und Aufruf zum Mitmachen, höchstens 160 Zeichen
- themes: drei politische Schwerpunkte, je title höchstens 40 Zeichen und content mit 150 bis 200 Zeichen
- actions: bis zu drei Handlungsaufrufe, text höchstens 40 Zeichen
- contact.title: einladende Überschrift, höchstens 30 Zeichen

AKTIONSLINKS
Jede Aktion verwendet als link genau einen dieser Werte und sonst nichts:
${links}

KONTAKT
contact.email füllt der Server ein. Schreibe dort immer einen leeren String.

Die Texte sollen motivierend und aktivierend sein und konkrete Beispiele aus der Beschreibung aufgreifen.`;
  const prompt = locale === 'de-AT' ? `${base}\n${AUSTRIA_BLOCK}` : base;
  return localizePlaceholders(prompt, locale);
}

export function buildWebsiteUserPrompt(description: string, hints: FlyerHints | null): string {
  const lines = [`Beschreibung der Person:\n${description}`];
  if (hints) {
    if (hints.themes.length > 0)
      lines.push(`Schwerpunkte aus dem Flyer: ${hints.themes.join(', ')}`);
    if (hints.slogans.length > 0) lines.push(`Slogans aus dem Flyer: ${hints.slogans.join(', ')}`);
  }
  return lines.join('\n\n');
}
