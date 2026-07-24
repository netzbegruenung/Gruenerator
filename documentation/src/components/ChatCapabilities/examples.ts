/**
 * The hand-written half of the "Was kann ich den Grünerator fragen?" article:
 * example questions per chat intent, plus the grouping and the plain-German
 * label used when a capability has no @-Mention of its own.
 *
 * The other half — which intents exist, what they are called and what they do —
 * comes from src/generated/chat-capabilities.json, generated from the app's own
 * registries. index.tsx joins the two; a capability missing here simply doesn't
 * appear on the page, and `capabilities:audit` files a GitHub issue naming it.
 * So a new chat capability doesn't break any build, but it doesn't stay
 * undocumented in silence either.
 *
 * Adding a new intent? Give it 2–3 questions a real user would actually type.
 */

export interface CapabilityExample {
  /** Intent id from the manifest (packages/contracts … searchIntentSchema). */
  intent: string;
  /** Which group of the article it belongs to (see GROUPS). */
  group: string;
  /** Fallback heading when the capability has no mentionable of its own. */
  label: string;
  /** Optional mentionable id — pulls title/description/@-Mention from the code. */
  mentionable?: string;
  /** Optional tool key from the Grüneratoren capability picker (userTools.ts). */
  userTool?: string;
  /** Fallback description when no mentionable is mapped. */
  hint?: string;
  /** 2–3 sample questions in the wording a user would type. */
  questions: string[];
}

export interface CapabilityGroup {
  id: string;
  title: string;
  intro: string;
}

export const GROUPS: CapabilityGroup[] = [
  {
    id: 'recherche',
    title: 'Recherchieren und nachschlagen',
    intro:
      'Fragen, bei denen der Grünerator erst nachsieht und dann antwortet — in grünen Programmen, im Web oder in deinen eigenen Inhalten.',
  },
  {
    id: 'politik',
    title: 'Politische Datenquellen',
    intro:
      'Offizielle Quellen, die der Grünerator direkt abfragt statt sie zu erraten. Antworten kommen mit Quellenangabe.',
  },
  {
    id: 'erstellen',
    title: 'Etwas erstellen lassen',
    intro:
      'Aus einer Anweisung wird ein fertiges Ergebnis: Text, Bild, Sharepic, Tabelle, Präsentation oder Dokument.',
  },
  {
    id: 'bearbeiten',
    title: 'Vorhandenes bearbeiten und teilen',
    intro:
      'Der Grünerator kann Dokumente und Boards ändern, die du per @ erwähnst oder gerade offen hast.',
  },
  {
    id: 'alltag',
    title: 'Alltagshilfen',
    intro:
      'Praktische Auskünfte rund um Termine und Reisen. Dahinter stecken externe Dienste, die pro Umgebung eingerichtet werden — ist einer davon gerade nicht angebunden, beantwortet der Grünerator die Frage über die normale Websuche, bei Zugverbindungen dann allerdings ohne Live-Daten.',
  },
  {
    id: 'verbunden',
    title: 'Verbundene Dienste',
    intro: 'Was du fragen kannst, wenn du eigene Dienste mit dem Grünerator verbunden hast.',
  },
];

/**
 * Intents that exist in code but are never something a user "asks for": routing
 * dispositions of the classifier. Listed here so the drift check stays complete
 * without inventing example questions for them.
 */
export const INTERNAL_INTENTS: Record<string, string> = {
  direct:
    'Standardfall — der Grünerator antwortet direkt, ohne Werkzeug. Gilt für Begrüßungen, Umformulierungen und freies Schreiben.',
  agentic:
    'Interne Weiche: Ist unklar, welches Werkzeug passt, entscheidet das Modell selbst während der Antwort.',
};

export const EXAMPLES: CapabilityExample[] = [
  // ---------------------------------------------------------------- Recherche
  {
    intent: 'search',
    group: 'recherche',
    label: 'Grüne Programme und Beschlüsse',
    mentionable: 'search',
    userTool: 'search',
    questions: [
      'Was steht im Grundsatzprogramm zum Thema Mieten?',
      'Welche Beschlüsse gibt es zur Kindergrundsicherung?',
      '@dokumente Wie positionieren wir uns zum Verbrenner-Aus?',
    ],
  },
  {
    intent: 'web',
    group: 'recherche',
    label: 'Websuche',
    mentionable: 'research',
    userTool: 'web',
    questions: [
      'Was ist diese Woche beim EU-Renaturierungsgesetz passiert?',
      'Wie viele Windräder wurden 2025 in Bayern genehmigt?',
    ],
  },
  {
    intent: 'research',
    group: 'recherche',
    label: 'Recherche in der Tiefe',
    userTool: 'web',
    hint: 'Dieselbe Funktion wie „Recherche" — bei aufwendigen Fragen wertet der Grünerator von sich aus mehrere Quellen aus und belegt die Antwort mit nummerierten Fundstellen. Umstellen musst du nichts, ausführliche Formulierungen genügen.',
    questions: [
      'Recherchiere ausführlich, wie andere Kommunen die Wärmeplanung finanzieren.',
      'Mach mir eine gründliche Recherche zum Stand der Krankenhausreform mit Quellen.',
    ],
  },
  {
    intent: 'compare',
    group: 'recherche',
    label: 'Positionen vergleichen',
    hint: 'Zwei oder mehr Quellen werden gegenübergestellt statt nacheinander zusammengefasst.',
    questions: [
      'Vergleiche unsere Position zum Klimageld mit der im Bundestagswahlprogramm.',
      'Was unterscheidet das Wahlprogramm Bayern vom Grundsatzprogramm beim Thema Landwirtschaft?',
    ],
  },
  {
    intent: 'examples',
    group: 'recherche',
    label: 'Beispiel-Posts aus dem Fundus',
    userTool: 'examples',
    hint: 'Zeigt echte Social-Media-Beiträge zu einem Thema als Vorlage oder Inspiration.',
    questions: [
      'Zeig mir Beispiel-Posts zum Thema Radverkehr.',
      'Wie haben andere über den Kohleausstieg gepostet?',
    ],
  },
  {
    intent: 'pressemitteilung_examples',
    group: 'recherche',
    label: 'Beispiel-Pressemitteilungen',
    hint: 'Sucht bestehende Pressemitteilungen als Muster für Aufbau und Tonalität.',
    questions: [
      'Gibt es Beispiel-Pressemitteilungen zum Thema ÖPNV-Ausbau?',
      'Zeig mir, wie andere Kreisverbände eine PM zum Haushalt geschrieben haben.',
    ],
  },
  {
    intent: 'scrape_url',
    group: 'recherche',
    label: 'Webseite lesen',
    userTool: 'scrape',
    hint: 'Der Grünerator ruft eine Adresse auf, die du nennst, und arbeitet mit deren Inhalt weiter.',
    questions: [
      'Lies https://www.gruene.de/artikel/… und fasse es in fünf Punkten zusammen.',
      'Was steht auf dieser Seite? https://…',
    ],
  },
  {
    intent: 'chat_history',
    group: 'recherche',
    label: 'Frühere Chats und eigene Inhalte',
    userTool: 'search_threads',
    hint: 'Durchsucht deine bisherigen Unterhaltungen und deine gespeicherten Texte, Dokumente und Notizen.',
    questions: [
      'Worüber haben wir letzte Woche zum Thema Haushalt gesprochen?',
      'Finde meinen Entwurf für die Rede zum Stadtfest.',
    ],
  },

  // ------------------------------------------------------------------ Politik
  {
    intent: 'bundestag',
    group: 'politik',
    label: 'Bundestag',
    mentionable: 'bundestag',
    questions: [
      'Welche Drucksachen gibt es zum Gebäudeenergiegesetz?',
      'Was hat unsere Fraktion in der letzten Debatte zum Klimaschutz gesagt?',
    ],
  },
  {
    intent: 'abgeordnetenwatch',
    group: 'politik',
    label: 'Abgeordnetenwatch',
    mentionable: 'abgeordnetenwatch',
    questions: [
      'Wie hat die Union beim Lieferkettengesetz abgestimmt?',
      'Welche Nebentätigkeiten hat diese Abgeordnete gemeldet?',
    ],
  },
  {
    intent: 'umfragen',
    group: 'politik',
    label: 'Umfragen',
    mentionable: 'umfragen',
    userTool: 'meinungsbild',
    questions: [
      'Wie stehen wir aktuell in der Sonntagsfrage?',
      'Was sagen die Umfragen zur Landtagswahl in Sachsen-Anhalt?',
    ],
  },
  {
    intent: 'news',
    group: 'politik',
    label: 'Nachrichten',
    hint: 'Aktuelle Meldungen der tagesschau — gesamt, nach Ressort oder Bundesland.',
    questions: [
      'Was sind heute die wichtigsten Nachrichten?',
      'Gibt es aktuelle Meldungen zur Energiepolitik?',
    ],
  },

  // ---------------------------------------------------------------- Erstellen
  {
    intent: 'image',
    group: 'erstellen',
    label: 'Bild erzeugen',
    mentionable: 'image',
    userTool: 'image',
    questions: [
      'Erstelle ein Bild von einem Lastenrad vor einem Rathaus.',
      'Generiere ein Hintergrundbild mit Windrädern im Sonnenaufgang.',
    ],
  },
  {
    intent: 'image_edit',
    group: 'erstellen',
    label: 'Bild bearbeiten',
    mentionable: 'image_edit_universal',
    userTool: 'image_edit',
    hint: 'Hänge ein Bild an und beschreibe die Änderung. Für den Sonderfall „mehr Grün in die Stadt" gibt es zusätzlich `@stadtbegruenen`.',
    questions: ['Mach den Hintergrund auf diesem Bild heller.', 'Entferne das Auto links im Bild.'],
  },
  {
    intent: 'sharepic',
    group: 'erstellen',
    label: 'Sharepic',
    mentionable: 'sharepic',
    hint: 'Aus einer Kernaussage wird eine fertige Grafik im grünen Design. Nur in der Web-Version.',
    questions: [
      'Mach ein Sharepic mit der Aussage „Wärmepumpe statt Gasheizung".',
      'Erstelle ein Sharepic zum Ausbau der Kinderbetreuung.',
    ],
  },
  {
    intent: 'social_post',
    group: 'erstellen',
    label: 'Post mit passendem Sharepic',
    hint: 'Text und Grafik in einem Schritt — der Grünerator schreibt den Beitrag und gestaltet das passende Bild dazu.',
    questions: [
      'Schreib einen Instagram-Post mit Sharepic zur Verkehrswende.',
      'Mach mir einen Beitrag samt Grafik zum Tag der Artenvielfalt.',
    ],
  },
  {
    intent: 'create_sheet',
    group: 'erstellen',
    label: 'Tabelle',
    mentionable: 'sheet-erstellen',
    questions: [
      'Erstelle eine Tabelle mit unseren Wahlkampfterminen und Verantwortlichen.',
      'Leg eine Kalkulation für das Budget des Sommerfests an.',
    ],
  },
  {
    intent: 'create_presentation',
    group: 'erstellen',
    label: 'Präsentation',
    mentionable: 'praesentation-erstellen',
    questions: [
      'Mach mir eine Präsentation über unser Mobilitätskonzept, zehn Folien.',
      'Erstelle Folien für den Rechenschaftsbericht der Fraktion.',
    ],
  },
  {
    intent: 'save_as_doc',
    group: 'erstellen',
    label: 'Als Dokument speichern',
    mentionable: 'dokument-erstellen',
    questions: [
      'Speichere das als Dokument.',
      'Schreib daraus ein Dokument, das ich weiterbearbeiten kann.',
    ],
  },
  {
    intent: 'chart',
    group: 'erstellen',
    label: 'Diagramm',
    hint: 'Zahlen werden als Balken-, Linien- oder Kreisdiagramm dargestellt.',
    questions: [
      'Stell die Umfragewerte der letzten sechs Monate als Diagramm dar.',
      'Mach ein Balkendiagramm aus diesen Mitgliederzahlen.',
    ],
  },
  {
    intent: 'artifact',
    group: 'erstellen',
    label: 'Interaktive Darstellung',
    hint: 'Kleine anzeigbare Ergebnisse wie Grafiken, Zeitstrahle oder Übersichten direkt im Chat.',
    questions: [
      'Bau mir einen Zeitstrahl der Beschlüsse zur Wärmewende.',
      'Zeig die Struktur unseres Kreisverbands als Schaubild.',
    ],
  },
  {
    intent: 'create_recurring_task',
    group: 'erstellen',
    label: 'Wiederkehrende Aufgabe',
    hint: 'Ein Auftrag, den der Grünerator regelmäßig von selbst ausführt.',
    questions: [
      'Schick mir jeden Montag eine Zusammenfassung der Nachrichten zur Klimapolitik.',
      'Erinnere mich monatlich daran, die Umfragewerte zu prüfen.',
    ],
  },

  // --------------------------------------------------------------- Bearbeiten
  {
    intent: 'summary',
    group: 'bearbeiten',
    label: 'Zusammenfassen',
    mentionable: 'summary',
    questions: [
      'Fass dieses PDF in zehn Stichpunkten zusammen.',
      'Worum ging es in unserem Gespräch bisher?',
    ],
  },
  {
    intent: 'compute',
    group: 'bearbeiten',
    label: 'Rechnen und auszählen',
    hint: 'Rechnungen, Umrechnungen, Datums- und Zählaufgaben werden tatsächlich gerechnet statt geschätzt.',
    questions: [
      'Wie viele Tage sind es noch bis zur Kommunalwahl?',
      'Rechne aus, was 12.000 Euro auf 18 Monate pro Monat bedeuten.',
    ],
  },
  {
    intent: 'modify_doc',
    group: 'bearbeiten',
    label: 'Ein erwähntes Dokument ändern',
    hint: 'Erwähne das Dokument mit @ und sag, was geändert werden soll.',
    questions: [
      '@Antrag Radwege kürze den Text auf eine Seite.',
      'Ergänze in @Pressemitteilung ein Zitat der Fraktionsvorsitzenden.',
    ],
  },
  {
    intent: 'edit_current_doc',
    group: 'bearbeiten',
    label: 'Das offene Dokument ändern',
    hint: 'Im Editor mit geöffneter Chat-Seitenleiste bezieht sich jede Anweisung auf das Dokument vor dir.',
    questions: [
      'Formuliere den zweiten Absatz sachlicher.',
      'Füg am Ende eine Zusammenfassung in drei Punkten an.',
    ],
  },
  {
    intent: 'modify_board',
    group: 'bearbeiten',
    label: 'Ein erwähntes Board ändern',
    mentionable: 'board-erstellen',
    hint: 'Aufgabenkarten auf einem Board anlegen, verschieben oder umbenennen.',
    questions: [
      'Leg in @Wahlkampf-Board Karten für alle Infostand-Termine an.',
      'Verschieb die erledigten Aufgaben in @Projektboard nach „Fertig".',
    ],
  },
  {
    intent: 'edit_current_board',
    group: 'bearbeiten',
    label: 'Das offene Board ändern',
    hint: 'Wie oben, nur ohne Erwähnung — es gilt das Board, das gerade offen ist.',
    questions: ['Erstell aus dieser Liste Aufgabenkarten.', 'Ordne die Karten nach Fälligkeit.'],
  },
  {
    intent: 'share_doc',
    group: 'bearbeiten',
    label: 'Dokument teilen',
    hint: 'Ein Dokument mit einer Gruppe teilen, in der du Mitglied bist.',
    questions: [
      'Teil das Dokument mit meiner Kreisverbands-Gruppe.',
      'Gib @Wahlprogramm-Entwurf für die Vorstandsgruppe frei.',
    ],
  },

  // ------------------------------------------------------------------ Alltag
  {
    intent: 'bahn',
    group: 'alltag',
    label: 'Bahnauskunft',
    hint: 'Abfahrten, Ankünfte und Störungen an einem Bahnhof. Keine Verbindungssuche mit Umstiegen oder Preisen.',
    questions: [
      'Wann fahren heute Abend Züge von Kassel Richtung Berlin?',
      'Gibt es Störungen am Hauptbahnhof Freiburg?',
    ],
  },
  {
    intent: 'reise',
    group: 'alltag',
    label: 'Reise planen',
    hint: 'Zug, Übernachtung und Wetter in einer Antwort — für Fahrten zu Parteitagen und Terminen.',
    questions: [
      'Plane meine Fahrt zum Länderrat: Zug und Hotel.',
      'Ich muss Donnerstag nach Hannover — wie komme ich hin und wo kann ich übernachten?',
    ],
  },
  {
    intent: 'hotel',
    group: 'alltag',
    label: 'Unterkunft suchen',
    hint: 'Preisvergleich über trivago. Preise ohne Gewähr.',
    questions: [
      'Such mir ein Hotel in Leipzig für den 12. bis 14. März.',
      'Was kostet eine Übernachtung nahe dem Kongresszentrum?',
    ],
  },
  {
    intent: 'wetter',
    group: 'alltag',
    label: 'Wetter',
    hint: 'Vorhersage, aktuelles Wetter und Luftqualität — praktisch für Infostände und Aktionen.',
    questions: [
      'Wie wird das Wetter am Samstag in Münster? Wir haben Infostand.',
      'Regnet es morgen Vormittag in Wien?',
    ],
  },

  // ---------------------------------------------------------------- Verbunden
  {
    intent: 'mcp',
    group: 'verbunden',
    label: 'Eigene verbundene Dienste',
    hint: 'Hast du unter Integrationen einen Dienst verbunden, kannst du ihn im Chat ansprechen.',
    questions: [
      '@tally Wie viele Antworten hat mein Formular bisher?',
      'Leg in meinem Aufgabenwerkzeug eine Aufgabe für die Vorstandssitzung an.',
    ],
  },
];
