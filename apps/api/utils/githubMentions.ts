/**
 * Entschärft `@name` in Text, der als GitHub-Kommentar oder Issue-Body gepostet
 * wird.
 *
 * GitHub macht aus jedem `@name` im Body eine echte Nutzer-Erwähnung und
 * benachrichtigt den Account. Unsere Doku benutzt `@berlin`, `@saar` & Co. als
 * Beispiele für Grünerator-Notebook-Erwähnungen — wörtlich zitiert landen die
 * im Kommentar und pingen fremde GitHub-Nutzer, die mit dem Projekt nichts zu
 * tun haben.
 *
 * Ein leerer HTML-Kommentar hinter dem `@` bricht das Erwähnungsmuster; gerendert
 * steht weiterhin `@saar` da. Code-Spans bleiben unangetastet: GitHub verlinkt
 * darin ohnehin nicht, und ein sichtbares `<!---->` wäre dort nur Müll. Bei
 * unpaarigen Backticks fällt der Split auf „kein Code-Span" zurück, also im
 * Zweifel entschärft statt gepingt.
 */
export function neutralizeGithubMentions(text: string): string {
  return text
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/@(?=[A-Za-z0-9])/g, '@<!---->')))
    .join('');
}
