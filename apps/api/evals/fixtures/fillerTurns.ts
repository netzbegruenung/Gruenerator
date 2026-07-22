/**
 * Realistic filler user/assistant pairs used to pad a scenario's wire history
 * (`padTurns: N`) so long-thread probes exercise context pruning without
 * replaying N real turns. Deliberately mundane Grünen-flavoured smalltalk-work
 * — nothing here should establish scope, mention a tool, or create artifacts.
 */
export interface FillerPair {
  user: string;
  assistant: string;
}

export const FILLER_PAIRS: FillerPair[] = [
  {
    user: 'Wann ist eigentlich die nächste Mitgliederversammlung sinnvoll zu planen?',
    assistant:
      'Für eine Mitgliederversammlung bieten sich Dienstag- oder Donnerstagabende an, mit mindestens vier Wochen Vorlauf für die Einladung. Achtet auf Ferienzeiten und lokale Großveranstaltungen.',
  },
  {
    user: 'Danke. Was gehört klassisch auf die Tagesordnung?',
    assistant:
      'Üblich sind: Begrüßung, Bericht des Vorstands, Finanzbericht, aktuelle politische Lage, Anträge, Verschiedenes. Plant Pufferzeit für Diskussionen ein.',
  },
  {
    user: 'Wie lang sollte ein Redebeitrag auf einer Kundgebung sein?',
    assistant:
      'Drei bis fünf Minuten sind ideal — eine klare Kernbotschaft, ein konkretes Beispiel, ein Aufruf zum Schluss. Länger verliert das Publikum.',
  },
  {
    user: 'Hast du Tipps für die Moderation von Ortsverbandssitzungen?',
    assistant:
      'Feste Redeliste, Timeboxing pro Tagesordnungspunkt, Ergebnisse sofort festhalten und am Ende die nächsten Schritte mit Verantwortlichen benennen.',
  },
  {
    user: 'Was ist der Unterschied zwischen Antrag und Beschluss?',
    assistant:
      'Ein Antrag ist der Vorschlag, über den abgestimmt wird; der Beschluss ist das angenommene Ergebnis. Anträge sollten eine klare Beschlussformel enthalten.',
  },
  {
    user: 'Wie viele Unterschriften braucht ein Bürgerbegehren ungefähr?',
    assistant:
      'Das variiert je nach Bundesland und Gemeindegröße, meist zwischen 3 und 10 Prozent der Wahlberechtigten. Die genaue Quote steht in der jeweiligen Gemeindeordnung.',
  },
  {
    user: 'Okay. Und wie lange dauert so ein Verfahren üblicherweise?',
    assistant:
      'Von der Anmeldung bis zum Bürgerentscheid vergehen meist sechs bis zwölf Monate, abhängig von Prüffristen und der Terminierung durch die Gemeinde.',
  },
  {
    user: 'Welche Uhrzeit ist gut für einen Infostand am Samstag?',
    assistant:
      'Zwischen 10 und 13 Uhr ist die Fußgängerfrequenz in den meisten Innenstädten am höchsten. Frühzeitig Standgenehmigung beim Ordnungsamt beantragen.',
  },
  {
    user: 'Wie begrüße ich neue Mitglieder am besten im Ortsverband?',
    assistant:
      'Persönliche Begrüßungsmail, Einladung zum nächsten Treffen mit Patin oder Pate, und ein kurzes Willkommensgespräch über Interessen und Mitmachmöglichkeiten.',
  },
  {
    user: 'Was kostet ungefähr ein Satz Plakate für die Kommunalwahl?',
    assistant:
      'Grob 2 bis 4 Euro pro Hohlkammerplakat inklusive Druck bei üblichen Auflagen; dazu kommen Kabelbinder und gegebenenfalls Gebühren für die Plakatierungserlaubnis.',
  },
  {
    user: 'Wann sollte man mit dem Plakatieren anfangen?',
    assistant:
      'Sobald die kommunale Plakatierungserlaubnis gilt — meist sechs Wochen vor der Wahl. Die besten Standorte sind schnell vergeben, also früh planen.',
  },
  {
    user: 'Wie funktioniert eigentlich ein Weltcafé-Format?',
    assistant:
      'Kleine Tischgruppen diskutieren rotierend je eine Frage in mehreren Runden; Gastgeber*innen bleiben am Tisch und fassen zusammen. Am Ende werden die Ergebnisse im Plenum geteilt.',
  },
];

/**
 * Deterministic filler selection: pair i of a pad of length n is
 * FILLER_PAIRS[i % length] — same input, same padded history, every run.
 */
export function buildFillerHistory(n: number): FillerPair[] {
  return Array.from({ length: n }, (_, i) => FILLER_PAIRS[i % FILLER_PAIRS.length]);
}
