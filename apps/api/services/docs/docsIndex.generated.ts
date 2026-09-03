/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: documentation/docs (pnpm docs:index)
 * Regenerate: pnpm docs:index
 *
 * The chat's searchable view of the user documentation. `pages` backs the
 * page map injected into the system prompt; `sections` is the BM25 corpus
 * behind the `gruenerator_docs_search` tool. See ./docsIndex.ts.
 */

export interface DocPage {
  /** Site-relative URL path, e.g. `/docs/chat/ki-chat`. */
  url: string;
  title: string;
  category: string;
  /** First paragraph after the H1 — the page-map summary. */
  lead: string;
}

export interface DocSection {
  url: string;
  /** Page title, for citation labels ("KI-Chat · Modelle wechseln"). */
  pageTitle: string;
  /** Heading text; equals `pageTitle` for the page-intro section. */
  heading: string;
  /** `#slug` anchor, or '' for the page-intro section. */
  anchor: string;
  category: string;
  text: string;
}

/** Absolute base prepended to every `url` when a citation link is built. */
export const DOCS_SITE_URL = "https://doku.gruenerator.eu";

export const DOCS_PAGES: readonly DocPage[] = [
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "title": "März 2025: Kennst du schon Gruugo?",
    "category": "Archiv",
    "lead": "Zugegeben, der Betreff klingt wie aus dem letzten Jahrhundert, hat es aber in sich. Denn: Das Grünerator-Universum hat Zuwachs bekommen. Darf ich vorstellen? Gruugo."
  },
  {
    "url": "/docs/archiv/newsletter/2025-05-testlabor",
    "title": "Mai 2025: Komm ins Testlabor!",
    "category": "Archiv",
    "lead": "Alles neu macht der Mai? Für den Grünerator gilt das zumindest ein bisschen. Eine Reihe von neuen Features ist unterwegs, die den Grünerator grundsätzlich ändern. Um diese zu testen, möchte ich in Zu…"
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "title": "Oktober 2025: Grünerator Reimagined",
    "category": "Archiv",
    "lead": "Tausende Seiten an Anträgen, Pressemitteilungen & Co werden jeden Monat mit dem Grünerator grüneriert. Und er kann jetzt noch mehr: Er sieht besser aus, kann Sharepics kreieren, deine Bilder veränder…"
  },
  {
    "url": "/docs/archiv/newsletter/2025-12-weihnachtszeit",
    "title": "Dezember 2025: Grünerator zur Weihnachtszeit",
    "category": "Archiv",
    "lead": "Hast du schon alle Weihnachtsgeschenke besorgt? Im privaten Stress kann es schnell mal untergehen, Weihnachtsgrüße für deinen Orts- oder Kreisverband zu erstellen. Aber keine Sorge: Dafür gibt's den…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-01-jahr-der-daten",
    "title": "Januar 2026: Jahr der Daten",
    "category": "Archiv",
    "lead": "Was hast du dir dieses Jahr vorgenommen? Mehr Sport, mehr Zeit für die Familie oder einfach weniger Stress? Für den Grünerator soll das kommende Jahr entscheidend werden. Und beginnt direkt besonders…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-03-ki-chat-launch",
    "title": "März 2026: Grünerator Chat",
    "category": "Archiv",
    "lead": "Während du das hier liest, befinden sich die USA und Israel mit dem Iran in einer militärischen Auseinandersetzung. Eigentlich ist das kein Grund für einen Grünerator-Newsletter. Doch es gibt etwas,…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "title": "April 2026: Das große Work-Update",
    "category": "Archiv",
    "lead": "Wir müssen alle mehr arbeiten, heißt es. Wie es selten heißt: Wir müssen effizienter arbeiten. Aber warum eigentlich nicht? Mit einem KI-assistierten Arbeitsplatz können wir schneller und effizienter…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-05-erstelle-dein-notebook",
    "title": "Mai 2026: Das Notebook-Update",
    "category": "Archiv",
    "lead": "ab sofort kannst du im Grünerator deine eigenen Notebooks erstellen – mit eigenen Quellen, eigenen Fragen, eigenen Antworten."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "title": "Juli 2026: Der XXL-Testsommer",
    "category": "Archiv",
    "lead": "normalerweise stelle ich dir ein neues Feature vor. Heute sind es gleich vier – und alle auf einmal."
  },
  {
    "url": "/docs/archiv/signal-nachrichten/2026-05-erstelle-dein-notebook",
    "title": "Mai 2026: Das Notebook-Update",
    "category": "Archiv",
    "lead": "Verschickt am 19. Mai 2026 als Signal-Broadcast · Kurzfassung zum Newsletter Mai 2026."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "title": "Barrierefreiheit",
    "category": "Basics",
    "lead": "Diese Seite sagt, wie barrierefrei der Grünerator heute ist — einschließlich der Stellen, an denen er es noch nicht ist. Eine geschönte Liste hilft niemandem: Wer auf eine Barriere stößt, die hier ni…"
  },
  {
    "url": "/docs/basics/gruenerator-pro-eu",
    "title": "Grünerator Pro-EU",
    "category": "Basics",
    "lead": "Wenn Parteien, Abgeordnete und Ehrenamtliche KI-Werkzeuge nutzen, fließen politische Inhalte durch fremde Infrastruktur – Kampagnentexte, Pressemitteilungen, interne Strategien. Bei den meisten KI-To…"
  },
  {
    "url": "/docs/basics/intro",
    "title": "Grünerator – die Grüne KI",
    "category": "Basics",
    "lead": "Der Grünerator ist ein speziell für Bündnis 90/Die Grünen entwickeltes KI-Tool. Er erstellt Texte wie Pressemitteilungen, Social-Media-Beiträge, Anträge für kommunale Parlamente und viele weitere. Au…"
  },
  {
    "url": "/docs/basics/Kennzeichnungs-Guide",
    "title": "Kennzeichnung grünerierter Inhalte",
    "category": "Basics",
    "lead": "Bei der Nutzung des Grünerators stellen sich viele von euch Fragen der Transparenz: Wann muss ich kennzeichnen, dass ein Text von KI erstellt wurde und wann nicht?"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "title": "Wie nachhaltig ist der Grünerator?",
    "category": "Basics",
    "lead": "{/ Welches Modell wo läuft, steht NICHT in dieser Datei — und WELCHER ANBIETER WELCHE AUFGABE hat, ebenfalls nicht: und rendern beide src/generated/models.json, und das liest scripts/generate-models.…"
  },
  {
    "url": "/docs/basics/notebook",
    "title": "Deine Daten im Grünerator",
    "category": "Basics",
    "lead": "Landesverbände und Abgeordnetenbüros können ein Grünerator Notebook erwerben und eigene Daten in den Grünerator einpflegen. Damit ermöglicht ihr, dass Basismitglieder und Kommunalos den Grünerator da…"
  },
  {
    "url": "/docs/basics/open-source",
    "title": "Worauf der Grünerator aufbaut",
    "category": "Basics",
    "lead": "Der Grünerator steht auf den Schultern vieler freier Open-Source-Projekte – Software, die offen entwickelt wird und die alle nutzen, einsehen und weiterentwickeln dürfen. Das passt zu unserer Haltung…"
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "title": "Risiken und Gefahren",
    "category": "Basics",
    "lead": "Zugegeben, KI ist praktisch. Aber wir wären nicht bei den GRÜNEN, wenn wir nicht auch darauf achten würden, welche Risiken und Gefahren KI zugrunde liegen. Ich würde folgende Punkte fokussieren:"
  },
  {
    "url": "/docs/basics/tools",
    "title": "Alle Werkzeuge",
    "category": "Basics",
    "lead": "Der Grünerator ist kein einzelnes Programm, sondern eine Sammlung von Werkzeugen. Diese Seite zeigt, welche es gibt und wofür man sie nimmt — damit du nicht suchen musst, wo du etwas findest."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "title": "Wie LLMs funktionieren",
    "category": "Basics",
    "lead": "Ein großes Sprachmodell, wie zum Beispiel ChatGPT , ist ein KI-Modell, das darauf trainiert ist, menschenähnlichen Text zu verstehen und zu erzeugen. Es ist im Kern eine hochentwickelte Anwendung von…"
  },
  {
    "url": "/docs/bildnachweise",
    "title": "Bildnachweise & Lizenzen",
    "category": "Allgemein",
    "lead": "Der Sharepic- und Canvas-Editor des Grünerators nutzt großartige, frei verfügbare Icon- und Illustrations-Sammlungen. Alle hier eingesetzten Sets sind kostenlos für private und kommerzielle Nutzung f…"
  },
  {
    "url": "/docs/chat/dateien-hinzufuegen",
    "title": "Dateien hinzufügen",
    "category": "Chat",
    "lead": "Du kannst dem Grünerator Dateien mitgeben, statt ihren Inhalt abzutippen: ein Gesetzesentwurf, eine Studie, ein Screenshot, eine Tabelle. Er liest sie und bezieht sie in die Antwort ein."
  },
  {
    "url": "/docs/chat/ki-chat",
    "title": "KI-Chat",
    "category": "Chat",
    "lead": "Der Grünerator Chat ist dein persönlicher KI-Assistent für grüne Politik. Du kannst Fragen stellen, Texte erstellen lassen, in Parteiprogrammen recherchieren und sogar Bilder generieren — alles in ei…"
  },
  {
    "url": "/docs/chat/ki-modelle",
    "title": "KI-Modelle",
    "category": "Chat",
    "lead": "Beim Grünerieren kannst du selbst wählen, welches KI-Modell deine Texte erstellt. Jedes Modell hat eigene Stärken – von besonders kreativ bis besonders schnell. Standardmäßig übernimmt der Grünerator…"
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "title": "Was kann ich fragen?",
    "category": "Chat",
    "lead": "Der Grünerator ist kein Suchfeld mit festen Befehlen — du schreibst in normalem Deutsch, was du brauchst. Diese Seite zeigt, was dabei alles möglich ist, mit Musterfragen zum Abschauen und Weiterschr…"
  },
  {
    "url": "/docs/features/agentura",
    "title": "Agentura",
    "category": "Features",
    "lead": "Die Agentura ist der Marktplatz für alle Grüneratoren und Rezepte. Hier findest du an einem Ort alle verfügbaren Grüneratoren — vom Pressestellen-Profi bis zum Landesverbands-Assistenten — entdeckst…"
  },
  {
    "url": "/docs/features/boards",
    "title": "Boards",
    "category": "Features",
    "lead": "Ein Board ist eine Tafel aus Spalten und Karten — für Aufgabenverteilung, Redaktionsplanung oder den Stand einer Kampagne. Du legst es über an."
  },
  {
    "url": "/docs/features/dokumente",
    "title": "Dokumente",
    "category": "Features",
    "lead": "Ein Dokument ist der Ort für Fließtext: Anträge, Pressemitteilungen, Protokolle, Notizen, Einladungen. Du legst es über an oder startest über aus einer Vorlage."
  },
  {
    "url": "/docs/features/intro",
    "title": "Features",
    "category": "Features",
    "lead": "Neben dem Chat gibt es im Grünerator drei größere Flächen. Diese Seiten beschreiben, was es dort gibt — jede Funktion, jeden Schalter. Wenn du stattdessen eine bestimmte Aufgabe erledigen willst, sin…"
  },
  {
    "url": "/docs/features/ki-im-editor",
    "title": "Der Grünerator im Editor",
    "category": "Features",
    "lead": "Jedes Office-Dokument hat eine Chat-Seitenleiste. Sie sieht aus wie der normale Chat und kann auch dasselbe — recherchieren, nachschlagen, Texte schreiben. Der Unterschied: Sie kennt das geöffnete Do…"
  },
  {
    "url": "/docs/features/landesverbaende",
    "title": "Landesverband-Grüneratoren",
    "category": "Features",
    "lead": "Der Grünerator hat für mehrere Landesverbände eigene, regional getunte Grüneratoren. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sp…"
  },
  {
    "url": "/docs/features/notebooks",
    "title": "Notebooks",
    "category": "Features",
    "lead": "Ein Notebook bündelt Dokumente zu einem Thema und macht ihren Inhalt im Grünerator durchsuchbar. Wie du dein erstes anlegst, steht im Guide Eigenes Notebook erstellen. Diese Seite beschreibt alles, w…"
  },
  {
    "url": "/docs/features/office",
    "title": "Office: Dokumente, Tabellen, Folien und Boards",
    "category": "Features",
    "lead": "Office ist der Ort für alles, was aus Text, Zahlen und Plänen besteht. Vier Arten von Dokumenten liegen dort nebeneinander: . Du findest sie über den Tab Arbeiten unter der Kachel ."
  },
  {
    "url": "/docs/features/praesentationen",
    "title": "Präsentationen",
    "category": "Features",
    "lead": "Eine Präsentation ist eine Folge von Folien mit eigenem Vortragsmodus. Du legst sie über an — oder lässt sie dir im Chat aus einem Thema erzeugen."
  },
  {
    "url": "/docs/features/tabellen",
    "title": "Tabellen",
    "category": "Features",
    "lead": "Eine Grünerator-Tabelle ist eine vollwertige Kalkulationstabelle: Formeln, Filter, Sortierung, Auswahllisten, bedingte Formatierung. Du legst sie über auf der Office-Startseite an — oder du lässt sie…"
  },
  {
    "url": "/docs/guides/einsteigerinnen/antrag-stadtrat",
    "title": "Wie erstelle ich einen Antrag für meinen Stadt- oder Gemeinderat?",
    "category": "Guides",
    "lead": "In etwa zehn Minuten erstellst du einen fertigen Antragsentwurf, der genau die Struktur erfüllt, die dein Gremium erwartet: Beschlussvorschlag, Sachverhalt, Begründung und finanzielle Auswirkungen."
  },
  {
    "url": "/docs/guides/einsteigerinnen/eigenes-notebook-erstellen",
    "title": "Eigenes Notebook erstellen",
    "category": "Guides",
    "lead": "In etwa zehn Minuten erstellst du ein Notebook, das eure Dokumente bündelt und ihren Inhalt im Grünerator durchsuchbar macht — für Anträge, Beschlüsse, Programme oder Pressemitteilungen. Du brauchst…"
  },
  {
    "url": "/docs/guides/einsteigerinnen/social-media-beitrag",
    "title": "Wie schreibe ich einen Social Media Beitrag?",
    "category": "Guides",
    "lead": "In etwa fünf Minuten erstellst du einen fertigen Post für Instagram, Facebook, LinkedIn, X oder ein Reel — im Ton der Plattform, in der passenden Länge, auf Wunsch mit Sharepic."
  },
  {
    "url": "/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen",
    "title": "Eigene Grüneratoren erstellen",
    "category": "Guides",
    "lead": "Du kannst dir im Grünerator deine eigenen Grüneratoren bauen — ganz ohne technische Vorkenntnisse. Es gibt zwei Wege: per Beschreibung (die KI erstellt einen Entwurf) oder manuell über das Formular."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "title": "Wolke einbinden",
    "category": "Guides",
    "lead": "Die Grüne Wolke ist unser sicherer Cloud-Speicher für alle grünen Organisationen. Über einen öffentlichen Freigabe-Link kann der Grünerator deine Wolke-Dateien lesen: Du kannst Ordner durchstöbern, D…"
  },
  {
    "url": "/docs/guides/intro",
    "title": "Guides",
    "category": "Guides",
    "lead": "Guides sind kurze Anleitungen für eine konkrete Aufgabe: „Wie schreibe ich einen Social Media Beitrag?\", „Wie erstelle ich einen Antrag für meinen Stadtrat?\". Jeder Guide führt dich in wenigen Schrit…"
  },
  {
    "url": "/docs/guides/landesverbaende/landesverband-einrichten",
    "title": "Für deinen Landesverband einrichten",
    "category": "Guides",
    "lead": "Wenn du in einer Landesgeschäftsstelle arbeitest, kann der Grünerator mehr als generisch-grün schreiben: Er kennt die Pressemitteilungen, Beschlüsse und Wahlprogramme deines Landesverbands, schreibt…"
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "title": "Grünerator für Chrome",
    "category": "Integrationen",
    "lead": "Der Grünerator für Chrome ist eine Browser-Erweiterung, die Aufgaben auf Webseiten für dich erledigt: suchen, blättern, anklicken, Formulare ausfüllen, Inhalte heraussuchen. Du beschreibst in einem S…"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "title": "Grünerator in ChatGPT & Co nutzen",
    "category": "Integrationen",
    "lead": "Du kannst den Grünerator direkt in ChatGPT, Claude, Mistral Le Chat oder OpenWebUI verwenden — ohne gruenerator.eu öffnen zu müssen. Dein KI-Assistent durchsucht dann grüne Parteiprogramme, findet Po…"
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "title": "Konnektoren: Externe Dienste im Chat",
    "category": "Integrationen",
    "lead": "Mit Konnektoren verbindest du externe Dienste — etwa Notion, Tally oder Brevo — direkt mit dem Grünerator-Chat. Die KI kann dann in deinen Formularen, Dokumenten oder Kontakten arbeiten: „Erstelle ei…"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "title": "Was kann ich den MCP-Server fragen?",
    "category": "Integrationen",
    "lead": "Du hast den Grünerator mit deinem KI-Chat verbunden — aber was kannst du damit eigentlich alles machen? Hier erfährst du, welche Fähigkeiten dir zur Verfügung stehen und wie du sie am besten nutzt."
  },
  {
    "url": "/docs/konto/einstellungen",
    "title": "Einstellungen",
    "category": "Konto & Projekte",
    "lead": "Alles, was du am Grünerator für dich einstellen kannst, liegt in einem Fenster: Einstellungen. Du öffnest es über dein Profilbild unten in der Seitenleiste oder direkt über die Adresse /settings. Es…"
  },
  {
    "url": "/docs/konto/projekte",
    "title": "Projekte",
    "category": "Konto & Projekte",
    "lead": "Ein Projekt bündelt alles, was zu einem Arbeitszusammenhang gehört: Chats, Dokumente und die Menschen, die daran arbeiten. Statt Unterhaltungen und Dateien über den ganzen Grünerator zu verstreuen, l…"
  },
  {
    "url": "/docs/sonstiges/inhaltsdatenbank",
    "title": "Inhaltsdatenbank",
    "category": "Sonstiges",
    "lead": "Der Grünerator durchsucht und indexiert Inhalte aus verschiedenen Quellen der Grünen Partei. Insgesamt sind 64.724 Vektoren in der Datenbank gespeichert."
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "title": "Wie diese Doku entsteht",
    "category": "Sonstiges",
    "lead": "Diese Dokumentation beschreibt ein Werkzeug, das sich fast wöchentlich ändert. Damit die Beschreibung nicht still veraltet, entsteht sie größtenteils direkt am Quellcode des Grünerators — die Aufzähl…"
  },
  {
    "url": "/docs/webinare",
    "title": "Webinare",
    "category": "Allgemein",
    "lead": "Erweitere dein Wissen über Künstliche Intelligenz und den Grünerator mit unseren interaktiven Online-Seminaren. Alle Webinare sind kostenlos und speziell auf die Bedürfnisse grüner Kommunalpolitik zu…"
  }
];

export const DOCS_SECTIONS: readonly DocSection[] = [
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "pageTitle": "März 2025: Kennst du schon Gruugo?",
    "heading": "März 2025: Kennst du schon Gruugo?",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter März 2025 --- Zugegeben, der Betreff klingt wie aus dem letzten Jahrhundert, hat es aber in sich. Denn: Das Grünerator-Universum hat Zuwachs bekommen. Darf ich vorstellen? Gruugo."
  },
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "pageTitle": "März 2025: Kennst du schon Gruugo?",
    "heading": "Neue Grünerator KI-Suche",
    "anchor": "#neue-grünerator-ki-suche",
    "category": "Archiv",
    "text": "Politik wird immer komplexer. Neue Rahmenbedingungen, neue Gesetze, neue Fachbegriffe und dann noch diese komplexen Verwaltungsvorlagen. Wenn man politisch etwas verändern will, braucht man viel Hintergrundwissen. Manche von uns wünschen sich eine*n Assistent*in, der*die uns dabei etwas Arbeit abnimmt. Ich habe eine neue KI-Suche programmiert, die ich Gruugo taufe, eine Kombination aus Google und „Baby Yoda\" aus The Mandalorian. Gruugo funktioniert von der Funktion her wie Google. Mit dem Unterschied, dass man nicht nur Suchergebnisse bekommt, sondern eine von der KI kuratierte Zusammenfassung des Inhalts."
  },
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "pageTitle": "März 2025: Kennst du schon Gruugo?",
    "heading": "Noch in der Beta, bald live",
    "anchor": "#noch-in-der-beta-bald-live",
    "category": "Archiv",
    "text": "Ich passe die Beta-Seite derzeit so an, dass wir sie zeitnah auf den „großen\" Grünerator bringen können. Daher habe ich die Sharepic-Features ausgeblendet, da wir diese hinter das Grüne Netz ziehen wollen. Dafür befinden wir uns in Gesprächen mit dem Bundesverband. Ich wäre dir sehr dankbar, wenn du die neuen Funktionen testest und mir Feedback an meine E-Mail sendest: info@moritz-waechter.de. Oder antworte einfach auf diese Mail. Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband weiterleiten. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "pageTitle": "März 2025: Kennst du schon Gruugo?",
    "heading": "Qualität der Ergebnisse meistens gut",
    "anchor": "#qualität-der-ergebnisse-meistens-gut",
    "category": "Archiv",
    "text": "Ich habe die Suche selbst häufig getestet und bekam häufig gute Ergebnisse mit sehr seriösen Quellen wie der Böll-Stiftung. Was noch nicht so gut klappte, sind sehr lokale und/oder sehr aktuelle Informationen. Wenn du also nach Entscheidungen suchst, die du vor wenigen Wochen im Rat getroffen hast und die maximal in der Lokalpresse gelaufen sind, ist es eher unwahrscheinlich, dass du mit Gruugo fündig wirst."
  },
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "pageTitle": "März 2025: Kennst du schon Gruugo?",
    "heading": "So funktioniert's",
    "anchor": "#so-funktionierts",
    "category": "Archiv",
    "text": "Hinter Gruugo steckt eine speziell für KI-Sprachmodelle entwickelte Suchmaschine. Diese kuratiert die Suchergebnisse anhand eines Scoring-Systems und gibt uns die zugehörigen Seiten in Volltext aus. Unser KI-Sprachmodell liest diese durch und fasst sie zusammen. Zusätzlich kuratiert die KI die zugesendeten Quellen und erstellt für sechs von ihnen Zusammenfassungen, die unter dem Text erscheinen. Gruugo ersetzt die menschliche Recherche nicht, sondern ergänzt sie. Gruugo liefert eine Ersteinschätzung und kuratierte Quellen dazu, die zum Weiterlesen anregen. Denn: KI kann Fehler machen, so auch Gruugo. Nach der KI-Recherche müssen wir sie also immer überprüfen."
  },
  {
    "url": "/docs/archiv/newsletter/2025-03-gruugo",
    "pageTitle": "März 2025: Kennst du schon Gruugo?",
    "heading": "Test: Antragsgenerator mit KI-Suche",
    "anchor": "#test-antragsgenerator-mit-ki-suche",
    "category": "Archiv",
    "text": "Ich habe außerdem als Test den Antragsgenerator mit einer Websuch-Funktion ausgestattet. Schaltet man sie ein, versucht der Antragsgenerator zu den eingegebenen Inhalten im Netz zu recherchieren und den Antrag damit zu präzisieren. Das klappt bisher unterschiedlich gut."
  },
  {
    "url": "/docs/archiv/newsletter/2025-05-testlabor",
    "pageTitle": "Mai 2025: Komm ins Testlabor!",
    "heading": "Mai 2025: Komm ins Testlabor!",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter Mai 2025 --- Alles neu macht der Mai? Für den Grünerator gilt das zumindest ein bisschen. Eine Reihe von neuen Features ist unterwegs, die den Grünerator grundsätzlich ändern. Um diese zu testen, möchte ich in Zukunft anders arbeiten: Im Labor!"
  },
  {
    "url": "/docs/archiv/newsletter/2025-05-testlabor",
    "pageTitle": "Mai 2025: Komm ins Testlabor!",
    "heading": "Neues Labor",
    "anchor": "#neues-labor",
    "category": "Archiv",
    "text": "Der Start des Reel-Grünerators verlief nicht ganz wie erhofft. Die Arbeit mit verschiedenen Video-Codecs und Formaten ist komplexer als erwartet. Inzwischen funktioniert er jedoch relativ stabil und kann Videos bis zu 500 MB verarbeiten. Die gute Nachricht: Noch in diesem Jahr wird sich der Grünerator grundlegend verändern und an dich anpassen. Künftig kann man Profile für sich und seine Gremien anlegen und den Grünerator damit personalisieren. Und noch viel mehr. Zum Testen dieser Funktionen brauche ich eine Testgruppe, die diese zuerst im Labor ausprobiert. Dafür habe ich eine Signal-Gruppe eingerichtet: Du ... bist technisch einigermaßen versiert und scheust dich nicht, die Entwicklerkonsole zu öffnen? hast gelegentlich ein paar Minuten Zeit, um neue Features zu testen? bist ein bisschen KI-affin? Dann komm in die Gruppe! Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband weiterleiten. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Oktober 2025: Grünerator Reimagined",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter Oktober 2025 --- Tausende Seiten an Anträgen, Pressemitteilungen & Co werden jeden Monat mit dem Grünerator grüneriert. Und er kann jetzt noch mehr: Er sieht besser aus, kann Sharepics kreieren, deine Bilder verändern und für mehr Barrierefreiheit sorgen."
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Erstelle Sharepics mit KI",
    "anchor": "#erstelle-sharepics-mit-ki",
    "category": "Archiv",
    "text": "Mit dem neuen Update erstellst du professionelle Sharepics für Social Media in wenigen Sekunden. Gib einfach dein Thema ein, und die KI liefert dir einen fertig gestalteten Vorschlag. Der Grünerator kann derzeit 3 Typen von Sharepics grünerieren: Normale Sharepics (drei Balken), Zitat-Sharepics (mit und ohne Bild) sowie Info-Posts. Gerade für diejenigen, die nicht fit mit Bildbearbeitung sind oder mal keine Idee haben, eine gute Alternative. Besonders gut gefallen mir die Zitat-Sharepics mit und ohne Bild. Achte bei Bildern darauf, dass diese passend zugeschnitten sind. Du kannst dir auch eine Auswahl an Sharepics automatisiert über den Presse-/Social Grünerator erstellen. Dafür musst du dich vorher einloggen. Dann erscheint im Formate-Dropdown die Option Sharepic. Wähle „Automatisch\" oder eine gewünschte Variante und bekomme automatisiert Sharepics erstellt, die du mit Klick auf den Edit-Button bearbeiten kannst."
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Für mehr Barrierefreiheit",
    "anchor": "#für-mehr-barrierefreiheit",
    "category": "Archiv",
    "text": "Barrierefreiheit im Netz wird immer wichtiger, bleibt aber gleichzeitig für viele Ehrenamtliche schwer umzusetzen. Der Grünerator hilft dabei auf zwei Wegen: Alt-Texte und Leichte Sprache. Alt-Texte sind Textbeschreibungen für Bilder. Sie dienen dazu, dass Menschen mit Sehbehinderungen, die Screenreader nutzen, verstehen können, was auf einem Bild zu sehen ist. Leichte Sprache ist eine vereinfachte Form der deutschen Sprache. Sie verwendet kurze Sätze, einfache Wörter, verzichtet auf Fremdwörter und Fachbegriffe und nutzt eine klare Struktur. Leichte Sprache hilft zum Beispiel Menschen mit Behinderungen, Lernschwierigkeiten, kognitiven Einschränkungen oder Deutsch als Fremdsprache. Tipp: Nimm zunächst kurze Texte wie Präambeln oder Vorstellungen von Personen und gehe schrittweise vor. Beides kannst du im neuen Grünerator für Barrierefreiheit erstellen. Bei Grünerator Imagine und dem Sharepic-Grünerator gibt es außerdem direkt Buttons, die automatisiert Alt-Texte grünerieren. Die Texte sind nicht immer perfekt, aber schon nah an den Vorgaben."
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Neue, überarbeitete Grüneratoren",
    "anchor": "#neue-überarbeitete-grüneratoren",
    "category": "Archiv",
    "text": "Die Grüneratoren selbst haben ein massives Upgrade erhalten, unter anderem eine komplett überarbeitete Benutzeroberfläche. Im Grünerator für Anträge können nun auch kleine und große Anfragen erstellt werden. Für Abgeordnetenbüros und Fraktionen gibt es nun den Grünerator für Bürger*innenanfragen im Universal-Grünerator. Mit den neuen drei Icons in jedem Grünerator kannst du Webergebnisse oder Dateien in deine Texte einfügen. Außerdem kannst du mit dem „Privacy Mode\" erstmalig deutsche, von der Netzbegrünung gehostete KI-Server nutzen. Die sichere Alternative zu ChatGPT! Du kannst dich nun mit deinem Grünen Login einloggen. Klicke dazu oben rechts auf das Mensch-Icon. Das kann ich dir dringend empfehlen! Tust du dies, merkt sich der Grünerator deine letzten Gliederungen und Namen und kann diese jederzeit wieder einfügen. Außerdem kannst du dann den neuen, wunderschönen Editor verwenden und deinen Text per Chat korrigieren. Kein Markieren mehr notwendig. Auch der Export wurde verbessert. Grünerierte Texte kannst du unter anderem in die Textbegrünung teilen oder direkt als Word-Datei (docx) herunterladen."
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Profil & Custom Grüneratoren",
    "anchor": "#profil--custom-grüneratoren",
    "category": "Archiv",
    "text": "Klicke auf das Mensch-Icon oben rechts, logge dich mit deinem Partei-Account („Grünes Netz Login\") ein und erstelle ein individuelles Profil mit einem eigenen Roboter. Du kannst dann Anweisungen für Grüneratoren hinterlegen, die du häufig verwendest, etwa den Namen der Bürgermeisterin oder bestimmte Anpassungen für Pressemitteilungen. Experimentell: Verbinde die Wolke und lese Dateien aus oder exportiere grünerierte Texte direkt in einen Wolke-Ordner. Neu im Labor: Erstelle aus jedem beliebigen Prompt einen Grünerator. Mit Custom Grüneratoren kannst du jede Textart als „Grünerator\" erstellen, der genau so aussieht wie die bekannten Grüneratoren — nur mit deinen Anweisungen. Du kannst dir dein eigenes Eingabeformular für deine Arbeit bauen oder eine Kampagne erstellen, und diese mit allen Parteimitgliedern teilen. Links der Custom Grüneratoren sind öffentlich. Zukünftig können wir damit KI-assistierte Kampagnen in die gesamte Partei ausrollen — ohne teure Agenturen. Gehe zum Testen in dein Profil und wähle das Labor aus."
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Sicher, Europäisch, Grün",
    "anchor": "#sicher-europäisch-grün",
    "category": "Archiv",
    "text": "Alle deine Daten werden auf deutschen Servern der Netzbegrünung gespeichert und niemals an Dritte weitergegeben. Alle KI-Anfragen gehen auf europäische Server, Hauptanbieter ist Mistral aus Frankreich. Der Grünerator setzt auf führende Anbieter mit EU-Sitz, teilweise aus Deutschland, um die europäische Unabhängigkeit zu stärken. Grünerierungen werden niemals zum KI-Training verwendet und nach DSGVO-Standards verarbeitet. Also: Mit dem Grünerator bist du auf der richtigen Seite. Aber Achtung, der Grünerator wurde ehrenamtlich erstellt. In den kommenden Wochen können vermehrt Fehler bis hin zu Abstürzen auftreten. Nutze bitte so gut es geht den Support-Chat. Alternativ kannst du auf diese E-Mail antworten. Ich freue mich über jede noch so kleine Fehlermeldung, die hilft, den Grünerator zu verbessern. Zugegeben, das war viel Theorie. Probiere den Grünerator am besten einfach aus! Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband weiterleiten. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Stark verbesserter Reel-Grünerator",
    "anchor": "#stark-verbesserter-reel-grünerator",
    "category": "Archiv",
    "text": "Der Reel-Grünerator erstellt Untertitel jetzt endlich so, wie du sie haben willst: Kurz, mit verschiedenen Designs und ohne Qualitätsverlust. Außerdem werden deine Daten jetzt ausschließlich in Europa verarbeitet. Wenn du bisher keine so wirklich gute und schnelle Alternative zum Untertiteln von Reels und TikToks gefunden hast, probiere den neuen Reel-Grünerator aus."
  },
  {
    "url": "/docs/archiv/newsletter/2025-10-reimagined",
    "pageTitle": "Oktober 2025: Grünerator Reimagined",
    "heading": "Verändere Bilder. Und die Welt.",
    "anchor": "#verändere-bilder-und-die-welt",
    "category": "Archiv",
    "text": "Mit Grünerator Imagine kannst du die Welt so grünerieren, wie sie sein sollte: Mit mehr Radwegen, mehr Grün, mehr Lebensfreude. Nimm ein Bild aus deiner Straße oder einem grauen Platz in deiner Kommune, wähle die gewünschte Veränderung aus und zeig der Welt, wie deine Heimat auch aussehen könnte. Imagine macht es möglich! Du hast eine andere Idee? Wähle in Imagine den Universal-Modus aus und verändere, was immer du willst. Aber Vorsicht! KI-Bilder müssen gekennzeichnet werden. Hast du ein Bild mit Imagine verändert, klicke einfach auf den KI-Label Button und erstelle einen KI-Hinweis direkt auf dem Bild. Klingt kompliziert? Probier es einfach aus!"
  },
  {
    "url": "/docs/archiv/newsletter/2025-12-weihnachtszeit",
    "pageTitle": "Dezember 2025: Grünerator zur Weihnachtszeit",
    "heading": "Dezember 2025: Grünerator zur Weihnachtszeit",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter Dezember 2025 --- Hast du schon alle Weihnachtsgeschenke besorgt? Im privaten Stress kann es schnell mal untergehen, Weihnachtsgrüße für deinen Orts- oder Kreisverband zu erstellen. Aber keine Sorge: Dafür gibt's den Grünerator."
  },
  {
    "url": "/docs/archiv/newsletter/2025-12-weihnachtszeit",
    "pageTitle": "Dezember 2025: Grünerator zur Weihnachtszeit",
    "heading": "Neues Reel-Studio",
    "anchor": "#neues-reel-studio",
    "category": "Archiv",
    "text": "Das Interface zur Erstellung der Reels wurde überarbeitet und ist nun deutlich einfacher. Beim Abspielen von Videos wird automatisch das entsprechende Untertitel-Segment markiert, so dass du deine Untertitel innerhalb weniger Sekunden grünerieren kannst. Außerdem werden die letzten 20 Reels nun automatisch im neuen Grünerator Reel-Studio gespeichert. So kannst du Fehler jederzeit beheben. Mit der neuen Teilen-Funktion (experimentell) im Reel-Studio kannst du dein Reel als Datei mit anderen teilen. Sinnvoll zum Beispiel, wenn du Reels für deine*n Abgeordnete*n untertitelst oder jemand anderes die Social-Media-Kanäle betreut. Kein Qualitätsverlust über Signal, kein WeTransfer mehr notwendig. Bei Fragen oder Problemen wende dich gerne jederzeit an den Support-Chat. Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband weiterleiten. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2025-12-weihnachtszeit",
    "pageTitle": "Dezember 2025: Grünerator zur Weihnachtszeit",
    "heading": "Weihnachts-Grünerator",
    "anchor": "#weihnachts-grünerator",
    "category": "Archiv",
    "text": "Mit dem neuen Weihnachts-Grünerator gibt es eine einfache Möglichkeit, sich ein schönes Weihnachts-Sharepic zu erstellen. Der Grünerator erstellt ein 5-zeiliges Weihnachtsgedicht passend zu deinem Heimatort. Du kannst zwischen 6 Hintergründen wählen, bei Bedarf einen Instagram-Beitragstext erstellen und entweder das Bild herunterladen oder eine Canva-Vorlage aufrufen. Die Erstellung dauert nur wenige Sekunden. Die Grünerierung der Bilder nutzt einen speziellen Grünerator-Algorithmus, der klimaschonend auf unseren Servern arbeitet. Der Gruß-Text ist religionsneutral und kann bei Bedarf angepasst werden. Der Kampagnen-Grünerator kann jede beliebige Kampagne dieser Art umsetzen, auch für Landtags-, Kommunalwahlen & Co. Interesse, dies in deinem Landesverband zu verwenden? Schreib einfach eine E-Mail!"
  },
  {
    "url": "/docs/archiv/newsletter/2026-01-jahr-der-daten",
    "pageTitle": "Januar 2026: Jahr der Daten",
    "heading": "Januar 2026: Jahr der Daten",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter Januar 2026 --- Was hast du dir dieses Jahr vorgenommen? Mehr Sport, mehr Zeit für die Familie oder einfach weniger Stress? Für den Grünerator soll das kommende Jahr entscheidend werden. Und beginnt direkt besonders: Der Grünerator ist jetzt auch in Österreich verfügbar! Nun können knapp 200.000 Mitglieder aus zwei Ländern grüne, europäische KI verwenden. Außerdem arbeitet der Grünerator nun ausschließlich mit Anbieter*innen aus Europa. Mit jeder Grünerierung stärkst du damit die europäische Unabhängigkeit! Doch das war es noch lange nicht. Denn 2026 wollen wir eine der größten politischen Datenbanken Europas aufbauen. Das Jahr der Daten."
  },
  {
    "url": "/docs/archiv/newsletter/2026-01-jahr-der-daten",
    "pageTitle": "Januar 2026: Jahr der Daten",
    "heading": "Jetzt brauche ich dich",
    "anchor": "#jetzt-brauche-ich-dich",
    "category": "Archiv",
    "text": "Im Laufe des Jahres wird es eine Reihe von Beta-Tests geben, um die neuen Grünerator-Anwendungen sowie weitere Features zu prüfen. Wir wollen diese Tests strukturiert angehen und brauchen Feedback aus der Praxis – von dir. Außerdem wende ich mich in den kommenden Monaten nach und nach an die einzelnen Landesverbände, um den Plan für den Grünerator vorzustellen. Denn: Der Grünerator ist nach wie vor ein Freizeit-Projekt, wächst aber weiter. Und das wollen wir auf Dauer besser machen. Wenn du als Mitarbeiter*in einer Landesgeschäftsstelle, einer Landtagsfraktion oder eines Bundestagsbüros Interesse an einem gemeinsamen Gespräch hast, antworte gerne auf diese E-Mail. Bei Fragen oder Problemen wende dich gerne jederzeit an den Support-Chat. Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband weiterleiten. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2026-01-jahr-der-daten",
    "pageTitle": "Januar 2026: Jahr der Daten",
    "heading": "Warum so schnell?",
    "anchor": "#warum-so-schnell",
    "category": "Archiv",
    "text": "Die Demokratie wird weltweit angegriffen – von innen und außen. Will sie wehrhafter werden, muss sie schneller werden. Ich erinnere mich noch, wie wir bei den Grünen über TikTok gesprochen haben. Zurecht bemängelten wir Datenschutz, den Einfluss Chinas, Teile des Gesellschaftsbildes. Und dann? Fand TikTok ohne uns statt. Bei KI darf uns das nicht nochmal passieren. Das heißt nicht, dass wir KI blind verwenden – die Gefahr von KI-Bloat, der massive CO2-Ausstoß sind real. Aber während wir über das Wie diskutieren, brauchen wir die technischen Rahmenbedingungen, dann auch ins Machen zu kommen. Ich glaube, dass wir das schaffen können."
  },
  {
    "url": "/docs/archiv/newsletter/2026-01-jahr-der-daten",
    "pageTitle": "Januar 2026: Jahr der Daten",
    "heading": "Was heißt das?",
    "anchor": "#was-heißt-das",
    "category": "Archiv",
    "text": "KI ist nur so gut wie die Daten, mit denen sie gefüttert wird. Je besseren Kontext wir einem Sprachmodell geben, desto besser die Ergebnisse. Und das Gute ist: An den Inhalten mangelt es uns nicht. Auf den Webseiten des Bundesverbandes, der Landesverbände und der Fraktionen finden sich allerhand Informationen, die öffentlich verfügbar sind. Um diese für eine KI wie den Grünerator oder ChatGPT verfügbar zu machen, muss man die in ein bestimmtes Format bringen. Dann kann sich die KI zielgenau die Informationen raussuchen, die sie braucht. Und das wollen wir machen – in einem Jahr. Das Jahr der Daten."
  },
  {
    "url": "/docs/archiv/newsletter/2026-01-jahr-der-daten",
    "pageTitle": "Januar 2026: Jahr der Daten",
    "heading": "Wie machen wir das?",
    "anchor": "#wie-machen-wir-das",
    "category": "Archiv",
    "text": "Ich will für verschiedene Organisationen sogenannte „Notebooks\" erstellen. Notebooks speisen sich aus öffentlichen Daten: Ganze Webseiten von Fraktionen und Landesverbänden, Grünen Wikis, Beschlüssen etc. Jedes Notebook kann individuell durch den Grünerator abgerufen werden. Dafür habe ich ein neues Interface geschaffen, das aus den Dokumenten zitiert. Du kannst also ganz genau nachprüfen, ob das auch wirklich stimmt, was die KI erzählt. Zukünftig können wir alles Wissen unserer Partei per Klick verfügbar machen. Was haben wir auf der BDK beschlossen? Was steht im Wahlprogramm der Grünen in Schleswig-Holstein? Wie mache ich meine Heimatstadt zur Schwammstadt? Frag einfach den Grünerator. Wir schaffen dafür eine einheitliche Datenbank von maschinenlesbaren Daten aus öffentlichen Quellen unserer Partei. Diese liegen sicher bei der Netzbegrünung ab. Man kann sie dann über verschiedene Wege abrufen: Der Grünerator selbst soll im Laufe dieses Jahres Apps für alle Plattformen erhalten. Außerdem sollt ihr die Datenbank des Grünerators auch mit ChatGPT, Claude und Co verbinden können – über einen sogenannten „MCP-Server\". Die Datenbank ist über die Netzbegrünung zudem öffentlich, es…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-03-ki-chat-launch",
    "pageTitle": "März 2026: Grünerator Chat",
    "heading": "März 2026: Grünerator Chat",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter März 2026 --- Während du das hier liest, befinden sich die USA und Israel mit dem Iran in einer militärischen Auseinandersetzung. Eigentlich ist das kein Grund für einen Grünerator-Newsletter. Doch es gibt etwas, worüber wir reden müssen: KI-Systeme, etwa Claude von Anthropic, halfen bei der Vorbereitung der Angriffe. Immer mehr Menschen wünschen sich daher Alternativen. Ich ziehe daher den Launch eines Features vor. Dazu später mehr."
  },
  {
    "url": "/docs/archiv/newsletter/2026-03-ki-chat-launch",
    "pageTitle": "März 2026: Grünerator Chat",
    "heading": "Bug-Fixes und mehr",
    "anchor": "#bug-fixes-und-mehr",
    "category": "Archiv",
    "text": "Neben neuen Features wurde eine Reihe von Fehlern behoben: Fehler, die das Erstellen von Accounts unmöglich machten oder nach dem Login wieder das Login-Fenster zeigten. Reels wurden teils merkwürdig gedreht. Grünerierte Texte wurden unabsichtlich gespeichert und wiederverwendet. Dadurch wurden neue Texte teils sehr komisch. Zudem ist der Grünerator auf einen neuen Server umgezogen. Die Erstellung von Reels ist jetzt ca. doppelt so schnell und fühlt sich richtig gut an. Außerdem werden Texte nun gestreamt und erscheinen je nach Modell fast sofort. Probier es gerne aus! Bei Fragen oder Problemen wende dich gerne jederzeit an den Support-Chat (Deutschland) oder an das Helpdesk (Österreich). Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband versenden. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2026-03-ki-chat-launch",
    "pageTitle": "März 2026: Grünerator Chat",
    "heading": "Darf ich vorstellen? Chat!",
    "anchor": "#darf-ich-vorstellen-chat",
    "category": "Archiv",
    "text": "Deshalb veröffentliche ich heute den Grünerator Chat. Ein vollständiger KI-Chat — vergleichbar mit ChatGPT oder Claude — aber ausschließlich auf unseren europäischen Servern, ohne militärische Verträge, ohne Überwachung, ohne dass deine Daten zum Training verwendet werden. Was kann der Chat? Spezialisierte Assistenten für Anträge, Pressemitteilungen, Social Media, Reden und mehr — tippe dafür / im Eingabefeld. In der Regel erkennt der Grünerator diese aber automatisch. Grüne Quellen durchsuchen: Landesverbände, die ein Notebook gekauft haben, können mit @ (z.B. @Thueringen) direkt mit ihren Dokumenten chatten und damit z.B. Bürger*innenanfragen beantworten. Websuche für aktuelle Nachrichten und Fakten. Dateien hochladen — PDFs und Bilder als Kontext nutzen (experimentell). Quellenangaben mit Zitaten, die du nachprüfen kannst. Alles in einer Oberfläche, die du von ChatGPT kennst — nur grüner. Aber Achtung: Das Chat-Feature ist in der Beta-Phase. Es kann zu Fehlern kommen. Zudem braucht die UI hier und da noch Feinschliff. Bitte sichere wichtige Texte außerhalb des Grünerators, etwa indem du sie als Docx herunterlädst. Ich habe mich dazu entschieden, den Launch vorzuziehen, um ihn…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-03-ki-chat-launch",
    "pageTitle": "März 2026: Grünerator Chat",
    "heading": "Hintergrund: Was ist passiert?",
    "anchor": "#hintergrund-was-ist-passiert",
    "category": "Archiv",
    "text": "Das Pentagon — von der Trump-Regierung in „Department of War\" umbenannt — hat Rahmenverträge mit KI-Anbietern wie Anthropic, OpenAI, Google und xAI geschlossen. Ziel: KI in Waffenentwicklung, Geheimdienstarbeit und Gefechtsführung einzusetzen. Als Anthropic sich weigerte, seine roten Linien gegen autonome Waffen und Massenüberwachung aufzugeben, drohte das Pentagon, das Unternehmen als „Lieferkettenrisiko\" einzustufen — eine Kategorie, die sonst feindlichen Staaten vorbehalten ist. Und setzt dies nun um. OpenAI – die Firma hinter ChatGPT – sprang ein. OpenAI-Chef Sam Altman unterschrieb einen Deal, der dem Militär Zugang zu OpenAIs Modellen auf geheimen Netzen gewährt. Die roten Linien? Stehen im Vertrag. Ob sie durchgesetzt werden? Offen. Altman bezeichnete das Abkommen später als überhastet. Da war das Kind aber schon in den Brunnen gefallen. Und dann nutzten die USA KI-Systeme (ironischerweise von Anthropic) für den Angriff auf den Iran. Für was genau, dafür gibt es in US-Medien Vermutungen. Hunderte Mitarbeitende bei Google DeepMind und OpenAI haben in offenen Briefen dieselben roten Linien wie Anthropic gefordert: Nein zu Massenüberwachung, Nein zu autonomen Waffen ohne…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "April 2026: Das große Work-Update",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter April 2026 --- Wir müssen alle mehr arbeiten, heißt es. Wie es selten heißt: Wir müssen effizienter arbeiten. Aber warum eigentlich nicht? Mit einem KI-assistierten Arbeitsplatz können wir schneller und effizienter werden, ohne den Menschen zu ersetzen. Dafür veröffentliche ich heute das Work-Update. Der neue Grünerator Workplace ist präzise für Vorstandsarbeit, Kreis- und Landesgeschäftsstellen sowie kleine Abgeordnetenbüros erstellt worden. Ich habe versucht, die Workflows beim Erstellen von Pressemitteilungen, Social-Media-Posts und Anträgen so gut es geht nachzuempfinden."
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Chats: Klimaneutral und mehr",
    "anchor": "#chats-klimaneutral-und-mehr",
    "category": "Archiv",
    "text": "Ab sofort nutzen wir für den Grünerator-Chat und alle Notebooks ausschließlich Server mit erneuerbaren Energien und ohne Wasserkühlung. Dadurch sind alle Texte und Prozesse klimaneutral. Der Grünerator-Chat kann nun Boards und Dokumente erstellen und auslesen – das ist für mich der (zukünftige) Gamechanger. Ein möglicher Workflow könnte so aussehen: Person A erstellt mit dem Grünerator eine Pressemitteilung. Daraus wird ein Dokument generiert, das mithilfe der KI-Assistenz finalisiert wird. Das Dokument wird als Link oder über eine Gruppe an Person B weitergeleitet. Person B nutzt das Dokument (z. B. durch Zitieren mit @docs im Chat), um Social-Media-Posts zu erstellen, und fügt diese ins Dokument ein. Anschließend kann das Dokument mit einer Personengruppe C (z. B. einem Vorstand) geteilt werden, die Kommentare hinterlässt. All diese Funktionen befinden sich noch in einer sehr frühen Phase, und ich konnte viele Aspekte noch nicht ausführlich testen. Daher wird der komplette Workflow noch etwas Zeit benötigen. Aber genau so stelle ich mir die zukünftige Arbeit mit dem Grünerator vor."
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Grünerator Boards – Grünes Trello",
    "anchor": "#grünerator-boards--grünes-trello",
    "category": "Archiv",
    "text": "Womit ich nie so wirklich warm wurde, sind Trello-Boards. Da sie jedoch sehr beliebt sind, habe ich mir überlegt, wie man sie intelligent in den Grünerator integrieren kann. Herausgekommen sind die neuen Grünerator Boards. Sie funktionieren exakt wie jene Trello-Boards, sehen dabei jedoch großartig aus und können mit der Grünerator-KI erstellt werden. In den Boards können neben Kommentaren auch Dokumente aus Grünerator Docs zugeordnet werden. Außerdem arbeiten die Boards kollaborativ – dazu gleich mehr."
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Grünerator Docs – Grünes Google Docs",
    "anchor": "#grünerator-docs--grünes-google-docs",
    "category": "Archiv",
    "text": "Ich muss zugeben: Ich bin großer Fan von Google Docs. Die Einfachheit, gemeinsam mit anderen an Dokumenten zu arbeiten, fand ich immer großartig. Aber für Parteizwecke ein Google-Programm zu verwenden? Schwierig. Dafür veröffentliche ich endlich ein Feature, an dem ich schon länger arbeite: Grünerator Docs. Grünerator Docs ist ein KI-assistierter Dokumenteneditor, der ähnlich funktioniert wie Notion oder WordPress. Das Design ist clean und arbeitsfokussiert. Ihr könnt verschiedene Dokumententypen erstellen, von abhakbaren To-Do-Listen über Terminpläne bis hin zu Anträgen und Pressemitteilungen. Diese können anschließend geteilt werden, entweder nur für Parteimitglieder (hinter Login) oder öffentlich. Das Teilen von Dokumenten war relativ kompliziert zu programmieren; sollten hier Fehler auftreten, meldet euch gern! Docs basiert auf einer Open-Source-Software, die unter anderem von der deutschen und französischen Regierung getragen wird. Grünerator und Europa – das passt einfach."
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Gruppen und kollaboratives Arbeiten",
    "anchor": "#gruppen-und-kollaboratives-arbeiten",
    "category": "Archiv",
    "text": "Erstmals ermöglicht der Grünerator nun gemeinsames Arbeiten. Dafür starte ich ein neues Feature: Gruppen. Diese funktionieren einladungsbasiert und dienen als zentraler Content-Hub für die Zusammenarbeit in eurer Geschäftsstelle, eurem Vorstand oder eurem Social-Media-Team. In Gruppen können Boards, Dokumente, Grüneratoren, Notebooks und Links geteilt sowie Boards und Dokumente gemeinsam bearbeitet werden. Aktuell können nur Admins Inhalte in Gruppen einpflegen – das ist zunächst so gewollt, ich passe es aber ggf. später an. Meiner Meinung nach kann dies ein echter Meilenstein für die gemeinsame, KI-assistierte Arbeit werden. Allerdings braucht es noch etwas Zeit, da kollaborative Features extrem schwer zu testen und zu debuggen sind. Dafür brauche ich jetzt deine Hilfe! Dort habe ich einige Dokumente und Boards hinterlegt, die du austesten kannst. Melde dich gern, wenn du dabei sein möchtest."
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Lieber schlecht kopiert als gut selbst gemacht",
    "anchor": "#lieber-schlecht-kopiert-als-gut-selbst-gemacht",
    "category": "Archiv",
    "text": "Dachte sich die FDP Bayern und hat den Grünerator, wie er früher war, kopiert und „Liberator\" getauft. Mit denselben Textformen, denselben Überschriften, denselben Design-Elementen sowie einer teils falsch übernommenen Datenschutzerklärung. Heißt es nicht, die größte Ehre ist es, kopiert zu werden? Danke an Solveigh fürs Melden. Der Grünerator wurde zudem von der Bundestagsfraktion im Spiegel erwähnt. --- Der Grünerator befindet sich derzeit in besonders aktiver Entwicklung. Es können vermehrt Fehler auftreten. Hierbei brauche ich deine Unterstützung. Bei Fragen oder Problemen, insbesondere beim Login, wende dich gerne jederzeit an den Support-Chat (Deutschland) oder an das Helpdesk (Österreich). Du kannst diesen Newsletter gerne in deinem Orts- oder Kreisverband versenden. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Neue und verbesserte Notebooks",
    "anchor": "#neue-und-verbesserte-notebooks",
    "category": "Archiv",
    "text": "Ich arbeite daran, die Notebooks weiter zu verbessern. In manchen Notebooks kann nun direkt in den Quellen recherchiert werden, sodass Inhalte besser überprüft werden können: Wurde der gesamte Kontext beachtet? Hat der Grünerator etwas übersehen? Zudem wurden eine Reihe kleinerer Verbesserungen umgesetzt, wodurch die Notebooks nun ansprechender aussehen und schneller laden. Leider ist dadurch ein neuer Fehler aufgetreten, der insbesondere bei längeren Texten zu einem Flickern beim Laden führt. In seltenen Fällen kann es auch vorkommen, dass der Grünerator Zahlen falsch interpretiert. Aber: Mittlerweile sind über 10.000 Dokumente im Grünerator hinterlegt! Um diese aktuell zu halten, habe ich ein spezielles, noch experimentelles Tool entwickelt. Dieses durchsucht einmal pro Stunde automatisch die Websites der jeweiligen Landesverbände und fügt neue Texte in den Grünerator ein. Das Ziel ist, die Datenbank schnell zu erweitern – ohne zusätzlichen Personalaufwand. So bleibt der Grünerator selbst in Wahlkampfzeiten stets auf dem neuesten Stand."
  },
  {
    "url": "/docs/archiv/newsletter/2026-04-work-update",
    "pageTitle": "April 2026: Das große Work-Update",
    "heading": "Tools, Tools, Tools",
    "anchor": "#tools-tools-tools",
    "category": "Archiv",
    "text": "Auf der runderneuerten Startseite finden sich eine Reihe neuer, experimenteller Tools: Scanner: Macht Texte digital lesbar – auch handgeschriebene! Wer Protokolle lieber auf Papier schreibt, kann sie mit dem Grünerator in bearbeitbaren Text umwandeln. Transkribierer: Erstellt Protokolle aus aufgezeichneten Meetings – inklusive Sprecher*innenerkennung, falls gewünscht. Grünerator Connect: Verbindet den Grünerator mit ChatGPT, Claude, Le Chat, OpenWebUI & Co. und ermöglicht die Nutzung der Grünerator-Daten in eurer (Zweit-)liebsten Chat-App. Neue Websuche: Jetzt als Perplexity-ähnlicher Chat verfügbar."
  },
  {
    "url": "/docs/archiv/newsletter/2026-05-erstelle-dein-notebook",
    "pageTitle": "Mai 2026: Das Notebook-Update",
    "heading": "Mai 2026: Das Notebook-Update",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter Mai 2026 --- Hallo zusammen, ab sofort kannst du im Grünerator deine eigenen Notebooks erstellen – mit eigenen Quellen, eigenen Fragen, eigenen Antworten. Ein Notebook ist im Grunde dein persönliches Archiv: Du wirfst Dokumente rein, und der Grünerator beantwortet deine Fragen ausschließlich auf Basis dieser Dokumente – mit nachprüfbaren Quellenangaben. Lade einfach Dokumente hoch, verbinde einen Ordner aus der Grünen Wolke oder importiere eigene Grünerator Docs als Quelle. Offen gesagt: Ich glaube, Notebooks können die Art und Weise, wie wir Parteiarbeit machen, für immer verändern. Wissen wird durchsuchbar und verständlich wie nie. Um dieses Feature dauerhaft für uns als Basis kostenfrei und unbegrenzt verfügbar zu machen, können sich Landesverbände (in Österreich der Bundesverband) spezielle Notebooks einkaufen, die über 1.000 Dokumente beinhalten, die sich automatisiert aus den öffentlichen Beschlüssen und Pressemitteilungen speisen. Cool, oder? Die bestehenden Notebooks findest du online. Wenn das für deinen Landesverband interessant ist, melde dich gern! Um ein Notebook zu erstellen, klicke unten auf Zu den Notebooks und dann rechts bei „Eigene\" auf das Plus-Icon.…"
  },
  {
    "url": "/docs/archiv/newsletter/2026-05-erstelle-dein-notebook",
    "pageTitle": "Mai 2026: Das Notebook-Update",
    "heading": "Bilder erstellen und bearbeiten",
    "anchor": "#bilder-erstellen-und-bearbeiten",
    "category": "Archiv",
    "text": "Insbesondere in Österreich gibt es den Wunsch, mehr mit KI-Bildbearbeitung zu arbeiten. Ich habe daher die Bild-Features auf der Startseite verbessert. Wer lieber direkt aus dem Chat heraus arbeitet, findet die gleichen Werkzeuge auch dort. Außerdem könnt ihr mehr Modelle auswählen, unter anderem mit Flux Max noch bessere Ergebnisse erzielen (verbraucht 2 Bilder statt eines). Die Bildwerkzeuge sind teilweise noch experimentell – sie werden aber stetig weiterentwickelt. Ein interessantes Beispiel siehst du unten. Wenn dir etwas fehlt, schreib mir gern. (Lieber Robert, wenn du das siehst: Die KI ist schuld!)"
  },
  {
    "url": "/docs/archiv/newsletter/2026-05-erstelle-dein-notebook",
    "pageTitle": "Mai 2026: Das Notebook-Update",
    "heading": "Jetzt brauche ich deine Hilfe",
    "anchor": "#jetzt-brauche-ich-deine-hilfe",
    "category": "Archiv",
    "text": "Viele dieser Features waren Wünsche aus den Landesverbänden, Landesarbeitsgemeinschaften, aus Webinaren und von Zuschriften von Mitgliedern wie dir. Jetzt brauche ich deine Hilfe: Der Grünerator befindet sich derzeit in besonders aktiver Entwicklung. Es können zwischendurch Fehler auftreten. Dabei zählt jede Rückmeldung. --- Bei Fragen oder Problemen, insbesondere beim Login, wende dich gerne jederzeit an den Support-Chat (Deutschland) oder an das Helpdesk (Österreich). Du kannst diesen Newsletter gerne weiterleiten, etwa in deinem Orts- oder Kreisverband. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2026-05-erstelle-dein-notebook",
    "pageTitle": "Mai 2026: Das Notebook-Update",
    "heading": "Neue Agents, besserer Chat",
    "anchor": "#neue-agents-besserer-chat",
    "category": "Archiv",
    "text": "Im Chat sind mehrere neue Spezialist*innen dazugekommen: Der Öffentlichkeitsarbeit-Agent hilft dir bei Pressemitteilungen, Social-Media-Posts und Statements. Der neue Kommunalpolitik-Assistent unterstützt dich bei allem, was im kommunalpolitischen Alltag anfällt – von Anträgen über Bürger*innenanfragen bis hin zu Reden. Neu ist auch der „Tweet-wie-Ricarda\"-Agent (nur de): Er formuliert Tweets im Stil von Ricarda Lang, basierend auf echten Beispielen. Damit lässt sich gut ausprobieren, was mit personalisierten Agents im Grünerator möglich ist. Auch bei den Quellen hat sich einiges getan: Mit @wolke hängst du Dateien aus der Grünen Wolke direkt in den Chat (Wolke vorher im Profil verbinden). Mit @recherche startest du eine tiefe Websuche – das Ergebnis erscheint als ausklappbare Recherche-Karte. Außerdem stehen neue Sprachmodelle zur Auswahl, darunter ein neues, sehr gutes Mistral-Modell aus Frankreich. Welches Modell genutzt wird, kannst du im Profil einstellen – oder du lässt den Grünerator entscheiden."
  },
  {
    "url": "/docs/archiv/newsletter/2026-05-erstelle-dein-notebook",
    "pageTitle": "Mai 2026: Das Notebook-Update",
    "heading": "Neuer Dokumenten-Chat",
    "anchor": "#neuer-dokumenten-chat",
    "category": "Archiv",
    "text": "Jedes Grünerator-Dokument hat jetzt einen eigenen Chat. Du kannst die KI Fragen zu deinem Text stellen, dir Vorschläge geben lassen oder den Text gemeinsam mit ihr weiterschreiben. Wer will, aktiviert den Toggle „AN\" – dann schreibt die KI direkt ins Dokument, du behältst aber die Kontrolle und kannst Änderungen ablehnen. Außerdem kannst du Text markieren und präzise mit KI verändern. Oder tippe / im Dokument und schreibe „KI\" und lass dir von KI den Text weiterschreiben. Probier es unbedingt aus und gib mir Feedback. Ich bin von den KI-Features schon sehr überzeugt. Und wer lieber spricht: Im Editor kannst du jetzt auch direkt diktieren."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Juli 2026: Der XXL-Testsommer",
    "anchor": "",
    "category": "Archiv",
    "text": "Newsletter Juli 2026 --- Hallo \\ , normalerweise stelle ich dir ein neues Feature vor. Heute sind es gleich vier – und alle auf einmal. In den letzten Wochen sind die größten Neuerungen entstanden, die der Grünerator je hatte: ein grünes Canva für Sharepics, zwei neue Dokumententypen – Tabellen und Präsentationen, selbstgebaute Agent*innen und der Grünerator als App für den Mac. Jedes davon ist neu, spannend – und ehrlich gesagt noch nicht perfekt. Sie erzählen aber eine gemeinsame Geschichte: Aus vielen einzelnen Grüneratoren wird langsam ein zusammenhängender Arbeitsplatz. Ein Studio für alle Bilder, eine Docs-Familie für Text, Tabellen und Folien, eine Agentura für deine Assistent*innen – überall, auf jedem Gerät. Deshalb mache ich es diesen Sommer anders. Statt alles still zu veröffentlichen, lade ich dich zum XXL-Testsommer ein. Vier Teststrecken, eine Bitte: Probier aus, was dich interessiert, und sag mir, was hakt. Nur so wird bis zum Herbst alles rund. Los geht's."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Die Apps: neu auf dem Mac, besser auf dem Handy",
    "anchor": "#die-apps-neu-auf-dem-mac-besser-auf-dem-handy",
    "category": "Archiv",
    "text": "Der Grünerator zieht aus dem Browser aufs Gerät. Ganz neu ist eine echte Mac-App – signiert und notarisiert, also ohne die lästige „unbekannter Entwickler\"-Warnung. Den Download (Beta) findest du eingeloggt unter gruenerator.eu/apps, inklusive automatischer Updates. Und die mobilen Apps für Android und iOS haben einen großen Sprung gemacht: Die Notebook-Ansicht ist nun auf Augenhöhe mit der Web-Version – mit Landesverbands-Agenten, Statistiken und nachprüfbaren Quellenangaben direkt im mobilen Chat. Wenn du bei einer oder mehreren Teststrecken mitmachen willst, antworte einfach auf diese E-Mail. Ich sammle Rückmeldungen gebündelt und melde mich, wenn es etwas Neues zum Testen gibt."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Grüne Agent*innen – auch in den Boards",
    "anchor": "#grüne-agentinnen--auch-in-den-boards",
    "category": "Archiv",
    "text": "Der Agenten-Baukasten ist jetzt für alle freigeschaltet. Du kannst dir deine eigenen Spezialist*innen bauen – ganz ohne Vorkenntnisse. Beschreibe im Gespräch, was dein Agent können soll, und der Grünerator erstellt einen Entwurf, den du anpasst: eigene Werkzeuge, eigener Ton und gleich mehrere Notebooks als Wissensquelle. Entdecken kannst du alle Agent*innen und Skills in der neuen Agentura. Richtig spannend wird es in den Boards: Dort kannst du Aufgaben an Agenten delegieren. Schreib @Grünerator in einen Kartenkommentar (oder wähle einen bestimmten Agenten aus), und die Aufgabe wird im Hintergrund erledigt – das Ergebnis landet als Dokument direkt an der Karte. Mit den neuen Grünerator-Spalten baust du dir sogar kleine Abläufe: Quelle → KI-Schritt → Ergebnis, die sich auf Wunsch zeitgesteuert wiederholen. So arbeitet der Grünerator mit, während du an etwas anderem sitzt. Die KI-Funktionen der Boards (Assistent, Delegation, Grünerator-Spalten) sind bewusst im Expert*innenmodus versteckt, damit Boards für alle anderen schlicht bleiben. Schalte ihn in deinem Profil an – dann tauchen sie auf."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Jetzt brauche ich deine Hilfe",
    "anchor": "#jetzt-brauche-ich-deine-hilfe",
    "category": "Archiv",
    "text": "Ich sage es offen: Vier so große Features gleichzeitig, das ist ambitioniert. Es wird Fehler geben, manche Kombination habe ich schlicht noch nicht durchtesten können. Genau dafür ist der Testsommer da. Sichere wichtige Inhalte bitte zwischendurch außerhalb des Grünerators, und schreib mir, wo es klemmt. Jede Rückmeldung fließt direkt in die Weiterentwicklung ein. --- Bei Fragen oder Problemen, insbesondere beim Login, wende dich gerne jederzeit an den Support-Chat (Deutschland) oder an das Helpdesk (Österreich). Du kannst diesen Newsletter gerne weiterleiten, etwa in deinem Orts- oder Kreisverband. Interessierte können sich jederzeit unter fax.gruenerator.de anmelden. Viel Spaß beim Grünerieren! Moritz"
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Sharepics: unser grünes Canva",
    "anchor": "#sharepics-unser-grünes-canva",
    "category": "Archiv",
    "text": "Fangen wir mit dem an, was am meisten Spaß macht: Sharepics erstellst du jetzt komfortabel online – quasi ein kleines, grünes Canva. Auf der Studio-Seite findest du Vorlagen und Werkzeuge, um Bilder zu gestalten, zu bearbeiten und zu beschriften. Das Studio ist noch eine frühe Vorschau – genau der richtige Moment, um mitzugestalten. Am meisten freut mich der durchgängige Ablauf vom Chat ins Studio: Du lässt dir im Chat ein Sharepic grünerieren und öffnest es dann mit einem Klick im Studio zum Feinschliff. Fertige Sharepics kannst du außerdem als Grünerator-Vorlage veröffentlichen, damit andere aus der Basis sie nutzen können. Neu ist auch ein kombiniertes Werkzeug, das dir in einem Rutsch einen Social-Media-Text und das passende Sharepic erstellt. Ideal für den schnellen Post zwischendurch."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Und sonst?",
    "anchor": "#und-sonst",
    "category": "Archiv",
    "text": "Neben den vier großen Baustellen ist noch mehr passiert: Rechnen im Chat: Der Chat kann jetzt echte Berechnungen anstellen – von einfacher Mathematik über Statistik bis zu Diagrammen. Grundlage für die Tabellen-Auswertung. Neue Wissensquellen: Mit dem Bundestag und Abgeordnetenwatch kannst du jetzt direkt im Chat transparente, offizielle Daten recherchieren (zunächst für Deutschland)."
  },
  {
    "url": "/docs/archiv/newsletter/2026-07-xxl-testsommer",
    "pageTitle": "Juli 2026: Der XXL-Testsommer",
    "heading": "Zwei neue Dokumente: Tabellen & Präsentationen",
    "anchor": "#zwei-neue-dokumente-tabellen--präsentationen",
    "category": "Archiv",
    "text": "Die Grünerator Docs haben zwei neue Geschwister bekommen: Tabellen und Präsentationen. Beide funktionieren wie die bekannten Dokumente – kollaborativ, in Echtzeit, mit einer KI-Seitenleiste direkt im Editor. Du legst sie als neues Dokument an oder erstellst sie direkt aus dem Chat. Tabellen funktionieren wie Google Sheets oder Excel, nur grün und auf europäischen Servern. Die KI-Seitenleiste hilft dir beim Bauen: Du sagst, was du brauchst – „füge eine Spalte mit dem Datum hinzu\", „fasse die Zahlen zusammen\" – die KI plant die Änderung, und du bestätigst sie mit einem Klick. Zeilen einfügen, Zellen verbinden, Diagramme direkt in der Tabelle und bestehende .xlsx- oder .csv-Dateien importieren: alles dabei. Und weil der Chat nun auch echt rechnen kann, wertet er dir ganze Tabellen aus – lade eine Datei hoch und frag drauflos. Präsentationen sind Foliendecks, die ihr gemeinsam bearbeitet. Bitte die KI im Chat um eine Präsentation zu einem Thema, verfeinere sie im Editor und führe sie im Präsentationsmodus direkt vor. Wer die Folien woanders braucht: Es gibt einen PowerPoint-Export (PPTX), der sich sauber in PowerPoint oder Keynote öffnen lässt."
  },
  {
    "url": "/docs/archiv/signal-nachrichten/2026-05-erstelle-dein-notebook",
    "pageTitle": "Mai 2026: Das Notebook-Update",
    "heading": "Mai 2026: Das Notebook-Update",
    "anchor": "",
    "category": "Archiv",
    "text": "Verschickt am 19. Mai 2026 als Signal-Broadcast · Kurzfassung zum Newsletter Mai 2026. --- Die Karte unten zeigt die Nachricht, wie sie in Signal-Gruppen verschickt wurde — in ihr-Form, weil Signal mehrere Leute gleichzeitig erreicht. Mit einem Klick auf „Für Signal kopieren\" landet der Text in der Zwischenablage: Links als reine URL, Genderstern als Doppelpunkt, Fett wird weggelassen (Signal rendert keine Markdown-Sternchen) — wenn du Fett brauchst, einfach im Chat manuell setzen. Das Bild lädst du mit dem zweiten Button herunter und hängst es in Signal an. Hallo zusammen, ab sofort könnt ihr im Grünerator eure eigenen Notebooks erstellen – mit eigenen Quellen, eigenen Fragen, eigenen Antworten. Ein Notebook ist euer persönliches Archiv: Ihr werft Dokumente rein, und der Grünerator beantwortet eure Fragen ausschließlich auf Basis dieser Dokumente – mit nachprüfbaren Quellenangaben. Offen gesagt: Ich glaube, Notebooks können die Art und Weise, wie wir Parteiarbeit machen, für immer verändern. Wissen wird durchsuchbar wie nie. Damit das Feature für die Basis kostenfrei bleibt, können sich Landesverbände (in Österreich der Bundesverband) spezielle Notebooks mit über 1.000 Dokumenten…"
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Barrierefreiheit",
    "anchor": "",
    "category": "Basics",
    "text": "Diese Seite sagt, wie barrierefrei der Grünerator heute ist — einschließlich der Stellen, an denen er es noch nicht ist. Eine geschönte Liste hilft niemandem: Wer auf eine Barriere stößt, die hier nicht steht, verliert Zeit mit der Frage, ob es an ihm liegt. Stand: 13. August 2026."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Der aktuelle Stand: teilweise konform",
    "anchor": "#der-aktuelle-stand-teilweise-konform",
    "category": "Basics",
    "text": "Behoben und nachgemessen sind unter anderem: Die eingeklappte Hauptnavigation. Sie war mit Screenreader unbenutzbar — die Beschriftungen der Knöpfe waren nicht nur unsichtbar, sondern vollständig aus der Vorlesereihenfolge entfernt. Das war mit Abstand die schwerste Barriere. Die Tastaturfalle im Untertitel-Werkzeug. Die Tabulatortaste kam aus der Segmentliste nicht mehr heraus. Jetzt wechseln die Pfeiltasten das Segment, und Tab bleibt Tab. Aufgabenkarten auf Boards haben einen echten Ziehgriff, der per Tastatur bedienbar ist. Ziehen mit der Maus funktioniert weiter auf der ganzen Karte. Weißer Text auf den Markenfarben erreichte den geforderten Kontrast nicht. Das betraf den Marken-Button und alle Abzeichen in Eukalyptus-Grün. Graue Textstufen erreichen jetzt in hellem wie dunklem Modus die geforderten 4,5:1. Die Initialen im Avatar (sichtbar, solange kein Bild hinterlegt ist) standen weiß auf einem Grün mit 3,73:1. Sie erreichen jetzt 7,24:1. Rund 300 Bedienelemente der Mobil-App hatten keinen vorlesbaren Namen — mit Screenreader hörte man nur „Schaltfläche\", ohne zu erfahren, welche. Alle haben jetzt einen."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Eine Barriere melden",
    "anchor": "#eine-barriere-melden",
    "category": "Basics",
    "text": "Wenn dir etwas begegnet, das dich blockiert — auch wenn es hier schon steht: 📧 info@moritz-waechter.de Hilfreich ist: welche Seite, was du tun wolltest, und womit du arbeitest (Browser, Screenreader, Vergrößerung). Wir antworten innerhalb von zwei Wochen. Wenn eine Barriere nicht schnell zu beheben ist, sagen wir, wie wir sie umgehen können, solange sie besteht."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Einstellungen, die du selbst setzen kannst",
    "anchor": "#einstellungen-die-du-selbst-setzen-kannst",
    "category": "Basics",
    "text": "Unter Einstellungen → Datenschutz & Barrierefreiheit, im unteren Abschnitt Barrierefreiheit: Einstellung | Wirkung | ------------------------------------ | ------------------------------------------- | Animationen reduzieren | Bewegung und Übergänge werden abgeschaltet. | Transparenz und Unschärfe reduzieren | Durchscheinende Flächen werden deckend. | Hellen und dunklen Modus stellst du unter Einstellungen → Allgemein ein; der Grünerator folgt sonst der Einstellung deines Systems."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Rechtlicher Status dieser Seite",
    "anchor": "#rechtlicher-status-dieser-seite",
    "category": "Basics",
    "text": "Diese Seite ist eine freiwillige Selbstauskunft, keine Erklärung zur Barrierefreiheit im Rechtssinn. Ob der Grünerator unter das deutsche Barrierefreiheitsstärkungsgesetz (BFSG) oder das österreichische Barrierefreiheitsgesetz (BaFG) fällt, ist noch nicht abschließend geklärt. Sobald das feststeht, wird diese Seite entsprechend umgestellt — mit den Bestandteilen, die dann verbindlich dazugehören. Wir sagen das ausdrücklich, weil eine falsche Konformitätsaussage schlechter wäre als keine."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Screenreader",
    "anchor": "#screenreader",
    "category": "Basics",
    "text": "Wir haben die Oberfläche gegen ihren berechneten Accessibility-Tree geprüft, aber noch keinen vollständigen Durchlauf mit NVDA, JAWS oder VoiceOver gemacht. Automatische Prüfwerkzeuge finden erfahrungsgemäß nur 30 bis 40 Prozent der Barrieren; alles, was von Formulierung, Reihenfolge und Verständlichkeit abhängt, sehen sie nicht. Wir sagen deshalb ausdrücklich nicht zu, dass der Grünerator mit Screenreader gut bedienbar ist."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Tastaturbedienung",
    "anchor": "#tastaturbedienung",
    "category": "Basics",
    "text": "Der Grünerator ist mit der Tastatur bedienbar. Mit Tab wanderst du vorwärts durch die Bedienelemente, mit Umschalt+Tab zurück, Enter und Leertaste lösen aus, Escape schließt Dialoge. In Listen mit vielen gleichartigen Einträgen — etwa den Segmenten im Untertitel-Werkzeug — wechseln die Pfeiltasten innerhalb der Liste; Tab führt aus der Liste heraus."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Was noch nicht erfüllt ist",
    "anchor": "#was-noch-nicht-erfüllt-ist",
    "category": "Basics",
    "text": "Statusmeldungen werden kaum angesagt. Wenn eine Chat-Antwort beginnt oder endet, ein Werkzeug arbeitet, ein Upload fertig wird oder ein Formular einen Fehler meldet, erfährt ein Screenreader das in den meisten Fällen nicht. Das ist derzeit die größte offene Lücke. Videos haben keine Untertitelspur. Der Grünerator kann Untertitel erzeugen, verlangt sie aber bei eingebetteten Videos nicht. Einzelne Farbpaare liegen weiter unter dem geforderten Wert — bekannt ist ein Blau-auf-Blau-Paar im Bereich Projekte. Die Seitenstruktur ist uneinheitlich. Nicht jede Seite kennzeichnet ihren Hauptbereich und ihre Navigationsleisten so, dass ein Screenreader direkt dorthin springen kann. Die Mobil-App ist nicht auf einem Gerät geprüft. Die Namen der Bedienelemente sind gesetzt, aber Kontrast, Reihenfolge beim Durchtippen und die tatsächlichen Ansagen von VoiceOver und TalkBack sind ungeprüft. Nicht gemessen wurden bisher: die veröffentlichten Kandidat:innen-Seiten, die Desktop-App und diese Dokumentationsseite selbst."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Was wir anstreben",
    "anchor": "#was-wir-anstreben",
    "category": "Basics",
    "text": "Zielstandard ist WCAG 2.2, Konformitätsstufe AA, im Rahmen der europäischen Norm EN 301 549. Diese Norm haben wir gewählt, weil sie als einzige auch die Mobil-App abdeckt — WCAG allein gilt für Webseiten."
  },
  {
    "url": "/docs/basics/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Wie geprüft wurde",
    "anchor": "#wie-geprüft-wurde",
    "category": "Basics",
    "text": "Selbstbewertung, kein externer Test. Konkret: axe-core über 13 Routen der Web-Oberfläche — die Einstiegsseiten der Hauptbereiche — sowie über die Plusmenü-Überlagerung in zwei Fensterbreiten, jede davon in hellem und dunklem Modus. Zuletzt am 13. August 2026. ESLint-Regelsätze (jsx-a11y für das Web, react-native-a11y für die Mobil-App) laufen bei jeder Änderung mit. Komponententests mit axe an den Stellen, an denen ARIA von Hand gesetzt wird. Ein BITV-Test durch eine unabhängige Prüfstelle hat nicht stattgefunden."
  },
  {
    "url": "/docs/basics/gruenerator-pro-eu",
    "pageTitle": "Grünerator Pro-EU",
    "heading": "Politische Kommunikation gehört in europäische Hände",
    "anchor": "#politische-kommunikation-gehört-in-europäische-hände",
    "category": "Basics",
    "text": "Wenn Parteien, Abgeordnete und Ehrenamtliche KI-Werkzeuge nutzen, fließen politische Inhalte durch fremde Infrastruktur – Kampagnentexte, Pressemitteilungen, interne Strategien. Bei den meisten KI-Tools landen diese Daten auf US-Servern, verarbeitet von Unternehmen, die weder europäischem Recht noch demokratischer Kontrolle unterliegen. Der Grünerator ist die souveräne Alternative: 100% europäische Infrastruktur, 100% europäische Anbieter, 100% europäische Ausgaben. Deine politische Arbeit verlässt niemals die EU – egal ob Text, Bild, Sprache oder Suche."
  },
  {
    "url": "/docs/basics/gruenerator-pro-eu",
    "pageTitle": "Grünerator Pro-EU",
    "heading": "Unsere europäischen Partner",
    "anchor": "#unsere-europäischen-partner",
    "category": "Basics",
    "text": "Mistral AI (Frankreich) — Standardmodell Mistral Medium 3.5 (mistral-medium-2604), Bildverstehen mit Pixtral Large, Suche und Notebooks mit mistral-embed, Transkription mit Voxtral KugelAudio (Berlin, Deutschland) — Sprachausgabe mit kugel-3: das Vorlesen von Antworten und die Stimme im Sprachdialog, ausschließlich über den EU-Endpunkt api.eu.kugelaudio.com. Seit September 2026 anstelle von Mistral Speech. Keine dauerhafte Speicherung der Inhalte, kein Training; jede erzeugte Audiodatei trägt ein Wasserzeichen nach Art. 50 KI-VO Black Forest Labs (Freiburg, Deutschland) — Bilderzeugung und -bearbeitung mit FLUX 2 Pro (flux-2-pro), ausschließlich über den EU-Endpunkt api.eu.bfl.ai Cortecs (Vermittler, EU) — vermittelt Gemma 4 (gemma-4-31b-it) an Infercom SCS (Luxemburg, Verarbeitung in Deutschland). Seit August 2026 das Modell, das die meisten Chat-Antworten und fertigen Texte schreibt sowie lange Dokumente zusammenfasst. Cortecs bekommt bei jeder Anfrage die Weisung, nur in der EU ansässige Anbieter mit Zero Data Retention einzusetzen; welcher Anbieter tatsächlich gerechnet hat, steht in jeder Antwort und wird protokolliert Regolo / Seeweb (Italien) — Open-Source-Modelle (GPT-OSS…"
  },
  {
    "url": "/docs/basics/intro",
    "pageTitle": "Grünerator – die Grüne KI",
    "heading": "Grünerator – die Grüne KI",
    "anchor": "",
    "category": "Basics",
    "text": "Der Grünerator ist ein speziell für Bündnis 90/Die Grünen entwickeltes KI-Tool. Er erstellt Texte wie Pressemitteilungen, Social-Media-Beiträge, Anträge für kommunale Parlamente und viele weitere. Außerdem kann er Sharepics \"grünerieren\" und beim Erstellen von Untertiteln helfen."
  },
  {
    "url": "/docs/basics/intro",
    "pageTitle": "Grünerator – die Grüne KI",
    "heading": "Datenschutz per Design",
    "anchor": "#datenschutz-per-design",
    "category": "Basics",
    "text": "Anders als andere Seiten trackt der Grünerator nicht und kann völlig anonym verwendet werden. Er verwendet ausschließlich EU-Server zur Verarbeitung der KI-Eingaben und bietet mit selbst gehosteten Open-Source-Modellen zusätzliche Datensouveränität. Der Grünerator setzt dabei bewusst auf europäische Technologieanbieter wie Mistral AI (Frankreich) und Black Forest Labs (Deutschland), um die digitale Souveränität Europas zu stärken."
  },
  {
    "url": "/docs/basics/intro",
    "pageTitle": "Grünerator – die Grüne KI",
    "heading": "Denkt und spricht Grün",
    "anchor": "#denkt-und-spricht-grün",
    "category": "Basics",
    "text": "Der Grünerator wurde anhand grüner Sprache antrainiert. Wenn er einen Beitrag für Instagram oder eine Pressemitteilung erstellt, klingt dieser grün und fühlt sich grün an."
  },
  {
    "url": "/docs/basics/intro",
    "pageTitle": "Grünerator – die Grüne KI",
    "heading": "Einfache UI & modernste Technik",
    "anchor": "#einfache-ui--modernste-technik",
    "category": "Basics",
    "text": "Der Grünerator verwendet eine stark vereinfachte Benutzeroberfläche, die fast jede:r auf Anhieb versteht. Er wurde so designt, dass er von allen Ehrenamtlichen aller Altersklassen verwendet werden kann. Die UI orientiert sich stark an Seiten, die die Nutzer:innen kennen und lieben. Er nutzt modernste KI-Modelle – du kannst zwischen mehreren KI-Modellen wählen, vom europäischen Mistral AI bis zu vollständig selbst gehosteten Open-Source-Modellen. Standardmäßig wählt der Grünerator automatisch das passende Modell für deine Aufgabe."
  },
  {
    "url": "/docs/basics/intro",
    "pageTitle": "Grünerator – die Grüne KI",
    "heading": "Mit Herz für Open-Source",
    "anchor": "#mit-herz-für-open-source",
    "category": "Basics",
    "text": "Der Grünerator wurde auf Basis von Open-Source-Software entwickelt und liegt auf den Servern der Netzbegrünung. Die netzbegrünung ist ein Verein für grüne Netzkultur e.V., der sich seit 2006 für die Förderung der Demokratie im digitalen Raum und eine nachhaltige digitale Infrastruktur einsetzt. Mit über 500 Mitgliedern aus Deutschland und Österreich entwickelt die netzbegrünung innovative digitale Lösungen und vermittelt Fachwissen zu digitalpolitischen Inhalten. Direkt zum Grünerator: gruenerator.eu"
  },
  {
    "url": "/docs/basics/intro",
    "pageTitle": "Grünerator – die Grüne KI",
    "heading": "Plus für Barrierefreiheit",
    "anchor": "#plus-für-barrierefreiheit",
    "category": "Basics",
    "text": "Der Grünerator hilft beim Erstellen von Untertiteln für Instagram Reels & TikToks und kreiert Alt-Texte für Sharepics. Beides ist essenziell für mehr Barrierefreiheit im Netz, aber auch viel Aufwand, den viele Ehrenamtliche kaum schaffen. Mit dem Reel-Grünerator und dem Grünerator für Alt-Texte nimmt der Grünerator diese Aufgaben fast vollständig ab."
  },
  {
    "url": "/docs/basics/Kennzeichnungs-Guide",
    "pageTitle": "Kennzeichnung grünerierter Inhalte",
    "heading": "Kennzeichnung grünerierter Inhalte",
    "anchor": "",
    "category": "Basics",
    "text": "Bei der Nutzung des Grünerators stellen sich viele von euch Fragen der Transparenz: Wann muss ich kennzeichnen, dass ein Text von KI erstellt wurde und wann nicht? ---"
  },
  {
    "url": "/docs/basics/Kennzeichnungs-Guide",
    "pageTitle": "Kennzeichnung grünerierter Inhalte",
    "heading": "Bilder und Videos immer kennzeichnen",
    "anchor": "#bilder-und-videos-immer-kennzeichnen",
    "category": "Basics",
    "text": "KI-generierte oder mit KI bearbeitete Bilder und Videos müssen immer gekennzeichnet werden. Bei Bildern fügt der Grünerator die Kennzeichnung standardmäßig hinzu („KI-Generiert mit dem Grünerator\" oder kurz „KI-Generiert\"). Du kannst sie im Bild-Editor zwar abwählen — dann bist du aber selbst dafür verantwortlich, das Bild bei der Veröffentlichung als KI-generiert zu kennzeichnen."
  },
  {
    "url": "/docs/basics/Kennzeichnungs-Guide",
    "pageTitle": "Kennzeichnung grünerierter Inhalte",
    "heading": "Grundsätzlich: Kennzeichnungspflicht bei KI-Texten",
    "anchor": "#grundsätzlich-kennzeichnungspflicht-bei-ki-texten",
    "category": "Basics",
    "text": "Im neuen europäischen AI Act (Artikel 50) steht: Wenn ein KI-System „Text generiert oder manipuliert, der zu dem Zweck veröffentlicht wird, die Öffentlichkeit über Angelegenheiten von öffentlichem Interesse zu informieren“, muss offengelegt werden, dass der Text künstlich erstellt oder verändert wurde. Das betrifft insbesondere unsere politische Kommunikation."
  },
  {
    "url": "/docs/basics/Kennzeichnungs-Guide",
    "pageTitle": "Kennzeichnung grünerierter Inhalte",
    "heading": "Präzise Kennzeichnung",
    "anchor": "#präzise-kennzeichnung",
    "category": "Basics",
    "text": "Wenn Inhalte gekennzeichnet werden, muss die Kennzeichnung immer präzise benennen, wofür der Grünerator eingesetzt wurde. Zum Beispiel: Bei diesem Wahlprogramm wurde die Rechtschreibung mit dem Grünerator, der grünen KI, korrigiert."
  },
  {
    "url": "/docs/basics/Kennzeichnungs-Guide",
    "pageTitle": "Kennzeichnung grünerierter Inhalte",
    "heading": "Wichtige Ausnahme – redaktionelle Verantwortung",
    "anchor": "#wichtige-ausnahme--redaktionelle-verantwortung",
    "category": "Basics",
    "text": "Diese Pflicht entfällt, „wenn die KI-generierten Inhalte einer menschlichen Überprüfung oder redaktionellen Kontrolle unterzogen wurden und eine natürliche oder juristische Person die redaktionelle Verantwortung für die Veröffentlichung der Inhalte trägt.“ Mit anderen Worten: Wenn wir die Texte selbst prüfen, überarbeiten und die Verantwortung übernehmen, ist eine Kennzeichnung nicht notwendig. Da wir dies beim Grünerator ohnehin immer tun, empfehle ich, zumindest bei Social-Media-Texten und Pressemitteilungen darauf zu verzichten. Bei Wahlprogrammen oder längeren Texten empfehle ich, kenntlich zu machen, wie KI genutzt wurde, etwa zur Recherche oder zum Vergleich mit anderen Programmen."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Wie nachhaltig ist der Grünerator?",
    "anchor": "",
    "category": "Basics",
    "text": "Künstliche Intelligenz kostet Strom, Wasser und Hardware — das lässt sich nicht wegdiskutieren. Der Grünerator ist deshalb so gebaut, dass er möglichst wenig davon braucht und den Rest aus möglichst sauberen Quellen bezieht. Drei Hebel machen den Unterschied: Grünes Hosting — die Server laufen mit erneuerbarer Energie. Sparsame Modelle — kleine und mittlere Modelle statt Frontier-Giganten. Intelligentes Routing — jede Anfrage bekommt nur so viel Rechenleistung, wie sie wirklich braucht."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Black Forest Labs (Freiburg) — Bilder aus der EU",
    "anchor": "#black-forest-labs-freiburg--bilder-aus-der-eu",
    "category": "Basics",
    "text": "Black Forest Labs aus Freiburg entwickelt die FLUX-Bildmodelle. Der Grünerator nutzt ausschließlich den EU-Endpunkt (api.eu.bfl.ai) — die Bilderzeugung läuft damit im europäischen Strommix, der deutlich CO₂-ärmer ist als der US-amerikanische, wo die meisten Bild-KIs rechnen."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Cortecs — der Vermittler, und die ehrliche Lücke",
    "anchor": "#cortecs--der-vermittler-und-die-ehrliche-lücke",
    "category": "Basics",
    "text": "Cortecs ist kein Rechenzentrum, sondern ein Vermittler: Es reicht eine Anfrage an einen von mehreren Unteranbietern weiter. Wir schränken diese Auswahl vertraglich auf solche ein, die in der EU sitzen und dort reguliert sind und Zero Data Retention zusichern — und weil eine Weisung allein nichts beweist, prüfen wir jede Antwort nach: Cortecs nennt in einem Kopffeld, wer tatsächlich gerechnet hat, und ein Name außerhalb unserer Positivliste wird als Fehler protokolliert. Auch die Verbrauchsbuchhaltung läuft auf diesen Namen, nicht auf „Cortecs\". In der Praxis rechnet dort Infercom SCS — Sitz in Luxemburg, Verarbeitung laut Cortecs-Vertrag in Deutschland. Ein zweiter Endpunkt desselben Modells liegt bei Berget AI (Schweden); der Router wählt ihn von sich aus bisher nicht. Hier ist die Bilanz schlechter belegt als bei allen anderen auf dieser Seite, und das soll so dastehen: Für Infercom ist uns weder ein PUE-Wert noch ein Herkunftsnachweis für Ökostrom bekannt. Wir rechnen deshalb mit dem deutschen Strommix (344 g CO₂e/kWh, Umweltbundesamt 2025) und rechnen keinen Ökostrom an — die vorsichtige Lesart, nicht die günstige. Ein fremdes Zertifikat zu erben wäre derselbe Fehler wie bei…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Erzeugte Bilder",
    "anchor": "#erzeugte-bilder",
    "category": "Basics",
    "text": "Ein einzelnes Bild wiegt schwerer als alles andere in der Übersicht: Ein Sharepic mit Flux Pro entspricht rund 25 erzeugten Pressemitteilungen. Deshalb zeigt die Übersicht den Bildanteil getrennt an — eine Summe allein würde nahelegen, dass Chatten das Problem ist. Auch hier meldet kein Anbieter Messwerte, und GreenPT betreibt kein Bildmodell, mit dem wir kalibrieren könnten. Die Werte stammen aus einer veröffentlichten Messreihe: Iyengar et al. (2025) vermessen gängige Diffusionsmodelle auf einer A100 über das gesamte Raster aus Auflösung, Schritten, Rechengenauigkeit und Guidance. Genau das macht die Arbeit brauchbar — wir können die Zelle nehmen, die zu unserer Nutzung passt, statt eine Schlagzeile zu zitieren. Bei 1024×1024, 50 Schritten, fp16, mit CFG: Modell | Energie je Bild (nur GPU) | ----------------------------- | ------------------------- | Qwen-Image (läuft bei Regolo) | 3,58 Wh | FLUX.1 [dev] | 4,28 Wh | Zwei Korrekturen sind nötig, bevor man das übernehmen darf. Erstens misst die Arbeit ausschließlich die GPU und zieht deren Leerlauf ab. In einem echten Rechenzentrum zahlt man beides: den Leerlauf ohnehin, dazu CPU, Arbeitsspeicher, Netzwerk, Lüfter und Verluste im…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "GreenPT — Dokumente und Ausweichweg",
    "anchor": "#greenpt--dokumente-und-ausweichweg",
    "category": "Basics",
    "text": "GreenPT rechnet ausschließlich in EU-Rechenzentren mit 100 % erneuerbarer Energie — in Paris sowie in Helsinki (je zur Hälfte Wasser- und Windkraft) — und nennt konkrete Effizienzwerte: PUE 1,25 (Branchenschnitt: 1,55) und ein Wasserverbrauch (WUE) von 0,25 statt branchenüblicher 1,8. Dass die erzeugten Dateien — PDFs, Präsentationen, Tabellen und Dokumente — hier laufen, ist keine Verlegenheitslösung, sondern gemessen: Am 03.08.2026 gegen die echten Prompts und Vorlagen rief das große Standardmodell das nötige Werkzeug in keinem einzigen Lauf sauber auf und lief in Wiederholungen fest, GreenPTs Modell in zehn von zehn Läufen — und dabei drei- bis viermal schneller. Als frei wählbare Chat-Lane ist GreenPT im Code fertig verdrahtet, im Modellwähler aber noch nicht freigeschaltet — deshalb steht sie oben nicht bei den drei wählbaren Lanes."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Grünes Hosting: Wasserkraft statt Kohlestrom",
    "anchor": "#grünes-hosting-wasserkraft-statt-kohlestrom",
    "category": "Basics",
    "text": "Der Grünerator selbst — Web-Oberfläche, Datenbanken, Suche — läuft bei Hetzner in Deutschland. Hetzner betreibt seine deutschen Standorte nach eigenen Angaben mit 100 % Wasserkraft, ist EMAS- und ISO-14001-zertifiziert und erreicht mit einem durchschnittlichen PUE-Wert von 1,13 eine überdurchschnittliche Energieeffizienz (je näher an 1,0, desto weniger Strom geht für Kühlung und Infrastruktur verloren). Gegenüber dem deutschen Durchschnitts-Strommix spart das laut Hetzner rund 77.000 Tonnen CO₂ pro Jahr. Die selbst gehosteten Open-Source-Modelle, die netzbegrünung e.V. und die verdigado eG betreiben, liefen ebenfalls auf dieser Wasserkraft-Infrastruktur. Seit dem 29.08.2026 bedienen sie keine Anfrage des Grünerators mehr — die Infrastruktur, Datenbank und Suche laufen unverändert dort weiter. Der Rückzug ging in drei Schritten, und alle drei hatten denselben Grund: Die selbst gehostete Instanz denkt vor jeder Antwort nach, und kein Schalter stellte das ab — rund zwei Drittel der Ausgabe gingen in einen Denkblock, den niemand angefordert hatte. 31.07.2026 — Gemma 4 zog zu Regolo nach Italien. Dieselben Gewichte antworten dort neunmal schneller, weil sie den Denkblock nicht…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Intelligentes Routing: nur so viel KI wie nötig",
    "anchor": "#intelligentes-routing-nur-so-viel-ki-wie-nötig",
    "category": "Basics",
    "text": "Der Grünerator schickt nicht jede Anfrage an das größte verfügbare Modell. Stattdessen entscheidet ein kompaktes Einordnungs-Modell zuerst, was überhaupt gebraucht wird: eine einfache Antwort, eine Recherche, ein Dokument, ein Bild. Auch innerhalb einer Antwort ist die Arbeit geteilt: Ein kleines, schnelles Modell übernimmt das Planen und Aufrufen von Werkzeugen (Suche, Notebooks, Dokumente), ein kompaktes Modell schreibt den Text. Das große Standardmodell kommt nur dort zum Einsatz, wo seine Qualität wirklich gebraucht wird. So bleibt der Energieverbrauch pro Anfrage niedrig, ohne dass die Qualität leidet."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Mistral AI (Frankreich) — Transparenz-Vorreiter",
    "anchor": "#mistral-ai-frankreich--transparenz-vorreiter",
    "category": "Basics",
    "text": "Mistral AI vermarktet sich nicht als Öko-Anbieter, hat aber als erstes KI-Unternehmen überhaupt eine vollständige, unabhängig geprüfte Lebenszyklus-Analyse eines eigenen Modells veröffentlicht — erstellt mit der französischen Umweltagentur ADEME und Carbone 4, peer-reviewed nach ISO 14040/44. Die Zahlen machen KI-Umweltkosten erstmals konkret vergleichbar: Eine typische Antwort (400 Token) verursacht etwa 1,14 g CO₂e und 45 ml Wasser. Mistral setzt sich zudem für einen verbindlichen globalen Umweltstandard für KI ein. Dazu kommt der französische Strommix, der zu den CO₂-ärmsten Europas gehört."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Mitte statt Obergrenze — und die Spanne dazu",
    "anchor": "#mitte-statt-obergrenze--und-die-spanne-dazu",
    "category": "Basics",
    "text": "Überall, wo wir schätzen müssen, zeigen wir seit dem 29.08.2026 einen mittleren Wert und daneben die Spanne, in der er sitzt. Vorher stand an diesen Stellen die Obergrenze allein. Der Wechsel ist keine Beschönigung, sondern die Korrektur eines zweiten Fehlers. Auf jede Unsicherheit nach oben zu runden liest sich wie Vorsicht, verhält sich aber wie eine Verzerrung: Die Zahl ist dann verlässlich falsch, und zwar immer in dieselbe Richtung — und weil mehrere solcher Aufschläge sich multiplizieren, wächst der Fehler mit jeder Unsicherheit, die man ehrlich benennt. Wer vorsichtig sein will, wird dafür bestraft. Dazu kam ein Ungleichgewicht, das erst beim Nachrechnen auffiel: Die Aufschläge lagen alle auf der Energie-Seite, während auf der Kohlenstoff-Seite eine Annahme in die Gegenrichtung lief (nur Verbrennungsemissionen, siehe oben). Die Rechnung war also nicht durchgehend streng, sondern streng beim Strom und großzügig beim CO₂ — was niemand beabsichtigt hatte und was in keiner der beiden Richtungen als Vorsicht durchgeht. Was die Spanne trägt und was nicht, steht ausdrücklich dabei: Wo eine Lane gemessen und das Land des Anbieters bekannt ist, fallen beide Enden zusammen und es…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Modelle ohne Messwert: die Mitte einer gemessenen Klammer",
    "anchor": "#modelle-ohne-messwert-die-mitte-einer-gemessenen-klammer",
    "category": "Basics",
    "text": "Für einige Lanes betreibt GreenPT kein Gegenstück — Mistral Small 4 (119 Mrd.) und Pixtral Large. Sie einfach wegzulassen wäre die bequemste Lösung und die falscheste: Bei realer Nutzung läuft ein Großteil des Volumens genau dort. Über die Modellgröße lässt sich das nicht schätzen — die Messreihe widerlegt den Zusammenhang direkt: GPT-OSS mit 120 Mrd. Parametern verbraucht je Token weniger als ein Sechstel von Mistral Medium mit 128 Mrd. Wir haben deshalb einen zweiten Weg geprüft: Antwortgeschwindigkeit als Energie-Proxy. Auf identischer Regolo-Hardware sollte ein Modell, das doppelt so lange für ein Token braucht, ungefähr doppelt so viel ziehen. Als Kontrolle haben wir den Proxy an zwei Modellen getestet, deren Energieverbrauch wir kennen: | Verhältnis GPT-OSS 120B zu Gemma 4 | --------------------------- | ---------------------------------- | laut Geschwindigkeits-Proxy | 0,43× | laut Messung | 1,12× | Der Proxy lag um 62 % daneben — und zwar in der schmeichelhaften Richtung. Geschwindigkeit sagt vor allem, über wie viele GPUs ein Modell verteilt ist, nicht wie viel es zieht. Die daraus abgeleiteten Zahlen haben wir verworfen. Was bleibt, ist die gemessene Spanne dieser…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Quellen",
    "anchor": "#quellen",
    "category": "Basics",
    "text": "Alle Zahlen dieser Seite sind nachprüfbar. Unsere Anbieter Scaleway Impact Report 2025 — Scope 1/2/3, PUE je Rechenzentrum, WUE Hetzner: Nachhaltigkeit — PUE 1,10–1,16, Wasserkraft seit 2008, EMAS DHH Group Sustainability Report 2024 — Seeweb (Regolo), Stromverbrauch und PUE GreenPT: Sustainability — Methode der CO₂-Berechnung, stündliche Netzdaten von Nodera GreenPT: Partner — Infrastruktur läuft bei Scaleway in Paris Regolo: Sustainable AI Mistral AI: Ökobilanz mit ADEME und Carbone 4 Strommix Umweltbundesamt: CO₂-Emissionen pro Kilowattstunde Strom — Deutschland, verbrauchsbasiert RTE: Bilan électrique — Frankreich Ember: Yearly Electricity Data — Italien und Ländervergleich Methode und Vergleichszahlen Jegham et al., „How Hungry is AI?\" (arXiv:2505.09598) — Grundlage des ChatGPT-Vergleichs Iyengar et al., „Energy Scaling Laws for Diffusion Models\" (arXiv:2511.17031) — Grundlage der Bildwerte; Tabelle 3 (FLUX.1) und Tabelle 6 (Qwen-Image) Scope3: Sustainable AI — Image Generation — unabhängige Gegenprobe für Bilder Uptime Institute Global Data Center Survey 2025 — PUE-Durchschnitt: europäische Region 1,50 (n = 134), weltweit 1,54 (n = 681) Energieeffizienzgesetz (EnEfG) § 11 —…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Regolo (Seeweb, Italien) — 100 % erneuerbar",
    "anchor": "#regolo-seeweb-italien--100--erneuerbar",
    "category": "Basics",
    "text": "Regolo betreibt seine GPU-Server nach eigenen Angaben mit 100 % erneuerbarer Energie, verzichtet auf Wasserkühlung und führt Hardware im Kreislauf (wiederverwenden, aufarbeiten, recyceln). Das Unternehmen ist ISO-14001-zertifiziert, Qualified Supporter der Green Web Foundation und arbeitet nach dem europäischen DNSH-Prinzip („Do No Significant Harm\", EU-Taxonomie) — alles in europäischen Rechenzentren, mit Zero Data Retention. Transkription lief hier bis Juli 2026 ebenfalls; Regolos eigene Hinweise begrenzten sie auf zwei Minuten pro Datei, und an einem 180-Sekunden-Ausschnitt wiederholte das Modell tatsächlich einen ganzen Satz. Seitdem läuft sie über Anbieter ohne diese Einschränkung."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Sparsame Modelle statt Größenwahn",
    "anchor": "#sparsame-modelle-statt-größenwahn",
    "category": "Basics",
    "text": "Die größten kommerziellen KI-Modelle brauchen für jede einzelne Antwort ein Vielfaches der Energie eines kompakten Modells. Der Grünerator setzt deshalb bewusst auf kleine und mittlere Modelle — kein einziges davon spielt in der Größenklasse der Frontier-Modelle. Welche es gerade genau sind, ändert sich mehrmals im Jahr; diese Tabelle wird direkt aus dem Routing-Code erzeugt und zeigt deshalb immer den aktuellen Stand, nicht den von Hand nachgepflegten: Im Chat selbst stehen drei Größen zur Wahl — Klein, Mittel und Ultra; welche Modelle dahinterstehen, sind die ersten drei Zeilen oben. Kein einziges dieser Modelle spielt in der Größenklasse der energiehungrigsten Frontier-Modelle — und für die Aufgaben im politischen Alltag reicht das nicht nur, es ist oft sogar die bessere Wahl, weil kleinere Modelle schneller antworten."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Warum keine Nachkommastellen",
    "anchor": "#warum-keine-nachkommastellen",
    "category": "Basics",
    "text": "Keine dieser Zahlen trägt eine Nachkommastelle. Der Fußabdruck ruht auf Modellkoeffizienten aus einer Messreihe und, wo die fehlt, auf der Mitte zwischen zwei gemessenen Modellen — ein Zehntelgramm ist eine Auflösung, die diese Rechnung nicht hergibt. „154 g\" sagt dasselbe wie „154,1 g\", nur ohne eine Genauigkeit zu behaupten, die es nicht gibt. Die Einheit wechselt erst bei 10 kg von Gramm auf Kilogramm, weil „1 kg\" für 1400 g ein Drittel wegrunden würde, um einen Dezimalpunkt zu vermeiden."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Warum Ökostrom die Hauptzahl nicht auf null bringt — und wo er trotzdem auftaucht",
    "anchor": "#warum-ökostrom-die-hauptzahl-nicht-auf-null-bringt--und-wo-er-trotzdem-auftaucht",
    "category": "Basics",
    "text": "Alle drei Anbieter beziehen zertifizierte erneuerbare Energie. Trotzdem steht in unserer Hauptzahl der jeweilige Netzmix. Das ist keine Nachlässigkeit, sondern der Punkt: Ein Ökostromvertrag ändert nichts daran, welcher Strom im selben Moment physisch durch die Leitung fließt. Scaleway macht es selbst genau so. Der Impact Report weist den Ökostrom ausdrücklich als Guarantee of Origin aus, also als Herkunftsnachweise — und rechnet die Emissionen trotzdem standortbasiert. Ein Anbieter, der sich mit einem Federstrich auf nahe null hätte rechnen können, tut es nicht. Dem folgen wir. Ihn ganz zu verschweigen wäre allerdings die andere Hälfte derselben Unehrlichkeit. Zertifikate zu kaufen ist eine reale Handlung mit realer Wirkung auf den Ausbau. Deshalb zeigen wir die marktbasierte Rechnung als günstiges Ende der Spanne, ausdrücklich als zweite Methode gekennzeichnet — nicht als Unsicherheit und nie als Ersatz für die Hauptzahl. Marktbasiert ist dabei nichts zu schätzen: Für Verbrauch, der durch entwertete Herkunftsnachweise gedeckt ist, gilt der Emissionsfaktor der vertraglich bezogenen Erzeugung, also null. Die einzige Frage je Anbieter ist der Beleg, und die Latte ist ein benanntes…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was die ganze Plattform verbraucht",
    "anchor": "#was-die-ganze-plattform-verbraucht",
    "category": "Basics",
    "text": "Die Transparenz-Seite zeigt die Summe über alle Nutzer:innen: Energie und CO₂ des gesamten Grünerators, aufgeschlüsselt nach Anbieter, Bereich und Funktion, dazu der Tagesverlauf. Das ist die einzige Stelle, an der wir eine absolute Verbrauchszahl nennen — hier beschreibt sie unsere eigenen Entscheidungen und nicht das Verhalten einzelner Menschen. Drei Entscheidungen dahinter sind erklärungsbedürftig, weil sie die Zahlen kleiner oder unschärfer machen, als sie sein könnten. Es ist eine Spanne, keine Zahl. Wo ein Modell vermessen ist und das Land des Anbieters feststeht, fallen alle Enden zusammen. Wo nicht, zeigt die Skala beide Enden der gemessenen Klammer und die angezeigte Zahl sitzt dazwischen. Ihre Breite ist damit ein direktes Maß dafür, wie viel wir noch nicht wissen — und sie wird schmaler, sobald eine Lane vermessen wird, nicht durch besseres Formulieren. Tage mit sehr wenigen Aktiven fallen ganz heraus. Unterschreitet ein Tag fünf verschiedene Nutzer:innen, wird er nicht nur aus dem Verlauf ausgeblendet, sondern auch aus allen Summen entfernt. Nur auszublenden würde nichts nützen: Wer zwei Zeiträume abfragt, die sich um einen Tag unterscheiden, könnte ihn durch…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was die Zahl nicht enthält",
    "anchor": "#was-die-zahl-nicht-enthält",
    "category": "Basics",
    "text": "Keine Herstellung, kein Training. Wir zählen den Strom der Anfrage selbst. Der CO₂-Rucksack aus GPU-Produktion und Modelltraining fehlt. Keine Sprachausgabe. KugelAudio veröffentlicht keine Verbrauchsdaten, und für Sprachsynthese gibt es keine veröffentlichte Messung, deren Systemgrenze zu unserer passt. Anders als bei der Transkription erfassen wir hier aber die Dauer — die Größe, mit der die Energie skalieren würde. Sobald jemand einen belastbaren Wert in Wattstunden je Sekunde erzeugter Sprache liefert, lässt sich der gesamte bisher erfasste Zeitraum rückwirkend bewerten, ohne dass Daten nachgetragen werden müssen. Für den Netzfaktor bräuchte es zusätzlich eine Spanne statt eines Punktwerts: KugelAudios Unterauftragnehmer-Register nennt für die Inferenz Verda AI (Finnland) und Nebius (Finnland, Frankreich) sowie Hetzner für GPU-Server (Deutschland); Polen kommt nur über Scaleway als allgemeine Infrastruktur ins Bild. Welcher Standort eine einzelne Anfrage bedient hat, legt der Anbieter nicht offen. Keine Transkription, keine Recherche. Dafür liefert kein Anbieter Messwerte. Bei GreenPT, das als einziges überhaupt misst, haben wir alle in Frage kommenden Endpunkte geprüft:…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was dieselbe Arbeit mit ChatGPT gekostet hätte",
    "anchor": "#was-dieselbe-arbeit-mit-chatgpt-gekostet-hätte",
    "category": "Basics",
    "text": "Die Nutzungs-Übersicht zeigt ausschließlich diese Differenz — den Betrag, um den dieselbe Arbeit auf ChatGPT teurer oder billiger gewesen wäre. Sie beruht auf Jegham et al. (2025) — der einzigen veröffentlichten Rechnung zu GPT-4o mit derselben Systemgrenze wie unserer: nur Betriebsstrom, kein Training, keine Hardware-Herstellung, PUE eingerechnet, standortbasierter Emissionsfaktor. Alles andere wäre ein Vergleich von Äpfeln mit Birnen. Für eine Kurzanfrage (100 Token rein, 300 raus) nennt die Arbeit 0,42 Wh und damit rund 147 mg CO₂e. Unsere Modelle in derselben Konfiguration: Modell und Standort | Energie | CO₂ | ---------------------------- | ------- | ------ | Gemma 4 bei Regolo | 0,21 Wh | 56 mg | GPT-OSS 120B bei Regolo | 0,24 Wh | 66 mg | Mistral Medium in Frankreich | 1,37 Wh | 30 mg | GPT-4o (Jegham et al.) | 0,42 Wh | 147 mg | Daraus ergibt sich die Spanne, die die Übersicht zeigt: rund 2- bis 5-mal weniger CO₂ je vergleichbarer Anfrage. Der Vergleich gilt nur für Text. Für erzeugte Bilder gibt es keine OpenAI-Zahl mit vergleichbar sauber benannter Systemgrenze; eine Herstellerschätzung gegen eine grenzkorrigierte Messung zu stellen würde die Sorgfalt entwerten, um die…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Wenn ein Betreiber keinen PUE veröffentlicht",
    "anchor": "#wenn-ein-betreiber-keinen-pue-veröffentlicht",
    "category": "Basics",
    "text": "Drei Anbieter nennen keinen: Mistral, Infercom und Berget. Bis August 2026 fiel die Rechnung dort still auf GreenPTs 1,25 zurück — also auf den Wert eines fremden, besonders effizienten Rechenzentrums. Die Transparenz-Seite hat ihn danebengeschrieben, als hätte der Anbieter ihn genannt. Das war falsch, und zwar in die schmeichelnde Richtung. Jetzt schätzen wir stattdessen über den Standort und weisen die Schätzung als Schätzung aus (auf der Seite als „PUE geschätzt\", mit einem ≈ vor der Zahl): Fall | Wert | Grundlage | --------------------------------- | ---- | ------------------------------------------------------------------------------------- | Rechenzentrum in Deutschland | 1,5 | Obergrenze des Energieeffizienzgesetzes für Bestandsanlagen ab dem 01.07.2027 | Standort nur als „EU/EWR\" bekannt | 1,50 | Uptime Institute, Global Data Center Survey 2025 — europäischer Durchschnitt, n = 134 | Bewusst der europäische Durchschnitt und nicht der weltweite Wert derselben Erhebung (1,54 bei n = 681): Alle betroffenen Anbieter sind vertraglich auf den EWR festgelegt. Regionen mit schlechteren Werten — Naher Osten und Afrika melden 1,68 — würden unseren Fußabdruck mit Rechenzentren…"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Wie wir Emissionen berechnen",
    "anchor": "#wie-wir-emissionen-berechnen",
    "category": "Basics",
    "text": "Emissionen sind Energie mal Kohlenstoffintensität des Stroms. Dafür gibt es zwei anerkannte Methoden, und das GHG-Protokoll verlangt ausdrücklich beide. Wir weisen seit August 2026 auch beide aus: die standortbasierte Zahl mit dem realen Strommix am Rechenzentrumsstandort ist unsere Bilanz und die Zahl, die überall groß steht. Die marktbasierte Zahl, die den bezogenen Ökostrom anrechnet, bildet das günstige Ende der angezeigten Spanne. Nie eine ohne die andere. Das ist bewusst die strengere Variante, und wir folgen damit GreenPT selbst: Der Anbieter wirbt mit 100 % erneuerbarer Energie und rechnet seine Emissionen trotzdem nicht auf null, sondern nutzt stündliche Netzdaten je Standort. Ein Ökostromvertrag ändert nichts daran, welcher Strom im selben Moment physisch durch die Leitung fließt. Die grüne Beschaffung bleibt richtig und wirksam — sie ist nur kein Rabatt auf die Bilanz. Wir rechnen mit diesen Werten (Jahresmittel 2024, nur Verbrennungsemissionen): Standort | g CO₂/kWh | Quelle | --------------------------------- | --------- | -------------------------------------------------- | Scaleway (Paris) | 24 | Scaleway Impact Report 2025, eigene Scope-2-Zahl | Frankreich ……"
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Wie wir rechnen",
    "anchor": "#wie-wir-rechnen",
    "category": "Basics",
    "text": "Unter Einstellungen → Nutzung siehst du, was du gemacht hast — Anfragen, Tokens, Bilder, Transkriptionen, Recherchen, Sprachausgabe — und daneben, wie viel CO₂ dieselbe Arbeit auf ChatGPT gekostet hätte. Was du verbraucht hast, zeigen wir dort bewusst nicht. Das ist eine Entscheidung, keine Auslassung. Wie viel eine Anfrage kostet, hängt fast vollständig davon ab, welches Modell wo läuft und an welchem Netz das Rechenzentrum hängt — und das entscheiden wir, nicht du. Eine persönliche Gramm-Zahl macht eine einzelne Person für eine Architekturentscheidung verantwortlich, die sie nicht getroffen hat, und legt nahe, weniger zu fragen, wo eigentlich wir sparsamer bauen müssen. Die absolute Zahl gehört deshalb dorthin, wo sie hingehört: auf die Transparenz-Seite, die den Verbrauch der ganzen Plattform ausweist. Die Zahlen unten erklären trotzdem beides — die Ersparnis im Nutzung-Tab und die Plattformzahl entstehen aus derselben Rechnung."
  },
  {
    "url": "/docs/basics/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Woher die Messwerte kommen",
    "anchor": "#woher-die-messwerte-kommen",
    "category": "Basics",
    "text": "Von unseren Anbietern liefert nur GreenPT die Umweltkosten einer Anfrage mit: Jede Antwort trägt ein impact-Objekt mit Energieverbrauch und Emissionen. Diese Werte übernehmen wir unverändert. Für alle anderen rechnen wir hoch — mit Werten, die an genau denselben Modellen gemessen wurden. GreenPT betreibt Gemma 4, GPT-OSS 120B und Mistral Medium 3.5 ebenfalls, also verrät eine Messung dort, was dasselbe Modell bei Regolo oder Cortecs kostet. Gemessen am 31.07.2026 über 35 Läufe mit unterschiedlich langen Antworten: Modell | Energie je erzeugtem Token | typische Antwort (400 Token) | ----------------------------- | -------------------------- | ---------------------------- | Mistral Small 3.2 (24 Mrd.) | 0,70 mWh | 0,28 Wh | Gemma 4 (31 Mrd.) | 0,72 mWh | 0,29 Wh | GPT-OSS 120B | 0,81 mWh | 0,34 Wh | Mistral Medium 3.5 (128 Mrd.) | 4,52 mWh | 1,84 Wh | Qwen 3.5 (397 Mrd.) | 7,47 mWh | 3,08 Wh | Das ist die harte Zahl unter dem, was weiter oben über sparsame Modelle steht: Mistral Medium braucht das 6,3-fache von Gemma 4, das größte gemessene Modell das 10,3-fache. Genau deshalb schreibt bei uns ein kompaktes Modell die Antworten. Nebenbei zeigt die Messung, dass der Prompt fast…"
  },
  {
    "url": "/docs/basics/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Deine Daten im Grünerator",
    "anchor": "",
    "category": "Basics",
    "text": "Landesverbände und Abgeordnetenbüros können ein Grünerator Notebook erwerben und eigene Daten in den Grünerator einpflegen. Damit ermöglicht ihr, dass Basismitglieder und Kommunalos den Grünerator dauerhaft kostenfrei nutzen können. Zur Einführung in Funktionen, Datenschutz und Open‑Source‑Grundlagen siehe die Einführung."
  },
  {
    "url": "/docs/basics/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Ablauf & Kontakt",
    "anchor": "#ablauf--kontakt",
    "category": "Basics",
    "text": "Größe bestimmen und Preis zuordnen (LV). Kontakt aufnehmen per E‑Mail an info@moritz-waechter.de und Notebook anfragen. Eigene Daten einpflegen und interne Bekanntmachung – ab dann profitieren alle Ehrenamtlichen unmittelbar."
  },
  {
    "url": "/docs/basics/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Preise für Landesverbände (pro Notebook / Jahr)",
    "anchor": "#preise-für-landesverbände-pro-notebook--jahr",
    "category": "Basics",
    "text": "Groß (≥ 20.000): 7.000 € Baden‑Württemberg, Bayern, Nordrhein‑Westfalen Mittel (10.000–19.999): 3.500 € Berlin, Hessen, Niedersachsen Klein (5.000–9.999): 1.500 € Hamburg, Rheinland‑Pfalz, Schleswig‑Holstein Sehr klein (< 5.000): 750 € Bremen, Saarland Ostdeutsche Landesverbände: kostenfrei Brandenburg, Mecklenburg‑Vorpommern, Sachsen, Sachsen‑Anhalt, Thüringen"
  },
  {
    "url": "/docs/basics/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Warum ein Notebook erwerben?",
    "anchor": "#warum-ein-notebook-erwerben",
    "category": "Basics",
    "text": "Eigene Daten im Grünerator: Eure Inhalte, Positionen und Beschlüsse fließen direkt in die KI‑gestützten Antworten ein. Sicherer, dauerhafter, kostenfreier Zugang für Basismitglieder. Priorisierte Weiterentwicklung zugunsten der kommunalen Arbeit und Ehrenamtlichen."
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Worauf der Grünerator aufbaut",
    "anchor": "",
    "category": "Basics",
    "text": "Der Grünerator steht auf den Schultern vieler freier Open-Source-Projekte – Software, die offen entwickelt wird und die alle nutzen, einsehen und weiterentwickeln dürfen. Das passt zu unserer Haltung: Politische Werkzeuge sollten transparent und überprüfbar sein, nicht in einer Blackbox verschwinden. Hier findest du die wichtigsten Bausteine, was sie im Grünerator tun und was technisch dahintersteckt."
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Boards: Kibo UI & dnd-kit",
    "anchor": "#boards-kibo-ui--dnd-kit",
    "category": "Basics",
    "text": "Die verschiedenen Board-Ansichten – Kanban, Tabelle, Kalender, Zeitstrahl und Liste – stammen von Kibo UI. Das ist eine quelloffene Sammlung fertiger, anpassbarer React-Komponenten (im Stil von shadcn/ui), die direkt in den Grünerator übernommen und an unser Design angepasst werden. Das eigentliche Verschieben der Karten übernimmt darunter dnd-kit, eine schlanke Bibliothek für flüssiges und barrierefreies Drag-and-drop. Zusammen sorgen sie dafür, dass du Aufgaben einfach mit der Maus von einer Spalte in die nächste ziehst, neu sortierst und an der passenden Stelle ablegst. Kibo UI: GitHub dnd-kit: GitHub · NPM"
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Das Fundament",
    "anchor": "#das-fundament",
    "category": "Basics",
    "text": "Unter all diesen Funktionen liegt ein Fundament aus bewährten Open-Source-Bausteinen: React ist die Grundlage der gesamten Benutzeroberfläche – im Web wie in der App. Die von Meta entwickelte Bibliothek setzt aus einzelnen Komponenten zusammen, was du auf dem Bildschirm siehst, und aktualisiert Inhalte automatisch, sobald sich etwas ändert. GitHub · NPM Tauri verwandelt den Grünerator in eine echte Desktop-App für Windows und Mac. Anders als ältere Lösungen ist Tauri in der Programmiersprache Rust geschrieben und nutzt den im Betriebssystem vorhandenen Browser – dadurch werden die Programme deutlich kleiner und sparsamer. Es kümmert sich außerdem um Dinge wie automatische Updates und Benachrichtigungen. GitHub · NPM Expo & React Native sind die Grundlage der mobilen App für iPhone und Android. React Native erlaubt es, die App einmal zu schreiben und auf beiden Systemen als echte App laufen zu lassen; Expo liefert dazu die Werkzeuge und den Zugriff auf Funktionen wie Kamera, Mikrofon und Mitteilungen. Expo: GitHub · NPM React Native: GitHub · NPM Express ist der Server, der im Hintergrund alle Anfragen entgegennimmt. Das schlanke Standard-Framework für Node.js leitet jede Anfrage…"
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Dokumente: BlockNote",
    "anchor": "#dokumente-blocknote",
    "category": "Basics",
    "text": "BlockNote ist der Editor hinter den Dokumenten im Grünerator. Er funktioniert wie ein modernes Schreibprogramm im Stil von Notion: Du baust deinen Text aus einzelnen Bausteinen – sogenannten Blöcken – wie Überschriften, Listen und Bildern auf und formatierst alles direkt beim Schreiben. Technisch setzt BlockNote auf der etablierten Editor-Grundlage ProseMirror auf, ergänzt sie aber um dieses blockbasierte Konzept und eine fertige Oberfläche. So kannst du Dokumente außerdem mit einem Klick als PDF-, Word- oder OpenDocument-Datei herunterladen. BlockNote: GitHub · NPM ProseMirror: GitHub · NPM"
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "KI-Chat: assistant-ui",
    "anchor": "#ki-chat-assistant-ui",
    "category": "Basics",
    "text": "assistant-ui ist die Grundlage des KI-Chats im Grünerator. Es ist eine quelloffene React-Bibliothek, die genau die Chat-Oberfläche bereitstellt, die du von ChatGPT kennst – mit Nachrichtenverläufen, Antworten, die Wort für Wort erscheinen, und der Einbindung von Werkzeugen wie der Web-Recherche. Technisch ist assistant-ui bewusst „kopflos\" (headless) gehalten: Es liefert das Verhalten und die Bausteine eines Chats, das Aussehen gestaltet der Grünerator komplett selbst – damit sich der Chat grün anfühlt und nahtlos in die Oberfläche einfügt. GitHub · NPM"
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Recherche & Dateiablage: Qdrant",
    "anchor": "#recherche--dateiablage-qdrant",
    "category": "Basics",
    "text": "Qdrant ist das Herzstück der Recherche und der Dateiablage. Es ist eine quelloffene „Vektor-Suchmaschine\": Anders als eine klassische Stichwortsuche findet Qdrant Inhalte nach ihrer Bedeutung. Dafür werden Texte in Zahlenreihen übersetzt, die ihren Sinn abbilden – Qdrant findet dann die Stellen, die inhaltlich am besten passen, auch wenn du andere Worte benutzt als im Originaltext. So findet der Grünerator in deinen hochgeladenen Dateien und recherchierten Quellen die richtigen Passagen wieder und kann sie in seinen Antworten korrekt zitieren. Qdrant: GitHub Ergänzend dazu durchforstet Crawlee für deine Recherche das Web: Es ruft Webseiten auf, liest ihre Inhalte aus und bereitet sie für die Suche auf. So fließen auch aktuelle Quellen aus dem Internet in deine Recherche ein. Crawlee: GitHub · NPM"
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Untertitel: FFmpeg",
    "anchor": "#untertitel-ffmpeg",
    "category": "Basics",
    "text": "FFmpeg ist das Allzweckwerkzeug für Video und Ton, das im Hintergrund der Untertitel-Funktion arbeitet. Es gilt seit Jahrzehnten als der Industriestandard für die Verarbeitung von Medien und steckt in unzähligen Programmen weltweit. Im Grünerator wandelt es deine Videos um, löst die Tonspur für die Transkription heraus und brennt die fertigen Untertitel fest ins Bild ein. Ohne FFmpeg gäbe es kein fertig untertiteltes Reel zum Herunterladen. GitHub"
  },
  {
    "url": "/docs/basics/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Zusammenarbeit in Echtzeit: Yjs & Hocuspocus",
    "anchor": "#zusammenarbeit-in-echtzeit-yjs--hocuspocus",
    "category": "Basics",
    "text": "Yjs und Hocuspocus arbeiten zusammen, damit mehrere Menschen gleichzeitig am selben Dokument oder Board arbeiten können. Yjs ist ein sogenanntes CRDT-Framework: eine Technik, die parallele Änderungen mehrerer Personen automatisch und ohne Konflikte zusammenführt – dieselbe Idee, die auch hinter Google Docs steckt. Hocuspocus ist der passende Server dazu (ursprünglich für den Editor Tiptap entwickelt): Er verbindet alle Beteiligten über eine dauerhafte Echtzeit-Verbindung und sichert den gemeinsamen Stand laufend in der Datenbank, damit keine Eingabe verloren geht. Yjs: GitHub · NPM Hocuspocus: GitHub · NPM"
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Risiken und Gefahren",
    "anchor": "",
    "category": "Basics",
    "text": "Zugegeben, KI ist praktisch. Aber wir wären nicht bei den GRÜNEN, wenn wir nicht auch darauf achten würden, welche Risiken und Gefahren KI zugrunde liegen. Ich würde folgende Punkte fokussieren:"
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "3. Regulatorische Risiken und verbotene Praktiken laut EU AI Act",
    "anchor": "#3-regulatorische-risiken-und-verbotene-praktiken-laut-eu-ai-act",
    "category": "Basics",
    "text": "Die EU-Gesetzgebung für Künstliche Intelligenz (AI Act) adressiert explizit eine Reihe von Hochrisikobereichen und verbietet bestimmte KI-Praktiken, um die Grundrechte zu schützen und Missbrauch zu verhindern."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Begrenztes Kontextfenster",
    "anchor": "#begrenztes-kontextfenster",
    "category": "Basics",
    "text": "LLMs können sich nur an eine begrenzte Anzahl von Wörtern in einer Konversation \"erinnern\". Wird diese Grenze überschritten, beginnen sie, den Kontext zu vergessen. Wer schon mal länger in einem KI-Chatfenster gehangen hat wird es kennen: Je länger man drin ist, desto komischer werden die Antworten."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Datenschutzbedenken",
    "anchor": "#datenschutzbedenken",
    "category": "Basics",
    "text": "Bei der Nutzung von LLMs besteht das Risiko, dass sensible oder persönliche Informationen, die in die Modelle eingegeben werden, nicht ausreichend geschützt sind."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Fazit",
    "anchor": "#fazit",
    "category": "Basics",
    "text": "Zusammenfassend lässt sich sagen, dass die Gefahren von LLMs von tiefgreifenden technischen Limitierungen bis hin zu weitreichenden gesellschaftlichen und ethischen Problemen reichen, die sorgfältige Regulierung und verantwortungsvolle Anwendung erfordern."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Fehlinformation und Manipulation",
    "anchor": "#fehlinformation-und-manipulation",
    "category": "Basics",
    "text": "Die Fähigkeit von LLMs, menschenähnliche Texte, Bilder oder Videos zu erzeugen (sogenannte \"Deepfakes\"), macht es zunehmend schwierig, maschinengenerierte Inhalte von authentischen zu unterscheiden. Dies birgt erhebliche Risiken für die Integrität des Informationsökosystems und das Vertrauen der Öffentlichkeit, da es zu großflächiger Fehlinformation, Manipulation, Betrug und Identitätsdiebstahl führen kann."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Halluzinationen",
    "anchor": "#halluzinationen",
    "category": "Basics",
    "text": "Ein großes Problem ist die Tendenz von LLMs, \"Fakten zu halluzinieren\", das heißt, sie erfinden plausible, aber unwahre oder nicht durch Belege gestützte Informationen. Dies geschieht, weil LLMs auf statistischen Mustern und Wahrscheinlichkeiten basieren, anstatt die Wahrheit der Ausgabe zu überprüfen."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Kosten und Effizienz",
    "anchor": "#kosten-und-effizienz",
    "category": "Basics",
    "text": "LLMs sind extrem groß und ihr Training erfordert enorme Rechenressourcen und ist sehr kostspielig (z.B. bis zu 4,6 Millionen US-Dollar für einen einzelnen Trainingslauf von GPT-3 175B). Auch die Inferenz (die Zeit, die das Modell für eine Antwort benötigt) ist ein entscheidender Faktor. Eine hohe Latenz kann LLMs für Echtzeitanwendungen, wie Suchmaschinen, ungeeignet machen."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Mangel an gesundem Menschenverstand",
    "anchor": "#mangel-an-gesundem-menschenverstand",
    "category": "Basics",
    "text": "LLMs können sehr plausibel klingen, doch fehlt ihnen oft ein tiefgreifenderes Verständnis des Kontextes. Sie besitzen keinen \"gesunden Menschenverstand\" im menschlichen Sinne. Dies kann zu Fehlern führen, etwa bei logischen Fragen."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Mangelnde Interpretierbarkeit",
    "anchor": "#mangelnde-interpretierbarkeit",
    "category": "Basics",
    "text": "Obwohl LLMs über Argumentationsfähigkeiten verfügen, sind ihre internen Prozesse oft undurchsichtig. Es ist nicht immer leicht nachvollziehbar, wie sie zu bestimmten Ergebnissen kommen. Die Transparenz ist ein wichtiger Aspekt, der durch die EU-Verordnung gefordert wird, um Betreibern ein besseres Verständnis zu ermöglichen."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Schädliche Inhalte und Missbrauchspotenzial",
    "anchor": "#schädliche-inhalte-und-missbrauchspotenzial",
    "category": "Basics",
    "text": "LLMs können zusammenhängende, qualitativ hochwertige und plausible Texte generieren, was sie zu potenziellen Werkzeugen für die Verbreitung von Hassreden, Diskriminierung, Aufstachelung zu Gewalt, falschen Narrativen oder Social-Engineering-Angriffen macht. Es besteht auch ein \"Dual-Use-Potenzial\", bei dem LLMs missbraucht werden könnten, um illegale Informationen bereitzustellen, z.B. zur Waffenproliferation oder Terrorplanung."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Schwierige Leistungsvorhersage bei Skalierung",
    "anchor": "#schwierige-leistungsvorhersage-bei-skalierung",
    "category": "Basics",
    "text": "Es ist nicht immer klar, wie sich die Leistung von LLMs mit zunehmender Größe entwickelt. Es gibt Phänomene wie \"Inverse Scaling\" oder \"U-förmige Phänomene\", bei denen größere Modelle nicht zwangsläufig besser sind oder die Leistung sogar abnimmt. Dies macht die Planung und Investition in größere Modelle komplex und risikoreich."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Systemische Risiken von KI-Modellen mit allgemeinem Verwendungszweck",
    "anchor": "#systemische-risiken-von-ki-modellen-mit-allgemeinem-verwendungszweck",
    "category": "Basics",
    "text": "LLMs, insbesondere große generative KI-Modelle, können systemische Risiken bergen, die weitreichende negative Auswirkungen auf die öffentliche Gesundheit, Sicherheit, die demokratischen Prozesse und die Gesellschaft insgesamt haben können. Dies beinhaltet das Risiko der Verbreitung illegaler, falscher oder diskriminierender Inhalte und die Beeinflussung demokratischer Prozesse. Die EU-Verordnung legt Schwellenwerte für die Rechenleistung fest, ab denen ein Modell als systemisches Risiko eingestuft wird, und fordert Bewertungen und Minderungsmaßnahmen von den Anbietern."
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Verbotene KI-Praktiken (Artikel 5 des AI Act)",
    "anchor": "#verbotene-ki-praktiken-artikel-5-des-ai-act",
    "category": "Basics",
    "text": "#### Manipulative KI-Systeme Verboten sind KI-Systeme, die menschliches Verhalten durch unterschwellige Beeinflussung oder die Ausnutzung von Schwachstellen einer Person oder Gruppe (z.B. Alter, Behinderung, soziale/wirtschaftliche Situation) erheblich nachteilig beeinflussen und dadurch physischen, psychischen oder finanziellen Schaden verursachen können. Im politischen Kontext könnte dies beispielsweise ein KI-System sein, das Wähler manipuliert, indem es auf nicht wahrnehmbare Weise Emotionen oder Vorurteile anspricht. #### Soziale Bewertung (Social Scoring) KI-Systeme, die Menschen oder Gruppen über einen bestimmten Zeitraum anhand ihres sozialen Verhaltens oder ihrer persönlichen Merkmale bewerten oder klassifizieren und dies zu Diskriminierung oder Ausgrenzung führt, sind verboten. Ein kommunalpolitisches Beispiel wäre ein System, das Bürger nach ihrem Engagement in der Gemeinde bewertet und dies dann für den Zugang zu öffentlichen Dienstleistungen verwendet. #### Echtzeit-Biometrische Fernidentifizierung Diese Praxis ist grundsätzlich verboten, da sie massiv in die Privatsphäre eingreift und ein Gefühl ständiger Überwachung erzeugen kann. Es gibt nur eng definierte und…"
  },
  {
    "url": "/docs/basics/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Verzerrungen (Bias)",
    "anchor": "#verzerrungen-bias",
    "category": "Basics",
    "text": "LLMs können verzerrte Ergebnisse (Biases) reproduzieren, die aus den Trainingsdaten stammen. Da diese Modelle mit riesigen Mengen an Daten trainiert werden, die menschliche Vorurteile und gesellschaftliche Ungleichheiten widerspiegeln können, können sie diskriminierende Muster fortschreiben und verstärken. Dies kann sich in unterschiedlicher Leistung zwischen demografischen Gruppen (z.B. basierend auf Dialekt, Religion, Geschlecht oder Rasse) zeigen. Im kommunalpolitischen Kontext könnte dies beispielsweise bedeuten, dass KI-Systeme bei der Bewertung von Sozialleistungen unbewusst bestimmte Bevölkerungsgruppen benachteiligen, wenn die Trainingsdaten historische Ungleichheiten widerspiegeln."
  },
  {
    "url": "/docs/basics/tools",
    "pageTitle": "Alle Werkzeuge",
    "heading": "Alle Werkzeuge",
    "anchor": "",
    "category": "Basics",
    "text": "Der Grünerator ist kein einzelnes Programm, sondern eine Sammlung von Werkzeugen. Diese Seite zeigt, welche es gibt und wofür man sie nimmt — damit du nicht suchen musst, wo du etwas findest."
  },
  {
    "url": "/docs/basics/tools",
    "pageTitle": "Alle Werkzeuge",
    "heading": "Die Oberfläche hat zwei Tabs",
    "anchor": "#die-oberfläche-hat-zwei-tabs",
    "category": "Basics",
    "text": "Oben in der Mitte sitzen zwei Umschalter, und dahinter steckt die wichtigste Entscheidung: Chat ist die Startseite. Hier schreibst du in normalem Deutsch, was du brauchst, und der Grünerator wählt selbst, was er dafür tut — nachschlagen, recherchieren, rechnen, etwas erstellen. Für die meisten Aufgaben ist das der schnellste Weg, und du musst kein Werkzeug kennen. Was dort alles möglich ist, steht unter Was kann ich fragen?. Arbeiten ist die Werkzeugkiste. Hierher gehst du, wenn du gezielt etwas öffnen willst — ein bestimmtes Board, die Bildbearbeitung, deine Notebooks. Viele Werkzeuge auf dieser Seite lassen sich auch aus dem Chat heraus auslösen. „Mach mir daraus ein Sharepic\" oder „Erstell eine Tabelle mit den Zahlen\" führt ans selbe Ziel, ohne dass du den Bereich wechselst."
  },
  {
    "url": "/docs/basics/tools",
    "pageTitle": "Alle Werkzeuge",
    "heading": "Drei Bereiche, dann die Einzelwerkzeuge",
    "anchor": "#drei-bereiche-dann-die-einzelwerkzeuge",
    "category": "Basics",
    "text": "Der Arbeiten-Tab gliedert sich in drei große Bereiche — für Text und Zahlen, für Bilder und Videos, für Recherche. Jeder öffnet eine eigene Seite mit den zugehörigen Werkzeugen. Daneben liegen die Werkzeuge zum Organisieren und ein Menü mit dem Rest. Insgesamt sind es Werkzeuge:"
  },
  {
    "url": "/docs/basics/tools",
    "pageTitle": "Alle Werkzeuge",
    "heading": "Wenn du etwas nicht findest",
    "anchor": "#wenn-du-etwas-nicht-findest",
    "category": "Basics",
    "text": "Such nach dem Namen. Die Suche im Grünerator kennt auch die gängigen Bezeichnungen — „Untertitel\" findet die Reels, „OCR\" den Scanner. Manches gibt es nur im Web. Einige Werkzeuge brauchen eine große Oberfläche. In der App siehst du die Inhalte dann, kannst sie aber nicht überall bearbeiten. Bei jedem Werkzeug oben steht, wo es läuft. Namen, Beschreibungen und Pfade stammen direkt aus dem Programmcode des Grünerators. Kommt ein Werkzeug dazu oder wird eines umbenannt, meldet sich die Doku-Prüfung automatisch, bis die Seite nachgezogen ist — sie kann also nicht stillschweigend veralten. Es gibt mehrere Grünerator-Instanzen — neben dem allgemeinen etwa eine Testumgebung und eine für die Bundesgeschäftsstelle. Einzelne Instanzen können abweichen: nicht jede bietet alle hier beschriebenen Werkzeuge, Notebooks und Grüneratoren an. Was deine Instanz anbietet, siehst du immer in ihrer eigenen Oberfläche."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "Wie LLMs funktionieren",
    "anchor": "",
    "category": "Basics",
    "text": "Ein großes Sprachmodell, wie zum Beispiel ChatGPT , ist ein KI-Modell, das darauf trainiert ist, menschenähnlichen Text zu verstehen und zu erzeugen. Es ist im Kern eine hochentwickelte Anwendung von Sprachverarbeitung (NLP), maschinellem Lernen und Deep Learning. In vielen Filmen und Serien, insbesondere Kinderfilmen, gibt es die Rolle des alten weisen Mannes oder der alten weisen Frau, die als Mentor oder Mentorin gilt. Diese Leute haben über viele Jahre unfassbar viel gelesen, unfassbar viel Wissen angehäuft. Stellt euch ein LLM grundsätzlich so ähnlich vor, nur eben viel viel schneller trainiert."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "1. Eingabeverarbeitung (Input Embedding & Tokenisierung)",
    "anchor": "#1-eingabeverarbeitung-input-embedding--tokenisierung",
    "category": "Basics",
    "text": "Zuerst wird die Frage in kleinere \"Bausteine\" zerlegt, was man Tokenisierung nennt. Aus dem Satz werden einzelne Wörter wie \"Wie\", \"können\", \"Luftqualität\", \"Stadtgemeinde\" usw gezogen. Jeder dieser Bausteine wird dann in eine Reihe von Zahlen umgewandelt – einen numerischen Vektor. Stell dir vor, dass Wörtern mit ähnlicher Bedeutung auch ähnliche Zahlen zugewiesen werden. So könnte der Zahlencode für \"Luftqualität\" nah am Code für \"Emissionen\" oder \"Feinstaub\" liegen, während \"Kommunen\" auf den lokalen Kontext hinweist."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "2. Kontext erfassen (Encoder)",
    "anchor": "#2-kontext-erfassen-encoder",
    "category": "Basics",
    "text": "Die Sequenz dieser Zahlencodes wird dann von einem Teil des Modells, dem Encoder, verarbeitet. Dieser Encoder \"liest\" die Abfolge der Bausteine und erfasst die Beziehungen zwischen ihnen, um den gesamten Kontext und die Bedeutung Ihrer Frage zu verstehen. Er erkennt also, dass es um die nachhaltige Verbesserung der Luftqualität innerhalb einer Kommune geht."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "3. Antwort-Ideen entwickeln (Decoder)",
    "anchor": "#3-antwort-ideen-entwickeln-decoder",
    "category": "Basics",
    "text": "Die vom Encoder verstandene Information wird an einen anderen Teil des Modells, den Decoder, weitergegeben. Der Decoder beginnt nun, eine Sequenz von Zahlencodes zu generieren, die potenzielle Lösungsansätze für Ihre Frage darstellen. Das könnten Ideen sein wie \"Ausbau des öffentlichen Nahverkehrs\", \"Förderung von Elektromobilität\", \"Erweiterung von Grünflächen\" oder \"Einführung strengerer Emissionsstandards für Unternehmen\"."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "4. Fokus setzen (Aufmerksamkeitsmechanismus)",
    "anchor": "#4-fokus-setzen-aufmerksamkeitsmechanismus",
    "category": "Basics",
    "text": "Während der Decoder diese Lösungsansätze generiert, nutzt er einen Aufmerksamkeitsmechanismus. Das ist wie ein Spotlight, das sich selektiv auf die Teile Ihrer ursprünglichen Frage konzentriert, die für die gerade erzeugte Antwort am relevantesten sind. Wenn das Modell beispielsweise \"Ausbau des öffentlichen Nahverkehrs\" vorschlägt, könnte sich der Fokus auf die Wörter \"Luftqualität\" und \"Kommune\" in Ihrer Frage richten, da dies direkt mit der Lösung in Verbindung steht. Dies hilft dem Modell, maßgeschneiderte Antworten zu geben."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "5. Wahrscheinlichkeiten abwägen (Output Projection)",
    "anchor": "#5-wahrscheinlichkeiten-abwägen-output-projection",
    "category": "Basics",
    "text": "Zuletzt werden die vom Decoder erzeugten Zahlencodes durch weitere Schichten geleitet, die eine Wahrscheinlichkeitsverteilung über mögliche nächste Wörter oder Lösungsvorschläge erzeugen. Das Modell wählt dann das Wort oder die Phrase aus, die am wahrscheinlichsten ist, basierend auf dem, was es gelernt hat. Dieser Prozess wird Wort für Wort wiederholt, bis eine vollständige und kohärente Antwort generiert wurde."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "Der Lernprozess (Training)",
    "anchor": "#der-lernprozess-training",
    "category": "Basics",
    "text": "Damit ein LLM menschenähnlich sprechen kann, muss es \"lernen\". Dieser Lernprozess, das Training, ist entscheidend: Riesige Datenmengen: Modelle wie GPT-4, das lange Zeit die Basis für ChatGPT bildete, wurden mit gigantischen Textmengen trainiert – für GPT-4 waren das 300 Milliarden Wörter. Diese Texte stammen aus dem Internet, aber das Modell weiß nicht, welche spezifischen Dokumente Teil seines Trainings waren. Es lernt daraus Sprachmuster, Grammatik, Fakten und Zusammenhänge, ohne diese explizit als Regeln programmiert bekommen zu haben. Menschliche Aufsicht: Der Lernprozess wird oft durch menschliches Feedback verbessert. Das Modell erhält positives oder negatives Feedback zu seinen Antworten, wodurch es seine Fähigkeiten weiter verfeinert, kohärentere und passendere Texte zu erzeugen. Hyperparameter: Das sind wie die \"Lernregeln\" des Modells. Sie beeinflussen, wie schnell und präzise das Modell lernt, indem sie ihm helfen, den Kontext besser zu erkennen und verschiedene Eingaben und Ausgaben zu verwalten. Das Transformer-Modell ist die spezielle Architektur eines neuronalen Netzwerks, die bei ChatGPT zum Einsatz kommt und besonders gut darin ist, zusammenhängende Textsequenzen…"
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "Die Bausteine: Neuronale Netzwerke",
    "anchor": "#die-bausteine-neuronale-netzwerke",
    "category": "Basics",
    "text": "Der wichtigste Bestandteil eines LLM ist ein neuronales Netzwerk. Stellt euch das wie ein riesiges, komplexes Rechenmodell vor, das die Funktionsweise des menschlichen Gehirns nachahmt. Es besteht aus vielen miteinander verbundenen \"Einheiten\", die man als Neuronen bezeichnen könnte. Diese Neuronen sind über \"Verbindungen\" miteinander verknüpft, denen Gewichte zugewiesen sind. Jedes Neuron empfängt Informationen und gibt basierend auf einfachen Regeln eine Ausgabe weiter. Das Netzwerk lernt, indem es diese Gewichte anpasst – so wie wir durch Erfahrung lernen, unsere Reaktionen zu verfeinern."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "Neuere Modelle wie GPT-4 können noch mehr:",
    "anchor": "#neuere-modelle-wie-gpt-4-können-noch-mehr",
    "category": "Basics",
    "text": "Internetverbindung: Sie können sich mit dem Internet verbinden, um auf aktuelle Informationen zuzugreifen und so relevantere und aktuellere Antworten zu geben. Plugins: Sie können mit zusätzlichen Software-Tools, sogenannten Plugins, erweitert werden. Diese Plugins ermöglichen dem Modell, neue Funktionen zu nutzen, wie zum Beispiel Bilder zu generieren, Sprachen zu übersetzen oder sogar Musik zu komponieren. Multimodalität: GPT-4 ist multimodal, was bedeutet, dass es Informationen in verschiedenen Formen verarbeiten und erzeugen kann. Es kann beispielsweise Fragen zu Bildern beantworten oder Bilder aus Textbeschreibungen erstellen."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "Quelle",
    "anchor": "#quelle",
    "category": "Basics",
    "text": "Dieser Grünerator-Guide basiert auf wissenschaftlichen Erkenntnissen aus: Briganti, G. (2024). How ChatGPT works: a mini review. European Archives of Oto-Rhino-Laryngology, 281, 1565–1569."
  },
  {
    "url": "/docs/basics/wie-llms-funktionieren",
    "pageTitle": "Wie LLMs funktionieren",
    "heading": "Wie ein LLM eine Antwort generiert",
    "anchor": "#wie-ein-llm-eine-antwort-generiert",
    "category": "Basics",
    "text": "Nehmen wir an, wir stellen chatgpt diese Frage: „Wie können wir die Luftqualität in unserer Kommune nachhaltig verbessern?\" Wie würde ChatGPT diese Frage beantworten?"
  },
  {
    "url": "/docs/bildnachweise",
    "pageTitle": "Bildnachweise & Lizenzen",
    "heading": "Bildnachweise & Lizenzen",
    "anchor": "",
    "category": "Allgemein",
    "text": "Der Sharepic- und Canvas-Editor des Grünerators nutzt großartige, frei verfügbare Icon- und Illustrations-Sammlungen. Alle hier eingesetzten Sets sind kostenlos für private und kommerzielle Nutzung freigegeben. Ein herzliches Dankeschön an die Künstler:innen und Communities, die diese Werke offen zugänglich machen. 💚 Insgesamt stehen im Editor rund 17.000 Icons und 2.195 Illustrationen zur Verfügung."
  },
  {
    "url": "/docs/bildnachweise",
    "pageTitle": "Bildnachweise & Lizenzen",
    "heading": "Danke",
    "anchor": "#danke",
    "category": "Allgemein",
    "text": "Freie und offene Design-Ressourcen machen Werkzeuge wie den Grünerator erst möglich. Vielen Dank an alle Urheber:innen für ihre großzügige Arbeit — bitte unterstützt sie, wenn ihr die Werke nützlich findet."
  },
  {
    "url": "/docs/bildnachweise",
    "pageTitle": "Bildnachweise & Lizenzen",
    "heading": "Icons",
    "anchor": "#icons",
    "category": "Allgemein",
    "text": "Sammlung | Urheber:in | Anzahl | Lizenz | Quelle | ------------------- | ---------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------- | Tabler Icons | Paweł Kuna & Community | 6.100 | MIT | tabler.io/icons · GitHub | Remix Icon | Remix Design | 3.200 | Apache 2.0 | remixicon.com | Bootstrap Icons | Bootstrap | 2.100 | MIT | icons.getbootstrap.com | Lucide | Lucide Contributors | 1.800 | ISC | lucide.dev | Iconoir | Luca Burgio | 1.700 | MIT | iconoir.com | Heroicons | Tailwind Labs | 1.300 | MIT | heroicons.com | Flowbite Icons | Themesberg | 800 | MIT | flowbite.com/icons · GitHub | Die Icons sind lokal gebündelt (@iconify-json/) und funktionieren vollständig offline; jede Sammlung wird als eigener Lazy-Chunk nachgeladen."
  },
  {
    "url": "/docs/bildnachweise",
    "pageTitle": "Bildnachweise & Lizenzen",
    "heading": "Illustrationen",
    "anchor": "#illustrationen",
    "category": "Allgemein",
    "text": "Sammlung | Urheber:in | Anzahl | Lizenz | Quelle | --------------------- | ----------------------------- | ------ | --------------------------------------------------------------------- | --------------------------------------------------------- | unDraw | Katerina Limpitsouni | 1.608 | unDraw-Lizenz (frei, ohne Namensnennung) | undraw.co | Open Peeps | Pablo Stanley | 189 | CC0 (Public Domain) | openpeeps.com | Free Gophers Pack | Maria Letta | 153 | CC0 (Public Domain) | GitHub | illlustrations.co | Vijay Verma | 131 | MIT | illlustrations.co | Transhumans | Pablo Stanley | 38 | Kostenlos (privat & kommerziell) | transhumans.xyz | Open Doodles | Pablo Stanley | 33 | CC0 (Public Domain) | opendoodles.com | Humaaans | Pablo Stanley | 32 | Kostenlos (privat & kommerziell) | humaaans.com | React Kawaii | Miuki Miu (Elizabet Oliveira) | 11 | MIT | reactkawaii.com |"
  },
  {
    "url": "/docs/chat/dateien-hinzufuegen",
    "pageTitle": "Dateien hinzufügen",
    "heading": "Dateien hinzufügen",
    "anchor": "",
    "category": "Chat",
    "text": "Du kannst dem Grünerator Dateien mitgeben, statt ihren Inhalt abzutippen: ein Gesetzesentwurf, eine Studie, ein Screenshot, eine Tabelle. Er liest sie und bezieht sie in die Antwort ein."
  },
  {
    "url": "/docs/chat/dateien-hinzufuegen",
    "pageTitle": "Dateien hinzufügen",
    "heading": "Grenzen",
    "anchor": "#grenzen",
    "category": "Chat",
    "text": "| | ------------------------------------- | ------------------------------------- | Dateien pro Nachricht | | Größe je Datei | | Alle Dateien einer Nachricht zusammen | | Videos (eigener Weg, siehe unten) | je Datei | Videos zählen nicht in die Gesamtsumme. Sie nehmen einen anderen Weg als die übrigen Dateien — statt in die Anfrage eingebettet zu werden, laden sie separat hoch. Deshalb haben sie ein eigenes, viel höheres Limit. Wählst du mehrere Dateien auf einmal aus und der Grünerator kann eine davon nicht lesen, bekommst du für diese eine Datei einen Hinweis mit der Liste der erlaubten Typen. Die übrigen Dateien der Auswahl hängen ganz normal an — du musst nichts erneut anhängen."
  },
  {
    "url": "/docs/chat/dateien-hinzufuegen",
    "pageTitle": "Dateien hinzufügen",
    "heading": "Was damit gut funktioniert",
    "anchor": "#was-damit-gut-funktioniert",
    "category": "Chat",
    "text": "Anträge und politische Dokumente — einen bestehenden Antrag hochladen und um eine Fassung für den eigenen Kreisverband bitten. Einen Gesetzesentwurf hochladen und nach den Punkten fragen, die für die Kommune relevant sind. Pressearbeit — eine Studie hochladen und eine Pressemitteilung daraus entwickeln lassen, mit den Zahlen aus dem Papier statt aus dem Gedächtnis. Tabellen und Zahlen — eine Excel- oder CSV-Datei hochladen und daraus eine Auswertung, eine Grafik oder eine fertige Grünerator-Tabelle machen lassen. Dass eine Zahl aus deiner Datei stammt, heißt nicht, dass sie richtig übernommen wurde. Prüf sie, bevor der Text nach außen geht — mehr dazu unter Risiken und Gefahren von LLMs. Dateitypen und Grenzwerte stammen direkt aus dem Programmcode. Ändert sich dort etwas, schlägt die Doku-Prüfung an, bis diese Seite nachgezogen ist."
  },
  {
    "url": "/docs/chat/dateien-hinzufuegen",
    "pageTitle": "Dateien hinzufügen",
    "heading": "Was du hochladen kannst",
    "anchor": "#was-du-hochladen-kannst",
    "category": "Chat",
    "text": "Deutlich mehr als nur PDFs und Bilder: Quellcode-Dateien werden an ihrer Endung erkannt, nicht am Dateityp — Browser melden .ts sonst als Video und würden die Datei ablehnen."
  },
  {
    "url": "/docs/chat/dateien-hinzufuegen",
    "pageTitle": "Dateien hinzufügen",
    "heading": "Wo du Dateien anhängst",
    "anchor": "#wo-du-dateien-anhängst",
    "category": "Chat",
    "text": "Im Chat über das „+\"-Menü links im Eingabefeld. Das ist der einzige Ort — die früheren Generator-Formulare mit Büroklammer-Symbol gibt es nicht mehr, seit alles im Chat und in den zusammengelaufen ist."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "KI-Chat",
    "anchor": "",
    "category": "Chat",
    "text": "Der Grünerator Chat ist dein persönlicher KI-Assistent für grüne Politik. Du kannst Fragen stellen, Texte erstellen lassen, in Parteiprogrammen recherchieren und sogar Bilder generieren — alles in einer Chat-Oberfläche. Die Tabellen auf dieser Seite (Rezepte, Quellen, Werkzeuge) werden direkt aus dem Code des Grünerators erzeugt — sie zeigen also genau das, was der Chat gerade kann. Wie das funktioniert, steht unter Wie diese Doku entsteht."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Dateien im Chat",
    "anchor": "#dateien-im-chat",
    "category": "Chat",
    "text": "Du kannst PDFs und Bilder direkt im Chat hochladen, um sie als Kontext für deine Frage zu verwenden. Öffne dazu das „+\"-Menü im Eingabefeld und wähle Datei hinzufügen. Das Panel, das sich öffnet, führt oben Fotos & Dateien hochladen und darunter deine Dokumente, Notebooks und gespeicherten Texte. Eine Webseite gibst du am schnellsten mit, indem du ihre URL direkt ins Eingabefeld einfügst. Mehr Details zu unterstützten Dateitypen und Einschränkungen findest du unter Dateien hinzufügen."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Externe Dienste (Konnektoren)",
    "anchor": "#externe-dienste-konnektoren",
    "category": "Chat",
    "text": "Du kannst auch externe Dienste wie Notion, Tally oder Todoist per @-Mention nutzen — z. B. „Erstelle ein Anmeldeformular mit @tally\". Dafür verbindest du den Dienst einmalig unter Konnektoren. Wie das geht, steht im Konnektoren-Tutorial."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Gespräch starten",
    "anchor": "#gespräch-starten",
    "category": "Chat",
    "text": "Den Chat erreichst du über den Menüpunkt in der Seitenleiste oder direkt unter /chat. Dort siehst du: Eingabefeld unten zum Schreiben deiner Nachricht Seitenleiste links mit deinem Gesprächsverlauf — Gespräche kannst du dort auch in Projekten bündeln (eigene Projekte und Gruppen, mit Übersicht unter /projekte) „+\"-Menü links im Eingabefeld — Dateien anhängen, Websuche und Dokumentensuche ein- und ausschalten, Rezepte, Rollen, Konnektoren und die Erstellen-Werkzeuge Modell-Auswahl rechts unten im Eingabefeld Jedes Gespräch wird als eigener Thread mit eigener Adresse (/chat/…) gespeichert. Du kannst jederzeit ein neues Gespräch beginnen oder in der Seitenleiste zu einem früheren Gespräch zurückkehren."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Grüneratoren aufrufen",
    "anchor": "#grüneratoren-aufrufen",
    "category": "Chat",
    "text": "Für Anträge, Reden, Wahlprogramme und Bürger*innenanfragen gibt es eigene Grüneratoren — du findest sie unter dem Menüpunkt in der Seitenleiste und kannst sie direkt im Chat öffnen. Sie stehen außerdem in derselben @-Liste wie die Rezepte: deine eigenen unter eigene. Hat jemand aus einem deiner Projekte einen Grünerator mit dem Projekt geteilt, steht er dort unter aus deinen Gruppen, mit dem Namen der Gruppe, aus der er kommt. Ein @-Aufruf wechselt für diese eine Nachricht auf diesen Grünerator; ein Rezept, das du vorher gewählt hast, bleibt dabei aktiv."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Quellen durchsuchen",
    "anchor": "#quellen-durchsuchen",
    "category": "Chat",
    "text": "Der Chat kann gezielt in grünen Parteiprogrammen, Beschlüssen und Dokumenten recherchieren. Tippe @ im Eingabefeld, um eine Quelle auszuwählen. @alle Alle Quellen @grundsatz Grundsatzprogramm @bundestagsfraktion Bundestagsfraktion @at Grüne Österreich @thüringen Grüne Thüringen @kommunalwiki KommunalWiki @berlin Grüne Berlin @gruenblog Grünblog @transparenz Abgeordnetenwatch @mv Grüne Mecklenburg-Vorpommern @brandenburg Grüne Brandenburg @bayern Grüne Bayern @sachsen-anhalt Grüne Sachsen-Anhalt @hessen Grüne Hessen @saar Grüne Saarland Weitere Landesverbände werden laufend ergänzt. Wenn dein Landesverband ein Grünerator Notebook erworben hat, erscheinen eure Daten automatisch als Quelle. Deine @-Mentions erscheinen als Chips in der gesendeten Nachricht und der Chat merkt sie sich: Folgefragen wie „fasse das kürzer\" bleiben automatisch bei der gewählten Quelle bzw. dem gewählten Werkzeug."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Quellenangaben",
    "anchor": "#quellenangaben",
    "category": "Chat",
    "text": "Wenn der Chat in Dokumenten oder im Web recherchiert, zeigt er dir die verwendeten Quellen an: Nummerierte Badges im Text (z.B. [1], [2]) verweisen auf die genutzten Quellen Klick auf einen Badge zeigt dir Titel, URL und einen Textauszug Gruppierte Quellenübersicht unterhalb der Antwort mit allen verwendeten Dokumenten Quellenangaben helfen dir, die Antworten des Grünerators nachzuvollziehen und zu überprüfen. Du kannst jede Quelle direkt anklicken, um das Originaldokument zu öffnen."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Rezepte auswählen",
    "anchor": "#rezepte-auswählen",
    "category": "Chat",
    "text": "Rezepte sind spezialisierte Schreib-Modi, die auf bestimmte Textarten optimiert sind — sie kennen den richtigen Ton, die Struktur und die Längenvorgaben der jeweiligen Plattform. So wählst du ein Rezept: Tippe @ im Eingabefeld und wähle aus der Liste — Rezepte stehen dort ganz oben, oder öffne das „+\"-Menü im Eingabefeld — dort findest du auch die Rezept-Bibliothek mit allen Rezepten @presse Pressemitteilung @instagram Instagram @facebook Facebook @twitter Twitter / X @linkedin LinkedIn @reel Reel / TikTok @aktion Aktionsideen @wahlpruefstein Wahlprüfsteine @buergermail Bürgerinnen-Mail @presse-berlin-fraktion PM Berlin (Fraktion) @presse-berlin-partei PM Berlin (Partei) @insta-berlin Insta Berlin @presse-mv-fraktion PM MV (Fraktion) @presse-mv-partei PM MV (Partei) @insta-mv Insta MV @presse-thueringen PM Thüringen @insta-thueringen Insta Thüringen @presse-brandenburg PM Brandenburg @insta-brandenburg Insta Brandenburg @presse-bayern-fraktion PM Bayern (Fraktion) @presse-bayern-partei PM Bayern (Partei) @presse-hessen-fraktion PM Hessen (Fraktion) @presse-hessen-partei PM Hessen (Partei) @presse-at Aussendung (AT) @presse-saarland PM Saarland @presse-sachsen-anhalt-fraktion PM…"
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Tipps für die Nutzung",
    "anchor": "#tipps-für-die-nutzung",
    "category": "Chat",
    "text": "Kombiniere Rezept + Quelle + Thema für die besten Ergebnisse, z.B. @presse @bundestagsfraktion Kindergrundsicherung Nutze @recherche für aktuelle Nachrichten und tiefgehende Analysen — es durchsucht Web und Dokumente und wählt die Suchtiefe automatisch Starte ein neues Gespräch für jedes neue Thema — so bleibt der Kontext sauber und die Antworten präziser Lade relevante Dokumente hoch, wenn du einen bestehenden Text überarbeiten oder darauf aufbauen möchtest"
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Werkzeuge nutzen",
    "anchor": "#werkzeuge-nutzen",
    "category": "Chat",
    "text": "Werkzeuge erweitern die Fähigkeiten des Chats über die reine Textgenerierung hinaus. Du kannst sie per @-Mention im Eingabefeld aktivieren — von der Recherche über Bildgenerierung bis zum Erstellen von Dokumenten, Tabellen und Präsentationen. @abgeordnetenwatch Abgeordnetenwatch @board-erstellen Board erstellen @bundestag Bundestag @canva Canva @diagramm Diagramm @verlauf Chatverlauf @rechnen Rechnen @connect Verbundene Accounts @deepresearch Tiefenrecherche @docs Dokument einfügen @dokument-erstellen Dokument erstellen @beispiele Beispiele @doku Hilfe & Anleitungen @bildgenerieren Bildgenerierung @stadtbegruenen Stadt begrünen @bildbearbeiten Bild bearbeiten @pdf-erstellen PDF erstellen @praesentation-erstellen Präsentation erstellen @pressemitteilungen Pressemitteilungen @recherche Recherche @dokumente Dokumente @sharepic Sharepic @tabelle-erstellen Tabelle erstellen @zusammenfassung Zusammenfassung @umfragen Umfragen @vorlagen Vorlagen @link Link @wolke Wolke Was du mit jeder dieser Fähigkeiten konkret fragen kannst, zeigt dir die Seite Was kann ich fragen? mit Musterfragen zu jeder Funktion. Im „+\"-Menü links im Eingabefeld stehen die Werkzeuge, mit denen du etwas erzeugst —…"
  },
  {
    "url": "/docs/chat/ki-modelle",
    "pageTitle": "KI-Modelle",
    "heading": "KI-Modelle",
    "anchor": "",
    "category": "Chat",
    "text": "Beim Grünerieren kannst du selbst wählen, welches KI-Modell deine Texte erstellt. Jedes Modell hat eigene Stärken – von besonders kreativ bis besonders schnell. Standardmäßig übernimmt der Grünerator die Wahl für dich."
  },
  {
    "url": "/docs/chat/ki-modelle",
    "pageTitle": "KI-Modelle",
    "heading": "Automatisch (Standard)",
    "anchor": "#automatisch-standard",
    "category": "Chat",
    "text": "Im Modus Automatisch wählt der Grünerator das passende Modell für deine jeweilige Aufgabe aus – du musst dich um nichts kümmern. Wenn du lieber selbst entscheidest, kannst du im Modell-Menü jederzeit ein bestimmtes Modell auswählen."
  },
  {
    "url": "/docs/chat/ki-modelle",
    "pageTitle": "KI-Modelle",
    "heading": "Datenschutz",
    "anchor": "#datenschutz",
    "category": "Chat",
    "text": "Alle verfügbaren Modelle erfüllen höchste Datenschutzstandards: Europäische Server: Deine Eingaben werden ausschließlich auf europäischen Servern verarbeitet – entweder bei Mistral AI (Frankreich) oder auf selbst gehosteten Servern. Kein KI-Training: Deine Eingaben werden nicht zum Training der KI verwendet. Open Source: Die selbst gehosteten Modelle hinter Klein und Mittel sind vollständig quelloffen und transparent."
  },
  {
    "url": "/docs/chat/ki-modelle",
    "pageTitle": "KI-Modelle",
    "heading": "Verfügbare Modelle",
    "anchor": "#verfügbare-modelle",
    "category": "Chat",
    "text": "Du wählst eine Größe, kein Herstellermodell – dieselben drei Stufen, die du auch in der Chrome-Erweiterung und im Excel-Add-in findest. Klein – Am schnellsten, für kurze Aufgaben. Vollständig quelloffen und selbst gehostet auf europäischen Servern. Mittel – Eine gute Mischung aus Tempo und Qualität, besonders für Kreativtexte. Open-Source-Modell auf europäischen Servern. Ultra – Die beste Qualität, für Recherche und lange Aufgaben. Läuft auf EU-Servern (Mistral AI, Frankreich). Welches Modell hinter einer Stufe steckt, kann sich ändern, wenn ein besseres verfügbar wird – die Stufe bleibt. Welche Anbieter aktuell dahinterstehen, steht jederzeit in der Datenschutzerklärung. Für die Bildgenerierung kommen eigene Modelle zum Einsatz (u. a. Flux von Black Forest Labs, Deutschland). Auch hier gilt: Verarbeitung auf europäischen Servern."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "Was kann ich fragen?",
    "anchor": "",
    "category": "Chat",
    "text": "Der Grünerator ist kein Suchfeld mit festen Befehlen — du schreibst in normalem Deutsch, was du brauchst. Diese Seite zeigt, was dabei alles möglich ist, mit Musterfragen zum Abschauen und Weiterschreiben. Du findest den Chat unter dem Menüpunkt . Wie du dort Rezepte, Quellen und Dateien auswählst, steht unter KI-Chat."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "So stellst du eine gute Frage",
    "anchor": "#so-stellst-du-eine-gute-frage",
    "category": "Chat",
    "text": "Einfach lostippen. Der Grünerator erkennt an deiner Formulierung selbst, ob er nachschlagen, recherchieren, rechnen oder etwas erstellen soll. „Was steht im Grundsatzprogramm zum Mietendeckel?\" reicht — du musst kein Werkzeug auswählen. Nenne das Ziel, nicht den Weg. Statt „such im Web und schreib dann einen Post\" genügt „Schreib einen Instagram-Post zum aktuellen Stand der Wärmewende\". Mehrschrittige Aufträge löst der Grünerator in einem Rutsch. Werde konkret, wenn es darauf ankommt. Ort, Zeitraum, Länge und Zielgruppe verbessern das Ergebnis spürbar: „Pressemitteilung, etwa 2.000 Zeichen, für die Lokalpresse in Kassel.\" Mit @ steuerst du gezielt — sowohl Quellen, Dokumente und verbundene Dienste als auch Rezepte (die im Picker ganz oben erscheinen). Nachfragen ist erwünscht. Antworten lassen sich im Gespräch weiterentwickeln: „kürzer\", „sachlicher\", „mach ein Sharepic daraus\". Der Grünerator behält den Zusammenhang. „Was kannst du?\" oder „Wie erstelle ich ein Sharepic?\" beantwortet der Chat direkt — er kennt seinen eigenen Funktionsumfang."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "Was du fragen kannst",
    "anchor": "#was-du-fragen-kannst",
    "category": "Chat",
    "text": "Anfordern musst du nichts davon — es genügt, die Frage zu stellen. Die Kennzeichnungen an den Karten bedeuten: @kürzel — für diese Fähigkeit gibt es zusätzlich eine Erwähnung, mit der du sie im Eingabefeld vorwählen kannst. Nur ein Teil der Fähigkeiten hat so ein Kürzel, und das ist Absicht: Erwähnungen gibt es dort, wo die Vorauswahl wirklich etwas ändert — bei Quellen, die man gezielt ansteuert, und bei Formaten, die man bewusst wählt. Vieles erkennt der Grünerator auch ohne Erwähnung zuverlässig an der Formulierung allein. @wetter gibt es zusätzlich als Kürzel, sobald der Wetterdienst als Zusatzquelle verbunden ist — genau wie bei Bahn, tagesschau, trivago und Gesetze (siehe unten). experimentell — noch jung. Funktioniert, kann sich aber in Bedienung und Ergebnis noch ändern und ist nicht überall verfügbar. Verlass dich für etwas Wichtiges nicht blind darauf. Werkzeug: … — diese Fähigkeit lässt sich in eigenen Grüneratoren gezielt an- und abschalten. Zusatzquelle: … — dahinter steckt ein externer Dienst (Bahn, Wetterdienst, tagesschau, trivago, Gesetze), der pro Umgebung angebunden wird. Fehlt die Anbindung gerade, bleibt die Frage nicht unbeantwortet: der Grünerator weicht auf…"
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "Wenn etwas nicht geht",
    "anchor": "#wenn-etwas-nicht-geht",
    "category": "Chat",
    "text": "Manches ist nur in der Web-Version möglich. Reel-Untertitel bearbeiten und Excel-/CSV-Vorlagen ausfüllen brauchen die große Oberfläche; in der App wirst du dorthin weitergeleitet. Sharepics entstehen dagegen auch in der App — du siehst sie direkt im Gespräch, kannst sie teilen und speichern; zum Feinschliff öffnet sich der Editor eingebettet, ohne dass du die App verlässt. Einige Quellen decken nur Deutschland ab. Bundestag, Abgeordnetenwatch, Bahn, tagesschau und Gesetze (deutsches Bundesrecht) beziehen sich auf deutsche Daten. Bei österreichischen Fragen weicht der Grünerator auf die Websuche aus. Nicht jede Zusatzquelle ist überall angebunden. Bahn, Wetterdienst, tagesschau, trivago und Gesetze werden pro Umgebung eingerichtet. Fehlt eine, greift der Grünerator auf die Websuche zurück und sagt dazu, worauf die Antwort beruht — erfundene Abfahrtszeiten gibt es nicht. Erfindet der Grünerator nichts? Bei Recherchen und Datenquellen nennt er die Belege. Prüfe Zahlen und Zitate trotzdem, bevor sie nach außen gehen — mehr dazu unter Risiken und Gefahren von LLMs. Du nutzt den Grünerator in ChatGPT, Claude oder Le Chat? Dort steht ein kleinerer Funktionsumfang bereit — was dann…"
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Agentura",
    "anchor": "",
    "category": "Features",
    "text": "RecipeCategories, ShelfCount, SortOptions, } from '@site/src/components/AgenturaShelves'; Die Agentura ist der Marktplatz für alle Grüneratoren und Rezepte. Hier findest du an einem Ort alle verfügbaren Grüneratoren — vom Pressestellen-Profi bis zum Landesverbands-Assistenten — entdeckst neue Werkzeuge und baust dir mit wenigen Klicks deine eigenen. Du erreichst die Agentura über den Menüpunkt in der Seitenleiste oder direkt unter /agentura. Die alten Adressen /agents und /skills leiten automatisch dorthin weiter. Was früher Agent*innen hieß, heißt jetzt Grüneratoren; aus Skills sind Rezepte geworden. Ältere Screenshots und Newsletter benutzen noch die alten Begriffe — gemeint ist dasselbe."
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Detailseiten",
    "anchor": "#detailseiten",
    "category": "Features",
    "text": "Jeder Grünerator und jedes Rezept hat eine eigene Detailseite — wie ein Produkt im Laden. Grüneratoren (/agentura/agent/...): Kopfbereich mit den Aktionen Im Chat öffnen, Favorit und — bei deinen eigenen Grüneratoren — Teilen. Bei allen anderen heißt dieselbe Schaltfläche Link kopieren. Übersicht — Beschreibung des Grünerator-Agenten. Gesprächsbeginn — Begrüßungsnachricht und eine Vorschau auf Beispiel-Antworten. Fähigkeiten — welche Werkzeuge der Grünerator-Agent nutzt und auf welches Wissen er zugreift. Verwandte — ähnliche Grüneratoren, die zum Thema passen. Rezepte (/agentura/rezept/...): Kopfbereich mit den Aktionen Im Chat verwenden, Favorit und Link kopieren. Der vollständige Rezept-Text als Markdown — so siehst du genau, was das Rezept macht, bevor du es nutzt. Eine Vorlage und verwandte Rezepte."
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Eigene Grüneratoren bauen",
    "anchor": "#eigene-grüneratoren-bauen",
    "category": "Features",
    "text": "Das Herzstück der Agentura: Du kannst deine eigenen Grüneratoren bauen — ganz ohne technische Vorkenntnisse. Wie das Schritt für Schritt geht, liest du unter Eigene Grüneratoren erstellen."
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Favoriten",
    "anchor": "#favoriten",
    "category": "Features",
    "text": "Mit dem Stern auf einer Karte oder Detailseite markierst du einen Grünerator-Agenten oder ein Rezept als Favorit. Was danach passiert, ist für beide unterschiedlich. Grüneratoren heftest du damit an deine Seitenleiste an und öffnest sie von dort mit einem Klick im Chat. Das gilt für alle: eigene, System- und Landesverbands-Grüneratoren ebenso wie solche, die jemand anderes gebaut und über ein Projekt oder öffentlich mit dir geteilt hat. Ändert der Ersteller den Namen eines mit dir geteilten Grünerators, zeigt deine Seitenleiste den neuen Namen, wenn du die Agentura das nächste Mal öffnest — bis dahin bleibt der bisherige Name stehen. Rezepte werden nicht an die Seitenleiste geheftet. Sie sammeln sich im Favoriten-Regal oben in der Agentura — und im Chat stehen sie danach direkt im Plus-Menü neben dem Eingabefeld, ohne dass du sie erst suchen musst. Das gilt am Rechner wie in der App."
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Grüneratoren und Rezepte",
    "anchor": "#grüneratoren-und-rezepte",
    "category": "Features",
    "text": "In der Agentura leben zwei Arten von Helfern: Grüneratoren sind spezialisierte KI-Persönlichkeiten mit eigenem Ton, eigenem Wissen und eigenen Werkzeugen. Du öffnest sie direkt im Chat und arbeitest dort mit ihnen — oder rufst sie mitten im Gespräch mit @ auf, so wie ein Rezept. Rezepte sind kurze Schnellbefehle für eine konkrete Aufgabe (z. B. eine Pressemitteilung im Stil deines Landesverbands). Du rufst sie im Chat mit @ auf. Eine Faustregel: Ein Grünerator-Agent ist ein eigenständiges Gegenüber für ein ganzes Themenfeld. Ein Rezept ist eine einzelne Vorlage, die du auf jeden beliebigen Grünerator-Agenten anwenden kannst. In der Mehrzahl heißen sie Grüneratoren. In der Einzahl sagen wir Grünerator-Agent — „der Grünerator\" ohne Zusatz meint das Produkt als Ganzes."
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Im Marktplatz stöbern",
    "anchor": "#im-marktplatz-stöbern",
    "category": "Features",
    "text": "Die Agentura ist wie ein Marktladen aufgebaut. Es gibt Regale, angezeigt als Reihe farbiger Pillen-Buttons oberhalb der Karten — auf schmalen Bildschirmen umbricht die Reihe automatisch in mehrere Zeilen. Regale ohne Inhalt werden ausgeblendet, du siehst also nur, was bei dir tatsächlich etwas enthält — mit zwei Ausnahmen: Meine Grüneratoren und Von der Basis bleiben immer stehen und laden dich stattdessen zum Anlegen ein. Im offiziellen Regal sind die Rezepte zusätzlich nach Rubriken sortiert: . Über das Suchfeld findest du Grüneratoren und Rezepte nach Name oder Beschreibung; sortieren kannst du nach . Ein Grünerator-Agent kann auch nach Zeitplan laufen — etwa „jeden Montag eine Presseschau\". Angelegt wird er über den Link Neue wiederkehrende Aufgabe im Regal Meine Grüneratoren, Unterabschnitt Wiederkehrende Aufgaben (ein eigenes Regal gibt es dafür nicht). Im Editor erscheint dann ein zusätzlicher Zeitplan-Tab; denselben Tab siehst du, wenn du später einen Agenten mit Zeitplan bearbeitest. Auf den Karten der Grüneratoren siehst du außerdem Fähigkeits-Hinweise: welche Werkzeuge sie nutzen, ob sie auf ein Wissens-Notebook zugreifen und für welche Region sie gedacht sind. Suche,…"
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Schnell hinkommen",
    "anchor": "#schnell-hinkommen",
    "category": "Features",
    "text": "In der Seitenleiste liegt als eigener Eintrag. Ein Klick öffnet eine kurze Auswahl deiner Favoriten und der zuletzt genutzten Grüneratoren — von dort startest du direkt ein Gespräch, ohne den Umweg über den Marktplatz. Der Eintrag Alle Grüneratoren & Verwaltung führt in die Agentura."
  },
  {
    "url": "/docs/features/agentura",
    "pageTitle": "Agentura",
    "heading": "Tipps für die Nutzung",
    "anchor": "#tipps-für-die-nutzung",
    "category": "Features",
    "text": "Öffne einen Grünerator-Agenten direkt aus der Agentura im Chat — die ganze Konfiguration ist dann schon aktiv. Markiere häufig genutzte Grüneratoren als Favorit, damit sie in der Seitenleiste auftauchen. Schau dir vor dem Bauen ähnliche Grüneratoren an — über die „Verwandte\"-Liste auf den Detailseiten findest du Vorbilder. Mehr zum Arbeiten mit Grüneratoren im Gespräch findest du unter KI-Chat."
  },
  {
    "url": "/docs/features/boards",
    "pageTitle": "Boards",
    "heading": "Boards",
    "anchor": "",
    "category": "Features",
    "text": "Ein Board ist eine Tafel aus Spalten und Karten — für Aufgabenverteilung, Redaktionsplanung oder den Stand einer Kampagne. Du legst es über an. Was Boards von einer gewöhnlichen Aufgabenliste unterscheidet: Der Grünerator kann darin mitarbeiten. Er beantwortet Fragen in Karten, recherchiert, und kann eine ganze Spalte automatisch befüllen."
  },
  {
    "url": "/docs/features/boards",
    "pageTitle": "Boards",
    "heading": "Auf dem Handy",
    "anchor": "#auf-dem-handy",
    "category": "Features",
    "text": "In der App öffnet ein Board den vollen Editor — dieselbe Oberfläche wie im Browser, nur ohne Menüleiste drumherum. Karten verschieben, Spalten anlegen, Grünerator-Spalten einrichten: alles geht direkt vom Handy aus."
  },
  {
    "url": "/docs/features/boards",
    "pageTitle": "Boards",
    "heading": "Den Grünerator in einer Karte fragen",
    "anchor": "#den-grünerator-in-einer-karte-fragen",
    "category": "Features",
    "text": "Schreib in einem Kartenkommentar @Grünerator und dahinter deinen Auftrag. Die Antwort erscheint als Kommentar an derselben Karte — der Zusammenhang bleibt also dort, wo die Aufgabe steht. „@Grünerator recherchier den aktuellen Stand beim Radwegeausbau und fass das kurz zusammen.\" Standardmäßig antwortet er als Kommentar. Sagst du ausdrücklich, dass etwas anderes herauskommen soll, erzeugt er stattdessen ein eigenes Dokument und hängt es an die Karte: Was du schreibst | Was entsteht | ----------------------------------- | -------------------------------------------- | „…und mach eine Tabelle daraus\" | eine Tabelle, verknüpft mit der Karte | „…als Präsentation\" | eine Foliensammlung, verknüpft mit der Karte | „…leg daraus Aufgaben an\" | neue Karten im selben Board | „…schreib ein Dokument dazu\" | ein Textdokument, verknüpft mit der Karte | Tabellen, Präsentationen und Aufgabenlisten entstehen nur, wenn du sie ausdrücklich nennst. Das ist Absicht: Wer nur eine Frage stellt, soll eine Antwort bekommen und nicht ungefragt ein neues Dokument. Erzeugte Dokumente erben die Freigabe des Boards. Wer das Board sehen darf, sieht auch das Ergebnis — du musst nichts zusätzlich freigeben."
  },
  {
    "url": "/docs/features/boards",
    "pageTitle": "Boards",
    "heading": "Fertige Aufgaben",
    "anchor": "#fertige-aufgaben",
    "category": "Features",
    "text": "Reicht keine davon, gibst du stattdessen eine eigene Anweisung ein. Bei Recherche-Aufgaben sucht der Grünerator zuerst und formuliert danach — er schreibt nicht aus dem Gedächtnis. Bei zitierten Recherchen bekommst du die Quellen mitgeliefert; prüf sie, bevor etwas nach außen geht."
  },
  {
    "url": "/docs/features/boards",
    "pageTitle": "Boards",
    "heading": "Grünerator-Spalten",
    "anchor": "#grünerator-spalten",
    "category": "Features",
    "text": "Eine Grünerator-Spalte ist eine Spalte, die selbst arbeitet. Du richtest sie einmal ein, und danach durchläuft jede Karte drei Schritte: Quelle → KI-Schritt → Ergebnis. Quelle — woher der Inhalt kommt: aus der Karte selbst, von einer Webadresse oder aus einem Social-Media-Beitrag. KI-Schritt — was damit geschehen soll. Entweder eine der fertigen Aufgaben (unten) oder eine eigene Anweisung. Ergebnis — was dabei herauskommt: ein Kommentar, ein Dokument, eine Tabelle, eine Präsentation oder eine E-Mail. Das Ganze lässt sich auch nach Zeitplan laufen lassen — etwa jeden Montagmorgen."
  },
  {
    "url": "/docs/features/boards",
    "pageTitle": "Boards",
    "heading": "Spalten und Karten",
    "anchor": "#spalten-und-karten",
    "category": "Features",
    "text": "Spalten sind die Stationen, die eine Aufgabe durchläuft — „Ideen\", „In Arbeit\", „Fertig\". Karten wandern per Ziehen von einer Spalte in die nächste. Jede Karte hat einen Titel, eine Beschreibung, Kommentare und kann Personen zugewiesen werden."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Dokumente",
    "anchor": "",
    "category": "Features",
    "text": "Ein Dokument ist der Ort für Fließtext: Anträge, Pressemitteilungen, Protokolle, Notizen, Einladungen. Du legst es über an oder startest über aus einer Vorlage."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Aus einer Vorlage starten",
    "anchor": "#aus-einer-vorlage-starten",
    "category": "Features",
    "text": "Die Vorlagengalerie enthält die Textsorten, die in der politischen Arbeit immer wieder vorkommen — Antrag, Pressemitteilung, Protokoll, Redaktionsplan, Checkliste, Einladung. Eine Vorlage bringt die übliche Gliederung mit, sodass du nicht bei der Frage anfängst, welche Abschnitte überhaupt hineingehören."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Dateien einlesen",
    "anchor": "#dateien-einlesen",
    "category": "Features",
    "text": "Du kannst bestehende PDF-, Word- (.doc, .docx), ODT- und PowerPoint-Dateien in ein Dokument einlesen — auch wenn sie eingescannte Seiten enthalten. Der Text wird dabei erkannt und als bearbeitbarer Inhalt eingefügt, statt nur als Bild zu erscheinen. Ein Foto direkt vom Handy (JPG, PNG) nimmt der Dokument-Import nicht an. Für ein abfotografiertes Blatt ist der Scanner der Weg: Er erkennt den Text, und du kopierst ihn von dort ins Dokument."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Der Grünerator im Dokument",
    "anchor": "#der-grünerator-im-dokument",
    "category": "Features",
    "text": "Die Chat-Seitenleiste arbeitet am offenen Text: „formulier den zweiten Absatz sachlicher\", „mach eine Zusammenfassung an den Anfang\", „kürz das auf 2.000 Zeichen\". Anders als in Tabellen und Präsentationen gibt es hier keine feste Liste von Änderungsarten — es geht um Text, und der lässt sich frei umschreiben. Mehr dazu unter Der Grünerator im Editor. Bei Zahlen, Zitaten und Namen lohnt der zweite Blick, bevor ein Text nach außen geht. Mehr dazu unter Risiken und Gefahren von LLMs."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Frühere Fassungen",
    "anchor": "#frühere-fassungen",
    "category": "Features",
    "text": "Das Dokument merkt sich seinen Verlauf. Über die Versionshistorie siehst du frühere Stände und stellst sie bei Bedarf wieder her — nützlich, wenn beim gemeinsamen Überarbeiten ein Absatz verloren gegangen ist."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Gemeinsam arbeiten",
    "anchor": "#gemeinsam-arbeiten",
    "category": "Features",
    "text": "Mehrere Personen können gleichzeitig im selben Dokument schreiben. Die Änderungen der anderen erscheinen live, und du siehst an den farbigen Markierungen, wo gerade jemand arbeitet. Es gibt kein Sperren und kein „Datei ist in Benutzung\" — der Text führt die Beiträge zusammen. Wer hineinkommt, steuerst du über die Freigabe. Wie die Stufen funktionieren, steht unter Office."
  },
  {
    "url": "/docs/features/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Schreiben",
    "anchor": "#schreiben",
    "category": "Features",
    "text": "Der Editor arbeitet mit Blöcken: Jeder Absatz, jede Überschrift, jede Liste ist ein eigener Baustein. Mit / mitten im Text öffnest du die Auswahl der Blocktypen — Überschrift, Liste, Zitat, Tabelle, Trennlinie."
  },
  {
    "url": "/docs/features/intro",
    "pageTitle": "Features",
    "heading": "Features",
    "anchor": "",
    "category": "Features",
    "text": "Neben dem Chat gibt es im Grünerator drei größere Flächen. Diese Seiten beschreiben, was es dort gibt — jede Funktion, jeden Schalter. Wenn du stattdessen eine bestimmte Aufgabe erledigen willst, sind die Guides der kürzere Weg. Office — Dokumente, Tabellen, Präsentationen und Boards, gemeinsam bearbeitbar und mit KI-Unterstützung direkt im Editor. Agentura — der Marktplatz für Grüneratoren und Rezepte: fertige nutzen, eigene bauen. Notebooks — eigenes Wissen bündeln und durchsuchbar machen: Quellarten, Teilen, Verwaltung. Landesverbände — welche Inhalte der Landesverbände im Grünerator stecken und was ihre Grüneratoren können."
  },
  {
    "url": "/docs/features/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Der Grünerator im Editor",
    "anchor": "",
    "category": "Features",
    "text": "Jedes Office-Dokument hat eine Chat-Seitenleiste. Sie sieht aus wie der normale Chat und kann auch dasselbe — recherchieren, nachschlagen, Texte schreiben. Der Unterschied: Sie kennt das geöffnete Dokument und kann es verändern."
  },
  {
    "url": "/docs/features/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Gute Aufträge",
    "anchor": "#gute-aufträge",
    "category": "Features",
    "text": "Sag das Ziel, nicht den Weg. „Sortier nach Datum, neueste zuerst\" ist besser als eine Beschreibung, welche Zellen zu vertauschen sind. Beziehe dich auf Sichtbares. „Die dritte Spalte\", „die Folie mit den Zahlen\", „die Zeilen mit überschrittener Frist\" — der Grünerator sieht dasselbe wie du. Bau in Schritten. Große Umbauten gelingen zuverlässiger als Folge kleiner Aufträge. Pro Auftrag sind in Tabellen bis zu Änderungen möglich, in Präsentationen bis zu — wer mehr in einen Satz packt, bekommt eher ein halbes Ergebnis. Nachfassen ist normal. „Nicht so kräftig\", „nur die ersten zehn Zeilen\", „doch lieber absteigend\" — der Zusammenhang bleibt erhalten."
  },
  {
    "url": "/docs/features/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Was nicht geht",
    "anchor": "#was-nicht-geht",
    "category": "Features",
    "text": "Nicht jede Fähigkeit steht in jeder Dokumentart bereit. Was in Tabellen und Präsentationen möglich ist, steht als Liste in den jeweiligen Kapiteln — Tabellen und Präsentationen. Beide Listen kommen direkt aus dem Programmcode und zeigen auch, was vorübergehend abgeschaltet ist. Er gestaltet nicht frei. Der Grünerator setzt Inhalte und Formatierungen, entwirft aber kein Layout von Grund auf. Er arbeitet immer nur am geöffneten Dokument. „Übertrag das ins andere Board\" funktioniert nicht — dafür wechselst du dorthin und gibst den Auftrag erneut. Gerade bei Zahlen gilt: Der Grünerator kann eine Formel richtig setzen und trotzdem die falsche Spalte gemeint haben. Ein kurzer Blick auf das Ergebnis lohnt sich, bevor die Tabelle in eine Entscheidung einfließt."
  },
  {
    "url": "/docs/features/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Wie eine Änderung abläuft",
    "anchor": "#wie-eine-änderung-abläuft",
    "category": "Features",
    "text": "Du schreibst einen Auftrag in normaler Sprache. Der Grünerator übersetzt ihn in konkrete Änderungen und wendet sie an. Für dich sieht das aus wie ein einziger Schritt, aber es lohnt zu wissen, was dabei passiert: Er sieht sich das Dokument an. Was gerade darin steht, ist die Grundlage — deshalb funktionieren Bezüge wie „die Spalte mit den Kosten\" oder „die Folie mit dem Zitat\". Er recherchiert, falls nötig. „Trag die aktuellen Umfragewerte ein\" heißt: erst nachsehen, dann eintragen. Er ändert das Dokument — direkt, ohne dass du etwas bestätigen musst. Änderungen des Grünerators sind keine Sonderform. Strg + Z (bzw. Cmd + Z ) nimmt sie zurück wie eine eigene Eingabe. In Präsentationen wird ein Auftrag, der mehrere Änderungen umfasst, als ein Schritt zurückgenommen; in Tabellen gilt das derzeit noch für jede Änderung einzeln, dort brauchst du also mehrere Strg + Z . Arbeitet ihr zu mehreren am selben Dokument, sehen die anderen die Änderungen live — wie bei deinen eigenen."
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Landesverband-Grüneratoren",
    "anchor": "",
    "category": "Features",
    "text": "Der Grünerator hat für mehrere Landesverbände eigene, regional getunte Grüneratoren. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sprecher*innen, den lokalen Themen und der typischen Tonalität. Im Hintergrund recherchieren sie automatisch in der Wissensdatenbank des Landesverbands (Pressemitteilungen, Beschlüsse, Wahlprogramme) und im Web. Es gibt drei Sorten von Landesverband-Grüneratoren: Öffentlichkeitsarbeit — schreibt Pressemitteilungen und Social-Media-Posts im Stil des Landesverbands. Bürger*innenanfragen — formuliert versandfertige, recherchebasierte Antwort-E-Mails auf Anfragen von Bürger*innen. Wahlprüfsteine — beantwortet Fragenkataloge von Verbänden und Initiativen, im Format des Katalogs und im Stil des Landesverbands. Die Grüneratoren, Rezepte und Notebooks eines Landesverbands sind seinen Leuten zugeteilt: Sie erscheinen, sobald du in deinem Profil die Rolle Mitarbeiter*in Landesgeschäftsstelle (Österreich: Landesorganisation) mit deinem Bundesland hinterlegt hast. Wie das geht, steht unter Für deinen Landesverband einrichten."
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Abgedeckte Landesverbände",
    "anchor": "#abgedeckte-landesverbände",
    "category": "Features",
    "text": "Jede Kachel verlinkt auf die Landesverband-Seite — sie bietet die drei Grüneratoren des Landesverbands zur Auswahl an: Öffentlichkeitsarbeit, Bürger*innenservice und Wahlprüfsteine (alle siehe unten). Darunter stehen die Rezept-Abkürzungen und ein Link zur Wissensdatenbank (Notebook). Die Grünen Österreich sind kein Landesverband, sondern die Bundespartei — sie haben aber dieselben drei Grünerator-Typen (erreichbar unter /agents/gruene-oesterreich, Wissensdatenbank /notebooks/oesterreich · @at). Diese Grüneratoren verwenden österreichisches Vokabular (Nationalrat, Klubobfrau*Klubobmann, Klimaticket) und erscheinen nur für Nutzer*innen mit österreichischer Einstellung."
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Bürger*innenanfragen beantworten",
    "anchor": "#bürgerinnenanfragen-beantworten",
    "category": "Features",
    "text": "Die Bürger*innenanfragen-Grüneratoren helfen dir, eingehende E-Mails von Bürger*innen zu beantworten. Du fügst die Anfrage ein, der Grünerator-Agent recherchiert die Positionen des Landesverbands (die Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine versandfertige Antwort-E-Mail nach festem Aufbau: Anrede → Dank → inhaltliche Antwort → weiterführende Links. Du erreichst sie über die Landesverband-Seite (z. B. /agents/gruene-berlin) — dort wählst du den Bürger*innenservice statt der Öffentlichkeitsarbeit."
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Die Wissensdatenbank dahinter",
    "anchor": "#die-wissensdatenbank-dahinter",
    "category": "Features",
    "text": "Jeder Landesverband hat ein Notebook — eine durchsuchbare Sammlung seiner offiziellen Inhalte (Pressemitteilungen, Beschlüsse, Wahlprogramme). Die LV-Grüneratoren durchsuchen es automatisch und auf den richtigen Landesverband gefiltert, du musst nichts einstellen. Du kannst dasselbe Notebook auch direkt nutzen: Aufrufen & durchstöbern: über seine Adresse, z. B. /notebooks/berlin. Im Chat als Quelle einbinden: tippe die @-Erwähnung, z. B. @berlin, @mv, @thüringen, @brandenburg, @bayern, @sachsen-anhalt, @hessen oder @saar. Der Chat zieht dann seine Antworten aus diesem Notebook. Mehr zu Notebooks allgemein findest du unter Notebooks."
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "LV-Rezepte im Überblick",
    "anchor": "#lv-rezepte-im-überblick",
    "category": "Features",
    "text": "Für diese Landesverbände gibt es eigene Rezept-Abkürzungen für Pressemitteilung und Instagram: Landesverband | Pressemitteilung | Instagram | ---------------------- | ------------------------------------------------------------------- | ----------------------- | Berlin | @presse-berlin-partei · @presse-berlin-fraktion | @insta-berlin | Mecklenburg-Vorpommern | @presse-mv-partei · @presse-mv-fraktion | @insta-mv | Thüringen | @presse-thueringen | @insta-thueringen | Brandenburg | @presse-brandenburg | @insta-brandenburg | Bayern | @presse-bayern-partei · @presse-bayern-fraktion | @insta-bayern | Hessen | @presse-hessen-partei · @presse-hessen-fraktion | @insta-hessen | Sachsen-Anhalt | @presse-sachsen-anhalt-partei · @presse-sachsen-anhalt-fraktion | @insta-sachsen-anhalt | Saarland | @presse-saarland | @insta-saarland | Wo zwei Presse-Rezepte stehen, schreibt das eine für den Landesverband und das andere für die Landtagsfraktion. Die Ebene entscheidet, an welchen Beispiel-Pressemitteilungen sich der Text ausrichtet — nimm die, für die du schreibst. Verbände mit nur einer Abkürzung führen im Korpus keine getrennten Ebenen. Unabhängig vom Landesverband gibt es allgemeine Rezepte für…"
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Pressemitteilungen & Social Media schreiben",
    "anchor": "#pressemitteilungen--social-media-schreiben",
    "category": "Features",
    "text": "Du erreichst den Öffentlichkeitsarbeit-Grünerator auf zwei Wegen: 1. Über die Landesverband-Seite — öffne die LV-Adresse (z. B. /agents/gruene-berlin) und wähle dort Öffentlichkeitsarbeit; oder wähle den Grünerator-Agent direkt in der Auswahl im Chat aus. Er bleibt für das ganze Gespräch im LV-Stil. 2. Über eine Rezept-Abkürzung — tippe im Chat @presse-berlin-partei und direkt dahinter dein Thema. Das Rezept schickt deine Anfrage an den passenden LV-Grünerator und gibt ihm gleich die richtige Aufgabe mit (Pressemitteilung bzw. Instagram-Post)."
  },
  {
    "url": "/docs/features/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Wahlprüfsteine beantworten",
    "anchor": "#wahlprüfsteine-beantworten",
    "category": "Features",
    "text": "Die Wahlprüfstein-Grüneratoren beantworten Fragenkataloge von Verbänden und Initiativen (Wahlprüfsteine): Du fügst den Katalog ein, der Grünerator-Agent recherchiert die Positionen des Landesverbands und antwortet im Format des Katalogs und im Stil des Landesverbands. Auch sie erreichst du über die Landesverband-Seite — dort wählst du Wahlprüfsteine."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Notebooks",
    "anchor": "",
    "category": "Features",
    "text": "Ein Notebook bündelt Dokumente zu einem Thema und macht ihren Inhalt im Grünerator durchsuchbar. Wie du dein erstes anlegst, steht im Guide Eigenes Notebook erstellen. Diese Seite beschreibt alles, was danach kommt: die weiteren Quellarten, das Teilen und Veröffentlichen, die Verwaltung."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Auf „Von der Basis\" listen",
    "anchor": "#auf-von-der-basis-listen",
    "category": "Features",
    "text": "Im Modus „Mit Anmeldung\" kannst du zusätzlich den Schalter „Auf ‚Von der Basis' listen\" aktivieren. Dann erscheint dein Notebook für andere auf der Wissen-Seite: in der Notebook-Reihe gibt es die Kachel „Von der Basis\", die alle so gelisteten Notebooks aufklappt. Zusätzlich taucht es in der Suche der Wissen-Seite auf, die System-Notebooks, eigene und öffentliche Notebooks gemeinsam durchsucht. Sobald du den Schalter aktivierst, musst du eine der beiden Aussagen bestätigen: „Ich besitze die Daten\" — … oder habe die Rechte zur Veröffentlichung; z.&nbsp;B. eigene Texte, Beschlüsse deines Verbands, Material, das du selbst veröffentlichen darfst. „Daten sind öffentlich verfügbar\" — z.&nbsp;B. offizielle Dokumente, Pressemitteilungen, frei zugängliche Veröffentlichungen. Ohne diese Bestätigung lässt sich das Notebook nicht listen. Hintergrund: Damit stellen wir sicher, dass nur Inhalte mit klarer Rechtelage veröffentlicht werden. Wenn du dir bei den Rechten unsicher bist, lass das Notebook privat — du kannst die Sichtbarkeit jederzeit später ändern."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Docs importieren",
    "anchor": "#docs-importieren",
    "category": "Features",
    "text": "Über die Kachel „Aus Docs importieren\" verknüpfst du eigene Docs als Quelle — sie werden beim Import in durchsuchbaren Text umgewandelt und lassen sich später per Sync aktualisieren."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Eine Website einlesen",
    "anchor": "#eine-website-einlesen",
    "category": "Features",
    "text": "Über die Kachel „Von einer Website\" bindest du die Inhalte einer WordPress-Website ein — etwa die Seite deines Kreis- oder Landesverbands. Du gibst die Adresse ein, der Grünerator sieht nach, welche Beiträge und Seiten es dort gibt, und du wählst aus, was ins Notebook soll. Rubriken lassen sich dabei gezielt an- und abwählen, statt alles auf einmal zu übernehmen. Der Import setzt voraus, dass die Website mit WordPress läuft und ihre Inhalte maschinenlesbar bereitstellt. Bei anderen Systemen bleibt der Weg über heruntergeladene Dateien. Websites, die du einmal hinterlegt hast, merkt sich dein Konto — du kannst sie später für weitere Notebooks wiederverwenden, ohne die Adresse erneut einzutragen."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Häufige Fragen",
    "anchor": "#häufige-fragen",
    "category": "Features",
    "text": "Wo schalte ich ein Notebook öffentlich? Nicht mehr in der Erstellung. Öffne das Notebook über Bearbeiten und klicke oben rechts auf „Teilen\". Wähle im Dialog die Sichtbarkeit „Mit Anmeldung\" und aktiviere „Auf ‚Von der Basis' listen\", damit es auf der Wissen-Seite unter der Kachel „Von der Basis\" und in der Suche auffindbar wird. Was passiert mit Dokumenten, wenn ich ein Notebook lösche? Die Dokumente bleiben in deiner persönlichen Dokumenten-Bibliothek erhalten — nur die Sammlung wird gelöscht. Kann ich dasselbe Dokument in mehrere Notebooks aufnehmen? Ja. Beim Bearbeiten eines Notebooks kannst du beliebige Dokumente aus deiner Bibliothek auswählen. Wie lange dauert die Indexierung? Bei Text-PDFs und reinen Textdateien meist nur Sekunden. Eingescannte PDFs (mit OCR) und sehr große Dateien können einige Minuten brauchen. Das Notebook ist trotzdem sofort nutzbar — neue Dokumente erscheinen in den Antworten, sobald die Indexierung abgeschlossen ist. Mein Dokument wird nicht akzeptiert. Prüfe die Dateiendung (PDF, DOCX, PPTX, TXT, MD, CSV, PNG, JPG, AVIF) und die Dateigröße (max. 50 MB). Andere Formate — darunter .doc, .odt und .rtf — musst du vorher als PDF oder DOCX speichern. Ein…"
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Quellen jenseits des Uploads",
    "anchor": "#quellen-jenseits-des-uploads",
    "category": "Features",
    "text": "Neben hochgeladenen Dateien kennt der Editor drei weitere Quellarten. Alle drei tragen ein „Experimentell\"-Badge: sie funktionieren, aber die Sync-Logik kann sich noch ändern."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Teilen und veröffentlichen",
    "anchor": "#teilen-und-veröffentlichen",
    "category": "Features",
    "text": "Sichtbarkeit und Veröffentlichung sind aus der Erstellung herausgelöst. Der Einstieg ist der „Teilen\"-Button: Öffne dein Notebook über Bearbeiten, dann findest du oben rechts — neben „Alle Quellen aktualisieren\" — den Button „Teilen\". Er ist nur für die Eigentümer*in sichtbar und öffnet den Dialog „Notebook teilen\", in dem du die gesamte Sichtbarkeit steuerst. (Das „Teilen\"-Untermenü im Drei-Punkte-Menü der Notebook-Übersicht ist davon getrennt: Es bietet nur „Link kopieren\" und das direkte Teilen mit einer Gruppe, aber nicht die Sichtbarkeits- und Veröffentlichungseinstellungen.) Im Dialog „Notebook teilen\" stellst du die Sichtbarkeit ein: „Privat — nur ich\" — Standard. Nur du siehst das Notebook. „Mit Gruppen geteilt\" — sichtbar für ausgewählte Gruppen. Du fügst Gruppen hinzu und legst unter „Wer darf bearbeiten?\" fest, wer Änderungen vornehmen darf (nur ich / Gruppen-Admins / alle Mitglieder). „Mit Anmeldung — alle eingeloggten Nutzer*innen\" — sichtbar für alle eingeloggten Nutzer*innen aus deinem Land."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Verwalten",
    "anchor": "#verwalten",
    "category": "Features",
    "text": "Hinter der Karte „Eigene Notebooks\" auf der Wissen-Seite erscheint jedes deiner Notebooks als Karte im Abschnitt „Eigene\". Ein Klick auf die Karte öffnet die Notebook-Detailseite, von der aus du chatten und durchsuchen kannst. Über das Drei-Punkte-Menü der Karte erreichst du weitere Aktionen: Bearbeiten — öffnet wieder den Editor (Quellen, Details, Labels, Wolke, Docs). Auf der Bearbeiten-Seite kannst du Name und Beschreibung auch direkt im Kopfbereich ändern und alle Quellen per „Alle Quellen aktualisieren\" neu synchronisieren. Teilen — Untermenü mit „Link kopieren\" und — falls du in Gruppen bist — Optionen zum direkten Teilen mit einer Gruppe. Die volle Sichtbarkeitssteuerung liegt dagegen im „Teilen\"-Button auf der Bearbeiten-Seite (siehe oben). Löschen — entfernt das Notebook unwiderruflich. Wichtig: Die enthaltenen Dokumente bleiben in deiner persönlichen Bibliothek erhalten und können in andere Notebooks aufgenommen werden."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Verwandte Themen",
    "anchor": "#verwandte-themen",
    "category": "Features",
    "text": "Wolke einbinden — Voraussetzung, um Wolke-Ordner an Notebooks zu hängen. Deine Daten im Grünerator — Hintergrund zu Notebooks für Landesverbände und Abgeordnetenbüros."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Welche Dateien hineinpassen",
    "anchor": "#welche-dateien-hineinpassen",
    "category": "Features",
    "text": "Unterstützt werden PDF, DOCX, PPTX, TXT, MD, CSV sowie Bilder (PNG, JPG, AVIF, die per Texterkennung gelesen werden) — bis zu 1.000 Dokumente pro Notebook und maximal 50 MB pro Datei. Ältere Office-Formate — .doc, .odt und .rtf — kann der Grünerator nicht lesen und nimmt sie deshalb gar nicht erst an. Öffne solche Dateien einmal in Word oder LibreOffice und speichere sie als PDF oder DOCX. Dateien in einem nicht unterstützten Format oder über 50 MB kommen gar nicht erst in die Vorschau — egal ob du sie über den Dateidialog auswählst oder per Drag & Drop ablegst. Unter der Kachel steht dann, welche Datei aus welchem Grund nicht übernommen wurde. Scheitert ein Dokument später doch noch bei der Verarbeitung — etwa ein PDF ohne erkennbaren Text —, bleibt es in der Dokumentenliste stehen und ist rot als „Nicht durchsuchbar\" markiert, mit dem Grund daneben. Über den Hinweis oberhalb der Liste entfernst du alle betroffenen Dokumente auf einmal."
  },
  {
    "url": "/docs/features/notebooks",
    "pageTitle": "Notebooks",
    "heading": "Wolke-Ordner anbinden",
    "anchor": "#wolke-ordner-anbinden",
    "category": "Features",
    "text": "Wenn du bereits einen Freigabe-Link aus der Grünen Wolke eingerichtet hast, hängst du über die Kachel „Aus der Wolke verbinden\" einen Cloud-Ordner an dein Notebook. Dokumente daraus werden automatisch importiert und mit der Wolke synchronisiert. Nach der Auswahl einer Verbindung öffnet sich ein Ordner-Browser: Du hängst entweder die ganze Freigabe an oder gezielt einen Unterordner daraus — praktisch, wenn nur ein Teil der Freigabe ins Notebook gehört. Mehrere Ordner derselben Freigabe lassen sich nebeneinander anbinden. Jede Ordner-Karte hat außerdem einen Schalter „Unterordner einbeziehen\": standardmäßig aus, dann wird nur die oberste Ebene importiert; eingeschaltet zieht der Sync auch alles aus den Unterordnern mit. Schlägt beim Sync eine Datei fehl, wird sie samt Grund benannt statt stillschweigend übersprungen. Mehr zur Einrichtung des Wolke-Links: → Wolke einbinden."
  },
  {
    "url": "/docs/features/office",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Office: Dokumente, Tabellen, Folien und Boards",
    "anchor": "",
    "category": "Features",
    "text": "Office ist der Ort für alles, was aus Text, Zahlen und Plänen besteht. Vier Arten von Dokumenten liegen dort nebeneinander: . Du findest sie über den Tab Arbeiten unter der Kachel ."
  },
  {
    "url": "/docs/features/office",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Alles ist dasselbe Dokument",
    "anchor": "#alles-ist-dasselbe-dokument",
    "category": "Features",
    "text": "Das ist der wichtigste Gedanke hinter Office, und er erspart dir viel Sucherei: ein Board, eine Tabelle, eine Präsentation und ein Textdokument sind technisch dasselbe Ding, nur mit unterschiedlicher Oberfläche. Daraus folgt einiges, das sonst überraschend wäre: Alle vier tauchen in derselben Dokumentliste auf und lassen sich in dieselben Ordner einsortieren. Freigaben funktionieren überall gleich — was du über das Teilen einer Tabelle weißt, gilt genauso für ein Board. Alle vier lassen sich zu zweit oder zu zwanzigst gleichzeitig bearbeiten. Änderungen erscheinen live bei allen anderen. Jedes hat dieselbe Chat-Seitenleiste, über die der Grünerator direkt im Dokument mitarbeitet."
  },
  {
    "url": "/docs/features/office",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Auf dem Handy",
    "anchor": "#auf-dem-handy",
    "category": "Features",
    "text": "Dokumente, Tabellen, Folien und Boards findest du in der Grünerator-App unter dem Tab Arbeiten. Alle vier öffnen dort einen Editor — nur auf zwei verschiedenen Wegen: Dokumente öffnen einen nativen Editor — mit Formatierung, Slash-Menü und Titel, gemeinsam in Echtzeit wie im Browser. Tabellen, Folien und Boards öffnen den eingebetteten Web-Editor: dieselbe Oberfläche wie im Browser, nur ohne Menüleiste drumherum. Der eingebettete Weg lädt die Web-Anwendung in die App nach — dafür braucht das Handy eine Internetverbindung."
  },
  {
    "url": "/docs/features/office",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Der Grünerator im Dokument",
    "anchor": "#der-grünerator-im-dokument",
    "category": "Features",
    "text": "In jedem Office-Dokument gibt es eine Chat-Seitenleiste. Was du dort schreibst, wirkt auf das offene Dokument: „mach die Kopfzeile fett\", „füg eine Folie zu den Kosten ein\", „sortier nach Datum\". Wie das genau funktioniert und was dabei zu beachten ist, steht unter Der Grünerator im Editor. Was in den einzelnen Dokumentarten möglich ist, steht in den jeweiligen Kapiteln: Dokumente — Text schreiben, gemeinsam bearbeiten, Versionen Tabellen — Formeln, Filter, Import und Export Präsentationen — Folien, Vortragsmodus, Export Boards — Aufgaben, Karten und automatische Spalten"
  },
  {
    "url": "/docs/features/office",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Etwas Neues anlegen",
    "anchor": "#etwas-neues-anlegen",
    "category": "Features",
    "text": "Auf der Office-Startseite liegen fünf Kacheln. Vier davon legen sofort etwas Leeres an und öffnen es — es gibt keinen Zwischenschritt, kein Formular: — ein Textdokument — eine Kalkulationstabelle — eine Foliensammlung — ein Kanban-Board Die erste, , öffnet stattdessen die Vorlagengalerie. Nimm sie, wenn du nicht bei null anfangen willst: Anträge, Pressemitteilungen und Protokolle bringen ihre Gliederung schon mit. Du musst nicht erst ein leeres Dokument anlegen. „Erstell mir eine Tabelle mit dem Haushaltsentwurf\" oder „Mach eine Präsentation zu unserem Wahlprogramm\" im Chat erzeugt das fertige Dokument direkt — inklusive Inhalt. Bearbeiten kannst du es danach wie jedes andere."
  },
  {
    "url": "/docs/features/office",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Teilen",
    "anchor": "#teilen",
    "category": "Features",
    "text": "Ein Dokument kennt Stufen von Sichtbarkeit: Sichtbarkeit | Wer kommt hinein | ----------------- | ---------------------------------------------------------- | privat | nur du und ausdrücklich eingeladene Personen | Mit Anmeldung | alle, die im Grünerator angemeldet sind und den Link haben | öffentlich | alle mit dem Link, auch ohne Anmeldung | Unabhängig davon legst du fest, ob Eingeladene lesen oder bearbeiten dürfen. Beides lässt sich jederzeit ändern und zurücknehmen. Ein öffentlich geteiltes Dokument kann jede Person mit dem Link aufrufen — auch ohne Grünerator-Konto. Prüf vor dem Umschalten, ob im Dokument Namen, Adressen oder interne Absprachen stehen."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Präsentationen",
    "anchor": "",
    "category": "Features",
    "text": "Eine Präsentation ist eine Folge von Folien mit eigenem Vortragsmodus. Du legst sie über an — oder lässt sie dir im Chat aus einem Thema erzeugen."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Aus einem Thema wird ein Foliensatz",
    "anchor": "#aus-einem-thema-wird-ein-foliensatz",
    "category": "Features",
    "text": "Das ist der eigentliche Nutzen — du fängst nicht mit einer leeren Folie an: „Mach mir eine Präsentation über unsere Verkehrspolitik für die Mitgliederversammlung, etwa zehn Folien.\" Der Grünerator recherchiert, gliedert und legt die Folien an — mit Titeln, Inhalten und Notizen für den Vortrag. Danach überarbeitest du einzelne Folien ganz normal weiter. Genauso funktioniert der Anschluss an eine Recherche: Wenn du vorher etwas nachgeschlagen hast, genügt „Mach eine Präsentation daraus\"."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Exportieren",
    "anchor": "#exportieren",
    "category": "Features",
    "text": "Über Download in der Kopfzeile stehen zwei Formate zur Wahl: Als PDF — öffnet die Präsentation in einem neuen Tab in einer druckfertigen Ansicht und dann den Druckdialog. Wähle dort als Ziel „Als PDF speichern\"; Hintergrundgrafiken sind bereits aktiviert, Querformat stellst du im Druckdialog selbst ein. Du bekommst eine Seite pro Folie, im selben Design wie im Vortragsmodus. Als PowerPoint (.pptx) — erzeugt eine bearbeitbare Datei für PowerPoint und LibreOffice Impress: Texte, Aufzählungen, Farben, Logo und Sprechernotizen bleiben erhalten. Die Datei verweist auf die Grünen-Hausschriften, kann sie aber nicht mitliefern. Auf einem Rechner ohne diese Schriften ersetzt PowerPoint sie durch eine ähnliche — der Text bleibt vollständig, das Schriftbild weicht ab. Wenn das Aussehen zählt, nimm den PDF-Weg. Wer die Präsentation nur über einen Freigabe-Link geöffnet hat, kann sie als PDF exportieren, aber nicht als .pptx."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Folien aufbauen",
    "anchor": "#folien-aufbauen",
    "category": "Features",
    "text": "Jede Folie hat ein Layout, das bestimmt, wie Titel und Inhalt angeordnet sind — insgesamt gibt es davon, von der Titelfolie über zweispaltige Folien bis zum Zitat und zum Codebeispiel. Dazu kommen pro Folie: Sprechernotizen — dein Text zum Vortrag, für das Publikum unsichtbar Hintergrund — eine Farbe, ein Bild oder ein Verlauf Schriftgröße — normalerweise „Auto\": der Text verkleinert sich so weit, dass er auf die Folie passt, statt abgeschnitten zu werden. Wird es dir zu klein oder zu groß, legst du die Größe von XS bis XL selbst fest Schrittweise aufbauen — Aufzählungspunkte erscheinen nacheinander statt auf einmal Übergang — wie die Folie die vorherige ablöst Was für die ganze Präsentation gilt — Standardübergang, Akzentfarbe, Foliennummern, automatisches Weiterschalten — stellst du einmal zentral ein."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Tabellen und Bilder",
    "anchor": "#tabellen-und-bilder",
    "category": "Features",
    "text": "Über der Folie liegt eine Leiste mit Tabelle und Bild. Eine eingefügte Tabelle bearbeitest du direkt auf der Folie; sobald der Cursor in einer Zelle steht, erscheinen die Knöpfe für Zeilen, Spalten, Kopfzeile und Löschen. Halte sie schmal — mehr als vier Spalten passen auf einer Folie nicht mehr lesbar nebeneinander. Bilder holst du aus deiner Mediathek oder lädst sie direkt hoch. Der Alternativtext ist Pflicht: ohne ihn bleibt das Bild für Screenreader stumm, und in einer veröffentlichten Präsentation ist das ein Barriere-Fehler. Auf dem Handy findest du beide Knöpfe im Bearbeiten-Fenster unter dem Textfeld."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Vortragen",
    "anchor": "#vortragen",
    "category": "Features",
    "text": "Im Präsentationsmodus läuft die Präsentation bildschirmfüllend. Du blätterst mit den Pfeiltasten; deine Notizen bleiben dabei für das Publikum unsichtbar."
  },
  {
    "url": "/docs/features/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Was der Grünerator an der Präsentation ändern kann",
    "anchor": "#was-der-grünerator-an-der-präsentation-ändern-kann",
    "category": "Features",
    "text": "Schreib in der Chat-Seitenleiste, was passieren soll. Folien sprichst du dabei über ihre Nummer an („Folie 3\") oder über ihren Inhalt („die Folie mit den Zahlen\"). Pro Auftrag führt der Grünerator bis zu Änderungen aus. Wenn du „mach den Titel von Folie 2 kürzer\" sagst, bleibt alles andere an dieser Folie unangetastet — Inhalt, Notizen, Hintergrund. Du musst nie die ganze Folie neu beschreiben, nur weil du eine Kleinigkeit ändern willst. Welche Änderungen möglich sind, stammt direkt aus dem Programmcode. Kommt eine neue Fähigkeit dazu, meldet sich die Doku-Prüfung automatisch, bis sie hier mit einem Beispielsatz beschrieben ist."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Tabellen",
    "anchor": "",
    "category": "Features",
    "text": "Eine Grünerator-Tabelle ist eine vollwertige Kalkulationstabelle: Formeln, Filter, Sortierung, Auswahllisten, bedingte Formatierung. Du legst sie über auf der Office-Startseite an — oder du lässt sie dir im Chat gleich mit Inhalt erzeugen."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Bestehende Dateien importieren",
    "anchor": "#bestehende-dateien-importieren",
    "category": "Features",
    "text": "Über Tabelle importieren kannst du vorhandene Dateien hochladen. Unterstützt sind , bis pro Datei. Die Umwandlung passiert vollständig in deinem Browser — die Datei wird dafür nicht an einen Server geschickt. Aus dem Import entsteht eine neue Grünerator-Tabelle. Die Ursprungsdatei bleibt unberührt."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Eine Tabelle mit Inhalt entstehen lassen",
    "anchor": "#eine-tabelle-mit-inhalt-entstehen-lassen",
    "category": "Features",
    "text": "Der schnellste Weg zu einer gefüllten Tabelle führt über den Chat, nicht über das leere Blatt: „Erstell mir eine Tabelle mit allen Ortsverbänden im Kreis, je einer Spalte für Ansprechperson, E-Mail und Mitgliederzahl.\" Daraus entsteht eine fertige Tabelle, die du danach ganz normal weiterbearbeitest. Genauso funktioniert es im Anschluss an eine Recherche: „Mach mir daraus eine Tabelle\" nimmt die Ergebnisse des vorherigen Schritts als Grundlage."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Exportieren",
    "anchor": "#exportieren",
    "category": "Features",
    "text": "Über das Menü lädst du die Tabelle als .xlsx herunter. Dabei gilt eine Einschränkung, die du kennen solltest: Farben, Schriftschnitte, bedingte Formatierung und Auswahllisten gehen beim Export verloren. Die Zahlen und Formeln kommen vollständig in Excel an, das Aussehen musst du dort neu setzen. Wenn das Aussehen zählt, teile stattdessen die Grünerator-Tabelle selbst per Link — dort bleibt alles erhalten."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Ordnung in großen Tabellen",
    "anchor": "#ordnung-in-großen-tabellen",
    "category": "Features",
    "text": "Filter blenden Zeilen aus, ohne sie zu löschen — praktisch, um nur einen Ortsverband anzusehen. Sortieren bringt einen Bereich in Reihenfolge, etwa nach Datum oder Betrag. Auswahllisten legen fest, was in einer Spalte stehen darf. Statt frei getippter Status-Wörter gibt es dann ein Klappmenü mit „offen\", „in Arbeit\", „erledigt\" — das hält die Spalte auswertbar. Bedingte Formatierung färbt Zellen automatisch nach einer Regel. Die Farbe folgt dem Wert und aktualisiert sich mit, wenn sich die Zahl ändert. Kommentare und Notizen hängen an einzelnen Zellen, für Rückfragen an Mitschreibende."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Rechnen",
    "anchor": "#rechnen",
    "category": "Features",
    "text": "Formeln funktionieren wie gewohnt — =SUMME(B2:B20), =MITTELWERT(C:C) — und lassen sich auch diktieren: „Rechne in D2 die Summe der Spalte B\". Wichtig ist der Unterschied zwischen Wert und Darstellung: Eine Zahl als Euro-Betrag zu formatieren ändert nur, wie sie aussieht. Der gespeicherte Wert bleibt gleich, und Rechnungen darauf stimmen weiterhin. Tabellen wandeln „01067\" gern in die Zahl 1067 um und „2-2\" in ein Datum. Sag beim Eintragen dazu, dass es Text bleiben soll: „Trag die Postleitzahlen als Text ein.\" Dann bleiben führende Nullen erhalten."
  },
  {
    "url": "/docs/features/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Was der Grünerator in der Tabelle ändern kann",
    "anchor": "#was-der-grünerator-in-der-tabelle-ändern-kann",
    "category": "Features",
    "text": "Schreib in der Chat-Seitenleiste, was passieren soll. Du musst keine Fachbegriffe treffen — die Beispielsätze unten zeigen die Formulierungen, die zuverlässig funktionieren. Pro Auftrag führt der Grünerator bis zu Änderungen aus; größere Umbauten teilst du besser auf. Änderungen des Grünerators landen im normalen Rückgängig-Verlauf. Ein Strg + Z (bzw. Cmd + Z ) nimmt sie zurück wie eine eigene Eingabe. Welche Änderungen möglich sind, stammt direkt aus dem Programmcode. Kommt eine neue Fähigkeit dazu, meldet sich die Doku-Prüfung automatisch, bis sie hier mit einem Beispielsatz beschrieben ist — und was abgeschaltet wurde, verschwindet von selbst aus der Liste."
  },
  {
    "url": "/docs/guides/einsteigerinnen/antrag-stadtrat",
    "pageTitle": "Wie erstelle ich einen Antrag für meinen Stadt- oder Gemeinderat?",
    "heading": "Wie erstelle ich einen Antrag für meinen Stadt- oder Gemeinderat?",
    "anchor": "",
    "category": "Guides",
    "text": "In etwa zehn Minuten erstellst du einen fertigen Antragsentwurf, der genau die Struktur erfüllt, die dein Gremium erwartet: Beschlussvorschlag, Sachverhalt, Begründung und finanzielle Auswirkungen."
  },
  {
    "url": "/docs/guides/einsteigerinnen/antrag-stadtrat",
    "pageTitle": "Wie erstelle ich einen Antrag für meinen Stadt- oder Gemeinderat?",
    "heading": "Fehlersuche & Qualitätssicherung",
    "anchor": "#fehlersuche--qualitätssicherung",
    "category": "Guides",
    "text": "Zu allgemeine Formulierungen? Wenn der Antrag zu vage bleibt, fehlten im Auftrag Details. Zurück zu Schritt 2: Frist, Menge, Zuständigkeit, Deckung. Fakten-Check. Paragrafen und Zahlen musst du zwingend selbst prüfen — Gemeindeordnungen unterscheiden sich je Bundesland und je Land stark, einen zitierten Paragrafen nie ungeprüft einreichen (Risiken & Gefahren). Interne Beschlusslagen. Eure eigenen lokalen Vereinbarungen kennt der Grünerator nicht. Hinterlege sie in einem Notebook, dann kann der Antrag darauf aufbauen."
  },
  {
    "url": "/docs/guides/einsteigerinnen/antrag-stadtrat",
    "pageTitle": "Wie erstelle ich einen Antrag für meinen Stadt- oder Gemeinderat?",
    "heading": "So geht's",
    "anchor": "#so-gehts",
    "category": "Guides",
    "text": "Chat starten. Nutze einfach das Eingabefeld auf der Startseite unter /start, direkt unter der Begrüßung. Für komplexere Anträge mit längerem Verlauf empfiehlt sich der Menüpunkt . Präzisen Auftrag schreiben. Die Qualität des Entwurfs hängt von deinen Angaben ab. Definiere klar: Wer soll was tun, bis wann, woher kommt das Geld und was ist der konkrete Anlass? Gib zudem die gewünschten Abschnitte an. Wichtig: Vage Formulierungen wie „Wir wollen was zu Trinkwasser\" führen zu unpräzisen Ergebnissen. Nur wenn Zieljahr, Menge und Zuständigkeit im Auftrag stehen, landen sie auch im Beschlussvorschlag — und genau über den wird abgestimmt. Verwende die Begriffe, die euer Gremium verwendet. In Österreich heißt das Gremium Gemeinderat und der Haushalt Budget oder Voranschlag. Nenne beides im Auftrag beim Namen. Beschlussvorschlag prüfen. Dies ist der einzige Teil, über den tatsächlich abgestimmt wird. Er muss in sich geschlossen und ohne den Rest des Dokuments verständlich sein: eine Handlung, eine Zuständigkeit, eine Frist. Alle Erklärungen gehören stattdessen in den Sachverhalt oder die Begründung. Ergebnis verfeinern. Nutze den Chat, um Details nachzuschärfen. Zum Beispiel: „Formuliere…"
  },
  {
    "url": "/docs/guides/einsteigerinnen/antrag-stadtrat",
    "pageTitle": "Wie erstelle ich einen Antrag für meinen Stadt- oder Gemeinderat?",
    "heading": "Weiterlesen",
    "anchor": "#weiterlesen",
    "category": "Guides",
    "text": "KI-Chat — alle Rezepte, Quellen und Werkzeuge im Überblick Was kann ich fragen? — Musterfragen zu jeder Fähigkeit"
  },
  {
    "url": "/docs/guides/einsteigerinnen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Eigenes Notebook erstellen",
    "anchor": "",
    "category": "Guides",
    "text": "In etwa zehn Minuten erstellst du ein Notebook, das eure Dokumente bündelt und ihren Inhalt im Grünerator durchsuchbar macht — für Anträge, Beschlüsse, Programme oder Pressemitteilungen. Du brauchst dafür ein paar Dateien."
  },
  {
    "url": "/docs/guides/einsteigerinnen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "So geht's",
    "anchor": "#so-gehts",
    "category": "Guides",
    "text": "Zur Wissen-Seite. Öffne Wissen (/wissen) — dort liegen alle Notebooks an einem Ort. Hast du noch keins, steht in der Notebook-Leiste die Karte „Neues erstellen\"; ein Klick öffnet den Editor. Sobald du eins besitzt, heißt die Karte „Eigene Notebooks\" und klappt den Abschnitt „Eigene\" mit dem Button „Notebook erstellen\" auf. Dateien hochladen. Der Editor führt dich durch drei Schritte: Quellen → Details → Überprüfen. Im ersten wählst du die Kachel Dateien hochladen und ziehst deine Dokumente ins Fenster oder suchst sie im Dateibrowser. Sie sammeln sich als Vorschau „Bereit zum Hochladen\", wo du einzelne wieder entfernen kannst, dann startest du mit „Hochladen\". Angenommen werden PDF, DOCX, PPTX, TXT, MD, CSV und Bilder (PNG, JPG, AVIF), bis 50 MB pro Datei. Ältere Formate wie .doc oder .odt speicherst du vorher einmal als PDF. Neben dem Upload gibt es drei weitere Quellarten — Wolke, Docs und WordPress-Websites —, die auf der Seite Notebooks beschrieben sind. Name, Beschreibung, Labels. Den Namen schlägt der Editor aus deiner ersten Datei vor; du kannst ihn überschreiben. Die Beschreibung ist optional, hilft aber später beim Wiederfinden — genau wie die bis zu zehn frei wählbaren…"
  },
  {
    "url": "/docs/guides/einsteigerinnen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Weiterlesen",
    "anchor": "#weiterlesen",
    "category": "Guides",
    "text": "Notebooks — Quellarten, Teilen, Verwaltung, häufige Fragen Wolke einbinden — Voraussetzung, um Wolke-Ordner anzuhängen Landesverband-Grüneratoren — Österreich: vorgefertigte Wissensdatenbank der Grünen Österreich"
  },
  {
    "url": "/docs/guides/einsteigerinnen/social-media-beitrag",
    "pageTitle": "Wie schreibe ich einen Social Media Beitrag?",
    "heading": "Wie schreibe ich einen Social Media Beitrag?",
    "anchor": "",
    "category": "Guides",
    "text": "In etwa fünf Minuten erstellst du einen fertigen Post für Instagram, Facebook, LinkedIn, X oder ein Reel — im Ton der Plattform, in der passenden Länge, auf Wunsch mit Sharepic."
  },
  {
    "url": "/docs/guides/einsteigerinnen/social-media-beitrag",
    "pageTitle": "Wie schreibe ich einen Social Media Beitrag?",
    "heading": "Fehlersuche & Qualitätssicherung",
    "anchor": "#fehlersuche--qualitätssicherung",
    "category": "Guides",
    "text": "Der Post klingt beliebig? Dann fehlten Angaben. Zurück zu Schritt 2: konkreter Anlass, Ort, Datum, Namen. Zahlen, Zitate und Namen prüfst du selbst — siehe Risiken & Gefahren. Kennzeichnung nicht vergessen, wenn der Beitrag KI-generiert ist: Kennzeichnungs-Guide. In Gesprächen von vor August 2026 steht ein Social-Media-Post in einer eigenen Karte mit dem Kennzeichen Experimentell. Diese Karten kannst du weiterhin im Chat überarbeiten. Neu geschriebene Posts kommen als normaler Text — den Weg über die Karte gibt es nicht mehr."
  },
  {
    "url": "/docs/guides/einsteigerinnen/social-media-beitrag",
    "pageTitle": "Wie schreibe ich einen Social Media Beitrag?",
    "heading": "So geht's",
    "anchor": "#so-gehts",
    "category": "Guides",
    "text": "Chat starten. Nutze einfach das Eingabefeld auf der Startseite unter /start, direkt unter der Begrüßung. Für längere Gespräche mit Verlauf empfiehlt sich der Menüpunkt . Präzisen Auftrag schreiben. Der Post kann nur so konkret werden wie deine Angaben. Nenne Anlass, Ort, Uhrzeit, wer kommt, was es gibt — und für wen du schreibst. Wichtig: Dass „Instagram-Beitrag\" im Auftrag steht, genügt — die Plattform musst du nicht extra auswählen. „Schreib was zum Stadtfest\" liefert dagegen Floskeln: Uhrzeit, Adresse und Namen erfindet der Grünerator nicht. Ergebnis verfeinern. „Kürzer\", „weniger Emojis\", „anderer Einstieg\" — die Angaben musst du dabei nicht wiederholen. Bild dazuholen. „Mach ein Sharepic daraus\" oder @sharepic. Zum Feinschliff öffnet sich der Editor, der Text bleibt erhalten."
  },
  {
    "url": "/docs/guides/einsteigerinnen/social-media-beitrag",
    "pageTitle": "Wie schreibe ich einen Social Media Beitrag?",
    "heading": "Weiterlesen",
    "anchor": "#weiterlesen",
    "category": "Guides",
    "text": "KI-Chat — alle Rezepte, Quellen und Werkzeuge im Überblick Was kann ich fragen? — Musterfragen zu jeder Fähigkeit"
  },
  {
    "url": "/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Eigene Grüneratoren erstellen",
    "anchor": "",
    "category": "Guides",
    "text": "Du kannst dir im Grünerator deine eigenen Grüneratoren bauen — ganz ohne technische Vorkenntnisse. Es gibt zwei Wege: per Beschreibung (die KI erstellt einen Entwurf) oder manuell über das Formular. Noch in der Erprobung: Verhalten und Funktionen können sich ändern. Melde Probleme gern dem Team."
  },
  {
    "url": "/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 1: Den Creator öffnen",
    "anchor": "#schritt-1-den-creator-öffnen",
    "category": "Guides",
    "text": "Öffne die Agentura, scrolle zum Abschnitt Meine Grüneratoren und klicke oben rechts auf Neuer Grünerator. Alternativ rufst du den Creator direkt unter /agents/new auf."
  },
  {
    "url": "/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 2: Agent beschreiben (empfohlen)",
    "anchor": "#schritt-2-agent-beschreiben-empfohlen",
    "category": "Guides",
    "text": "Beschreibe in eigenen Worten, was er können soll — Zweck, Ton, Fähigkeiten. Zum Einstieg kannst du eines der Beispiele anklicken: 📰 Pressestelle, 🚲 Recherche-Bot oder 📣 Social Media. Mit Enter baut der Grünerator daraus einen Entwurf und öffnet den Editor mit vorausgefüllten Feldern. Klicke auf „Lieber manuell anlegen?\", um den Editor mit leerem Formular zu öffnen (entspricht der Adresse /agents/new/manual)."
  },
  {
    "url": "/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 3: Im Editor anpassen",
    "anchor": "#schritt-3-im-editor-anpassen",
    "category": "Guides",
    "text": "Links das Formular, rechts eine Live-Vorschau. Die Felder liegen in drei Tabs. Grundlagen — die drei Pflichtfelder: Name (samt Symbol aus dem Icon-Picker), Beschreibung (ein Satz, was er macht) und Anleitung — die eigentliche Anweisung an die KI, z. B. beginnend mit „Du bist ein*e …\", mindestens 10 Zeichen. Werkzeuge — was er können soll: Ein markiert die beiden, die ab Werk aktiv sind. Darunter steht Quell-Links direkt im Antworttext — für versandfertige E-Mails und Briefe: Artikel-URLs aus der Recherche erscheinen dann inline statt nur als Quellen-Karten. Wissen — welche Notebooks er automatisch durchsucht, Mehrfachauswahl möglich: Grünerator-Notebooks und, sobald du eigene hast, Meine Notebooks. Optional aufklappbar: Begrüßung & Startfragen (Begrüßungstext und Beispielfragen, eine pro Zeile) sowie Erweiterte Einstellungen (Region de-DE/de-AT, Tags, Modell). Richte vorher ein Notebook mit euren Dokumenten ein. Wählst du es unter Wissen aus, antwortet dein Agent ausschließlich aus euren Quellen — mit nachprüfbaren Belegen."
  },
  {
    "url": "/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 4: Speichern und nutzen",
    "anchor": "#schritt-4-speichern-und-nutzen",
    "category": "Guides",
    "text": "Speichern oben rechts wird aktiv, sobald die drei Pflichtfelder stehen. Danach landest du auf der Bearbeitungsseite und öffnest ihn von dort über Im Chat öffnen. Ändern kannst du ihn jederzeit über das Stift-Symbol auf seiner Karte."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Wolke einbinden",
    "anchor": "",
    "category": "Guides",
    "text": "Die Grüne Wolke ist unser sicherer Cloud-Speicher für alle grünen Organisationen. Über einen öffentlichen Freigabe-Link kann der Grünerator deine Wolke-Dateien lesen: Du kannst Ordner durchstöbern, Dateien in Notebooks importieren, Dokumente aus der Wolke in den Docs-Editor holen und Dateien im Chat erwähnen. Der Zugriff ist ausschließlich lesend — der Grünerator schreibt, ändert und löscht nichts in deiner Wolke."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Häufige Probleme und Lösungen",
    "anchor": "#häufige-probleme-und-lösungen",
    "category": "Guides",
    "text": "Falls die Verbindung nicht klappt, prüfe, ob der Link über „Öffentlichen Link erstellen\" erzeugt wurde, ob der Ordner noch existiert und ob der Link passwortgeschützt ist — passwortgeschützte Links kann der Grünerator nicht öffnen. Öffne die Grüne Wolke und folge der Anleitung Schritt für Schritt."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Im Chat",
    "anchor": "#im-chat",
    "category": "Guides",
    "text": "Sobald eine Verbindung steht, kann der Chat damit arbeiten, ohne dass du erst eine Datei aussuchst. Frag einfach: „Welche Wolke-Ordner habe ich?\", „Was liegt in Anträge?\", „Such mir die Datei mit Parteitag im Namen\" oder „Lies mir rede.pdf vor\" — Zitate aus der Datei erscheinen wie bei jeder anderen Quelle. Du kannst auch eine neue Verbindung direkt im Chat anlegen: füge den Freigabe-Link in eine Nachricht ein — oder häng ihn über @link an. Der Grünerator prüft ihn zuerst und fragt dich dann, ob er ihn hinzufügen soll — gespeichert wird nichts, bevor du zustimmst. Über @wolke bleibt daneben die Dateiauswahl im Eingabefeld, wenn du genau eine bestimmte Datei anhängen willst. Auch hier gilt der Zugriff von oben: Der Chat liest, listet und sucht — er legt nichts an, ändert nichts und löscht nichts in deiner Wolke. Und er sieht ausschließlich das, was in den freigegebenen Ordnern liegt; deine übrige Wolke bleibt unsichtbar."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 1: Ordner auswählen",
    "anchor": "#schritt-1-ordner-auswählen",
    "category": "Guides",
    "text": "Öffne die Grüne Wolke in einem neuen Tab, melde dich an und wähle den Ordner aus, dessen Inhalte du im Grünerator nutzen möchtest. Ein eigener Ordner wie \"Grünerator\" oder \"Teilen\" hilft dabei, den Zugriff überschaubar zu halten — der Grünerator sieht nur, was in dem freigegebenen Ordner liegt."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 2: Öffentlichen Link erstellen",
    "anchor": "#schritt-2-öffentlichen-link-erstellen",
    "category": "Guides",
    "text": "Wähle den Ordner aus und klicke rechts auf „Teilen\". Klicke dann unten auf „Öffentlichen Link erstellen\", um einen Freigabe-Link zu generieren. Die Standard-Berechtigung „Nur anzeigen\" genügt — mehr Rechte braucht der Grünerator nicht."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 3: Link kopieren und verwenden",
    "anchor": "#schritt-3-link-kopieren-und-verwenden",
    "category": "Guides",
    "text": "Der öffentliche Link wurde erstellt! Im Grünerator führt dich unter Einstellungen → Wolke (erreichbar über das Konto-Menü am unteren Rand der Seitenleiste) ein Einrichtungs-Assistent Schritt für Schritt durch die Verbindung: Link einfügen, optional benennen — der Grünerator testet die Verbindung dann automatisch und zeigt dir bei Problemen konkrete Lösungshinweise. Der Link sollte etwa so aussehen: https://wolke.netzbegruenung.de/s/AbCdEfGhIj"
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Was du benötigst",
    "anchor": "#was-du-benötigst",
    "category": "Guides",
    "text": "Für die Einrichtung brauchst du Zugang zur Grünen Wolke unter wolke.netzbegruenung.de, einen Ordner mit den Dateien, die der Grünerator sehen soll, und etwa 5 Minuten Zeit."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Weitere Tipps für die Nutzung",
    "anchor": "#weitere-tipps-für-die-nutzung",
    "category": "Guides",
    "text": "Organisiere deine Dateien in thematischen Ordnern und nutze aussagekräftige Namen — etwa \"Anträge\", \"Pressemitteilungen\" oder \"Reden\". So findet der Grünerator (und du) die richtigen Dokumente schneller, zum Beispiel beim Import in ein Notebook oder beim Erwähnen einer Datei im Chat."
  },
  {
    "url": "/docs/guides/fortgeschrittene/gruene-wolke-einbinden",
    "pageTitle": "Wolke einbinden",
    "heading": "Wichtige Hinweise",
    "anchor": "#wichtige-hinweise",
    "category": "Guides",
    "text": "Der Grünerator greift nur lesend auf deine Wolke zu. Ein Link mit der Berechtigung „Nur anzeigen\" reicht deshalb aus; bestehende Verbindungen mit „Kann bearbeiten\" funktionieren weiter, du kannst die Berechtigung in der Wolke aber bedenkenlos auf „Nur anzeigen\" zurückstellen. Der Link darf nicht passwortgeschützt sein. Er funktioniert auch ohne Ablaufdatum, und du kannst ihn in der Wolke jederzeit deaktivieren — damit endet auch der Zugriff des Grünerators. Beachte: Ein öffentlicher Freigabe-Link ist für alle nutzbar, die ihn kennen. Teile ihn nur dort, wo das in Ordnung ist, und gib nur Ordner frei, deren Inhalte dafür geeignet sind."
  },
  {
    "url": "/docs/guides/intro",
    "pageTitle": "Guides",
    "heading": "Guides",
    "anchor": "",
    "category": "Guides",
    "text": "Guides sind kurze Anleitungen für eine konkrete Aufgabe: „Wie schreibe ich einen Social Media Beitrag?\", „Wie erstelle ich einen Antrag für meinen Stadtrat?\". Jeder Guide führt dich in wenigen Schritten zum Ergebnis und ist in ein paar Minuten durchgearbeitet. Der Unterschied zum Rest der Doku: Die Bereiche Chat, Office oder Features beschreiben, was es gibt — alle Rezepte, alle Werkzeuge, alle Schalter. Ein Guide beschreibt, was du tust, und lässt alles weg, was du dafür nicht brauchst. Am Ende jedes Guides stehen die Verweise für alles Weitere."
  },
  {
    "url": "/docs/guides/intro",
    "pageTitle": "Guides",
    "heading": "Wie die Guides sortiert sind",
    "anchor": "#wie-die-guides-sortiert-sind",
    "category": "Guides",
    "text": "Nach Erfahrungsstand — das ist die Ordnerstruktur in der Seitenleiste: Einsteiger*innen — die ersten Aufgaben, ohne Vorwissen. Weitere Stufen kommen dazu, sobald es Guides dafür gibt. Nach Aufgabenfeld — das sind die Schlagwörter unter jeder Überschrift (kommunikation, gremienarbeit, wissen, verwaltung). Ein Klick darauf zeigt alle Guides zu diesem Feld, quer über alle Erfahrungsstufen. Der Grünerator kennt seine eigene Doku. Tippe @doku im Chat und stell deine Frage — er antwortet mit Verweis auf die passende Stelle."
  },
  {
    "url": "/docs/guides/landesverbaende/landesverband-einrichten",
    "pageTitle": "Für deinen Landesverband einrichten",
    "heading": "Für deinen Landesverband einrichten",
    "anchor": "",
    "category": "Guides",
    "text": "Wenn du in einer Landesgeschäftsstelle arbeitest, kann der Grünerator mehr als generisch-grün schreiben: Er kennt die Pressemitteilungen, Beschlüsse und Wahlprogramme deines Landesverbands, schreibt in eurem Stil und schlägt eure Vorlagen vor. Dafür musst du ihm einmal sagen, wo du arbeitest. Das dauert eine Minute und ist alles, was nötig ist — danach passiert der Rest von allein."
  },
  {
    "url": "/docs/guides/landesverbaende/landesverband-einrichten",
    "pageTitle": "Für deinen Landesverband einrichten",
    "heading": "Noch persönlicher",
    "anchor": "#noch-persönlicher",
    "category": "Guides",
    "text": "Drei Stellschrauben, die unabhängig vom Landesverband für dich arbeiten: Einstellungen → Personalisierung → Anweisungen — kurze Hinweise, die bei jeder Antwort mitlaufen („Duze die Leser*innen und schreibe knapp.“). Einstellungen → Erinnerungen — was sich der Grünerator aus euren Gesprächen merken darf. Einstellungen → Hintergrund und Allgemein — Aussehen und Startseite. Alles gilt für dein Konto, also auf allen Geräten, an denen du angemeldet bist. Mehr dazu unter Einstellungen."
  },
  {
    "url": "/docs/guides/landesverbaende/landesverband-einrichten",
    "pageTitle": "Für deinen Landesverband einrichten",
    "heading": "Schritt 1: Deine Rolle eintragen",
    "anchor": "#schritt-1-deine-rolle-eintragen",
    "category": "Guides",
    "text": "Öffne die Einstellungen — über dein Profilbild unten in der Seitenleiste oder direkt über /settings. Geh zu Personalisierung. Wenn du den Grünerator zum ersten Mal benutzt, ist das gleich der erste Schritt der Einrichtung („Was machst du bei den Grünen?“). Unter Deine Rollen auf Hinzufügen. Wähle nacheinander: Ebene: Land Bundesland: dein Landesverband Rolle: Mitarbeiter*in Landesgeschäftsstelle (in Österreich: Mitarbeiter*in Landesorganisation) Der Assistent zeigt dir zum Schluss, was diese Rolle freischaltet — zum Beispiel „3 Agenten und 3 Rezepte sowie das Notebook Hessen erscheinen künftig in deiner Agentur und im Chat“. Speichern, fertig. Danach steht unter deinen Rollen ein Knopf „Zu deinem Landesverband“, der dich direkt in dein neues Regal bringt. Die Inhalte eines Landesverbands hängen an der Geschäftsstellen-Rolle und nur an ihr. Landtagsfraktion, MdL-Büro, Kreisverband oder Ortsverband geben zwar auch ein Bundesland an, schalten die LV-Grüneratoren aber nicht frei — sie sind das Material eines bestimmten Landesverbands, kein allgemeiner Bestand. Umgekehrt gilt: Ohne passende Rolle siehst du die LV-Inhalte nicht. Das ist Absicht und kein Fehler — vor der Zuteilung stand…"
  },
  {
    "url": "/docs/guides/landesverbaende/landesverband-einrichten",
    "pageTitle": "Für deinen Landesverband einrichten",
    "heading": "Schritt 2: Was du jetzt hast",
    "anchor": "#schritt-2-was-du-jetzt-hast",
    "category": "Guides",
    "text": "Ein eigenes Regal in der Agentura. Unter Dein Landesverband stehen die drei Grüneratoren deines Verbands — Öffentlichkeitsarbeit, Bürger*innenanfragen und Wahlprüfsteine — und darunter eure Rezepte, überschrieben mit dem Namen deines Landesverbands. Eure Rezepte im Chat. Die Presse- und Instagram-Rezepte deines Landesverbands tauchen jetzt in der Rezept-Liste des Chats auf und lassen sich mit @ erwähnen, etwa @presse-hessen-partei oder @insta-hessen. Welche es je Landesverband gibt, steht unter Landesverband-Grüneratoren. Euer Notebook. Die Wissensdatenbank deines Landesverbands (Pressemitteilungen, Beschlüsse, Wahlprogramme) erscheint in der Auswahl und lässt sich im Chat als Quelle erwähnen. Und die Automatik: Bittest du den Chat einfach um „eine Pressemitteilung zu …“, nimmt er von selbst eure Vorlage statt der allgemeinen. Du musst dafür nichts erwähnen und nichts einstellen — die Rolle in deinem Profil genügt. Das gilt im normalen Chat genauso wie dann, wenn du gerade in einer Rolle aus der Auswahlliste schreibst. Rollen, die du selbst formuliert hast, statt sie aus der Liste zu wählen, bringen ihre eigene Beschreibung mit — und die hat dann Vorrang vor der Automatik. Solange…"
  },
  {
    "url": "/docs/guides/landesverbaende/landesverband-einrichten",
    "pageTitle": "Für deinen Landesverband einrichten",
    "heading": "Wenn nichts erscheint",
    "anchor": "#wenn-nichts-erscheint",
    "category": "Guides",
    "text": "Dein Bundesland ist nicht dabei. Nicht jeder Landesverband hat eigene Grüneratoren, und einzelne haben sich gegen ein eigenes Notebook entschieden. Welche Landesverbände abgedeckt sind, steht aktuell auf der Seite Landesverband-Grüneratoren. Ist deiner nicht dabei, bleibt der Assistent stumm und verspricht nichts — die allgemeinen Rezepte (@presse, @instagram, @facebook, …) stehen dir wie allen anderen offen. Du hast die Rolle gerade erst angelegt. Das Regal erscheint, sobald die Einstellungen gespeichert sind; ein Neuladen der Seite hilft, wenn ein Tab schon länger offen stand. In der App genügt es, sie einmal neu zu starten. --- Was ihr mit den drei Grüneratoren jeweils machen könnt — Pressemitteilungen, Bürger*innenanfragen, Wahlprüfsteine — steht ausführlich unter Landesverband-Grüneratoren."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Grünerator für Chrome",
    "anchor": "",
    "category": "Integrationen",
    "text": "Der Grünerator für Chrome ist eine Browser-Erweiterung, die Aufgaben auf Webseiten für dich erledigt: suchen, blättern, anklicken, Formulare ausfüllen, Inhalte heraussuchen. Du beschreibst in einem Seitenpanel, was passieren soll — die Erweiterung arbeitet im gerade geöffneten Tab, so als würdest du selbst klicken. Die Erweiterung ist noch nicht im Chrome Web Store und spricht derzeit mit beta.gruenerator.eu. Oberfläche und Verhalten können sich noch ändern."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "1. Installieren",
    "anchor": "#1-installieren",
    "category": "Integrationen",
    "text": "Solange die Erweiterung nicht im Web Store steht, installierst du sie aus einem Ordner: ZIP-Datei herunterladen und entpacken. Der entpackte Ordner muss liegen bleiben — Chrome lädt die Erweiterung bei jedem Start von dort. In Chrome chrome://extensions öffnen. Oben rechts den Entwicklermodus einschalten. Auf Entpackte Erweiterung laden klicken und den entpackten Ordner auswählen. Im Puzzle-Symbol der Symbolleiste den Grünerator anpinnen — dann ist er einen Klick entfernt. Ein Klick auf das Grünerator-Symbol öffnet das Seitenpanel am rechten Bildschirmrand. Dort spielt sich alles Weitere ab. Chrome verlangt ihn für jede Erweiterung, die nicht aus dem Web Store kommt. Die Erweiterung bringt einen festen Schlüssel mit, deshalb bleibt ihre Kennung über Neuinstallationen hinweg gleich — die Anmeldung funktioniert auch in dieser Fassung."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "2. Anmelden",
    "anchor": "#2-anmelden",
    "category": "Integrationen",
    "text": "Beim ersten Öffnen zeigt das Seitenpanel „Willkommen beim Grünerator für Chrome!\". Auf Mit Grünerator anmelden klicken. Chrome öffnet ein Anmeldefenster. Melde dich wie gewohnt an und bestätige den Zugriff. Das Fenster schließt sich von selbst, das Seitenpanel wechselt zur Eingabe. Es gibt nichts zu kopieren und einzufügen: Die Anmeldung läuft über denselben Weg wie „Mit Google anmelden\", und auf dem Gerät bleibt nur ein Zugriffstoken liegen — kein Passwort. Schließt du das Fenster vorzeitig, meldet die Erweiterung „Anmeldung abgebrochen\". Dann einfach noch einmal klicken."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "3. Die erste Aufgabe",
    "anchor": "#3-die-erste-aufgabe",
    "category": "Integrationen",
    "text": "Unter dem Eingabefeld stehen drei fertige Vorlagen: Vorlage | Wozu | -------------------------------------------- | --------------------------------------------------------------------- | 📋 Anträge einer Sitzung sammeln | Titel, Antragsteller und Links von einer Sitzungsseite zusammentragen | 🗳️ Wahlprogramm nach einem Thema durchsuchen | Passende Abschnitte samt Textstelle heraussuchen | 📰 Pressespiegel bauen | Aktuelle Meldungen zu einem Thema mit Quelle, Datum und Link sammeln | Ein Klick lädt die Vorlage ins Eingabefeld — dort passt du sie an und schickst sie ab. Eigene Vorlagen legst du an, indem du im Verlauf eine Sitzung über Sitzung merken ablegst."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Anhalten, weiterfragen, wiederholen",
    "anchor": "#anhalten-weiterfragen-wiederholen",
    "category": "Integrationen",
    "text": "Anhalten stoppt eine laufende Aufgabe sofort. Ist eine Aufgabe fertig, kannst du einfach weiterschreiben — die Nachfrage läuft in derselben Sitzung weiter und kennt den bisherigen Verlauf. Über die Symbole oben im Panel startest du einen neuen Chat oder öffnest den Verlauf. Im Verlauf lässt sich jede Sitzung löschen oder als Vorlage merken."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Aufgaben, die gut funktionieren",
    "anchor": "#aufgaben-die-gut-funktionieren",
    "category": "Integrationen",
    "text": "Die Erweiterung arbeitet Schritt für Schritt. Aufgaben gelingen deshalb besser, wenn du drei Dinge nennst: Wo es losgeht — „Öffne gruene.de\" oder einfach die Seite vorher aufschlagen. Was zu tun ist — „Suche die Abschnitte zum Thema Verkehr\". Wie das Ergebnis aussehen soll — „Gib mir je Fundstelle Titel, Link und zwei Sätze Zusammenfassung\". Die Aufgabe startet immer im aktiven Tab. Steht dort noch die leere Startseite, muss der Agent erst dorthin navigieren — das kostet Schritte. Öffne die Seite vorher, wenn du sie kennst."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Dateien mitgeben",
    "anchor": "#dateien-mitgeben",
    "category": "Integrationen",
    "text": "Über die Büroklammer hängst du Textdateien an: .txt, .md, .markdown, .json, .csv, .log, .xml, .yaml, .yml. Pro Datei sind 1 MB möglich, mehrere Dateien gleichzeitig sind erlaubt. Andere Formate — etwa PDF oder DOCX — nimmt die Erweiterung nicht an; für die ist der Chat auf gruenerator.eu der richtige Ort."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Einstellungen im Detail",
    "anchor": "#einstellungen-im-detail",
    "category": "Integrationen",
    "text": "Der Reiter Allgemein steuert, wie ausdauernd und wie gründlich der Agent arbeitet: Einstellung | Voreinstellung | Bedeutung | ---------------------------- | -------------- | ----------------------------------------------------------------------------------- | Schritte je Aufgabe | 100 | Obergrenze, danach bricht die Aufgabe ab | Aktionen je Schritt | 5 | wie viel der Navigator in einem Zug erledigen darf | Fehlertoleranz | 3 | Fehler hintereinander, bevor abgebrochen wird | Bilderkennung | aus | das Modell sieht die Seite zusätzlich als Bild — bessere Ergebnisse, mehr Verbrauch | Elemente hervorheben | an | markiert Knöpfe, Links und Felder sichtbar auf der Seite | Neuplanung | 3 | nach wie vielen Schritten der Planner das Vorgehen überdenkt | Wartezeit nach dem Laden | 250 ms | Mindestpause, bevor eine frisch geladene Seite ausgewertet wird | Frühere Aufgaben wiederholen | aus | speichert die Schritte und spielt sie erneut ab (Versuchsbetrieb) | Schaltest du die Bilderkennung ein, wird Elemente hervorheben automatisch mit eingeschaltet — die Markierungen sind es, an denen sich das Modell im Bildschirmfoto orientiert."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Firewall",
    "anchor": "#firewall",
    "category": "Integrationen",
    "text": "Im Reiter Firewall legst du fest, welche Adressen der Agent überhaupt anfassen darf. Trage Domains ohne https:// ein, also example.com, localhost oder 127.0.0.1. Sind beide Listen leer, ist jede Adresse erlaubt. Die Sperrliste hat Vorrang: Passt eine Adresse auf einen Eintrag, ist sie blockiert. Ist die Erlaubnisliste leer, ist alles erlaubt, was nicht gesperrt ist. Steht dort etwas, sind nur noch passende Adressen erlaubt. Platzhalter () werden noch nicht unterstützt. Die Erlaubnisliste ist das schärfere Werkzeug: Ein einziger Eintrag sperrt das gesamte übrige Netz aus."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Grenzen",
    "anchor": "#grenzen",
    "category": "Integrationen",
    "text": "Der Agent ist ein Sprachmodell mit Fernbedienung, kein zuverlässiger Automat. Er verliest sich, klickt daneben und behauptet gelegentlich, etwas erledigt zu haben, das er nicht erledigt hat. Prüfe jedes Ergebnis, bevor du damit weiterarbeitest — besonders bei Zahlen, Zitaten und Links. Warum das so ist und woran man es erkennt, steht unter Risiken und Gefahren von LLMs."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Modell wählen",
    "anchor": "#modell-wählen",
    "category": "Integrationen",
    "text": "Unter Einstellungen → Modelle wählst du für Navigator und Planner getrennt eine Stufe: Stufe | Wofür | ---------- | ------------------------------------------------- | Klein | am schnellsten, für kurze und eindeutige Aufgaben | Mittel | die Voreinstellung — der gute Mittelweg | Ultra | für lange Aufgaben mit vielen Schritten | Welches Modell hinter einer Stufe läuft, entscheidet der Grünerator. Deine Auswahl bleibt gültig, auch wenn sich das ändert — du musst nichts nachziehen. Mehr dazu: KI-Modelle im Grünerator."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Und jetzt?",
    "anchor": "#und-jetzt",
    "category": "Integrationen",
    "text": "Der Grünerator lässt sich auch andersherum einbinden: in ChatGPT, Claude und Le Chat. Externe Dienste in den Chat holen: Konnektoren. Für alles, was kein Browser sein muss, ist der Chat auf gruenerator.eu der schnellere Weg."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Was die Erweiterung sieht — und was nicht",
    "anchor": "#was-die-erweiterung-sieht--und-was-nicht",
    "category": "Integrationen",
    "text": "Damit ein Modell entscheiden kann, was als Nächstes zu tun ist, geht der aktuelle Seitenzustand an den Grünerator: die Struktur der bedienbaren Elemente, sichtbarer Text und — nur bei eingeschalteter Bilderkennung — ein Bildschirmfoto. Das ist keine Nebenwirkung, sondern die Funktion: ohne Seiteninhalt gibt es nichts zu entscheiden. Auf dem Gerät bleiben dagegen: Chatverlauf, Vorlagen, Einstellungen und dein Zugriffstoken. Sie liegen im lokalen Speicher des Browsers und werden nicht synchronisiert. Die Erweiterung enthält keine Telemetrie — keine besuchten Domains, keine Aufgabendauern, keine anonyme Kennung. Und sie liest keine Zugangsdaten oder Cookies der besuchten Seiten aus."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Was du brauchst",
    "anchor": "#was-du-brauchst",
    "category": "Integrationen",
    "text": "Chrome oder Edge. Firefox und Safari werden nicht unterstützt. Ein Grünerator-Konto — dasselbe wie auf gruenerator.eu. Einen eigenen API-Schlüssel brauchst du nicht. Die Erweiterung spricht ausschließlich mit dem Grünerator; ein Feld für einen anderen Anbieter gibt es nicht."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Wenn etwas klemmt",
    "anchor": "#wenn-etwas-klemmt",
    "category": "Integrationen",
    "text": "Nach der Anmeldung steht immer noch der Willkommensbildschirm. Öffne Einstellungen → Modelle. Steht dort „Angemeldet\", ist alles in Ordnung — schließe das Seitenpanel und öffne es erneut. Steht dort ein Anmeldeknopf, hat die Anmeldung nicht durchgetragen; versuche es dort noch einmal. Auf der Seite passiert gar nichts. Auf chrome://-Seiten, im Web Store und in der Einstellungsoberfläche von Chrome darf keine Erweiterung arbeiten — das sperrt der Browser selbst. Prüfe außerdem die Firewall. Die Aufgabe bricht mit „maximale Schrittzahl erreicht\" ab. Entweder die Aufgabe ist zu groß — dann teile sie —, oder der Agent dreht sich im Kreis. Ein höherer Wert bei Schritte je Aufgabe hilft nur, wenn er sonst wirklich vorankommt. Der Agent klickt das Falsche. Schalte die Bilderkennung ein. Bei dicht gebauten Seiten hilft es, wenn das Modell die Anordnung sieht statt nur die Struktur. Der Agent bricht mehrfach hintereinander ab. Die Fehlertoleranz steht auf 3. Bei langsamen Seiten lohnt sich zusätzlich eine höhere Wartezeit nach dem Laden."
  },
  {
    "url": "/docs/integrationen/chrome-erweiterung",
    "pageTitle": "Grünerator für Chrome",
    "heading": "Wie die Erweiterung arbeitet",
    "anchor": "#wie-die-erweiterung-arbeitet",
    "category": "Integrationen",
    "text": "Hinter dem Seitenpanel stecken zwei Agenten — im Gesprächsverlauf erkennst du sie an ihren Namen: Navigator — führt aus. Er klickt, tippt, blättert, wechselt Tabs und liest die Seite. Er läuft in jedem Schritt. Planner — legt das Vorgehen fest und prüft den Fortschritt. Er läuft standardmäßig alle drei Schritte und immer dann, wenn der Navigator meldet, er sei fertig. Was der Navigator auf einer Seite tun kann: bei Google suchen, Adressen öffnen, zurückgehen, Elemente anklicken, Text eingeben, Tabs öffnen, wechseln und schließen, scrollen (auch gezielt zu einer Textstelle), Tastenkürzel senden, Auswahllisten lesen und auswählen, Gefundenes zwischenspeichern und warten. Er benutzt deinen Browser mit deinen Anmeldungen. Wo du eingeloggt bist, ist er es auch — und er handelt mit deinen Rechten. Lass ihn nicht unbeaufsichtigt auf Seiten laufen, auf denen etwas Verbindliches passieren kann (Bezahlvorgänge, Verwaltungsoberflächen, Mitgliederdaten)."
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Grünerator in ChatGPT & Co nutzen",
    "anchor": "",
    "category": "Integrationen",
    "text": "Du kannst den Grünerator direkt in ChatGPT, Claude, Mistral Le Chat oder OpenWebUI verwenden — ohne gruenerator.eu öffnen zu müssen. Dein KI-Assistent durchsucht dann grüne Parteiprogramme, findet Positionen zu Themen und greift auf deine eigenen Grünerator-Inhalte zu: Dokumente, Boards, Notebooks, Projekte. MCP (Model Context Protocol) ist ein offener Standard, über den KI-Chatbots auf externe Datenquellen zugreifen können — hier sorgt es dafür, dass dein Chat-Assistent den Grünerator nutzen kann."
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "ChatGPT",
    "anchor": "#chatgpt",
    "category": "Integrationen",
    "text": "Öffne chatgpt.com und logge dich ein. Klicke oben rechts auf dein Profil → Settings. Wähle in der Sidebar Connectors. Aktiviere unter Advanced den Developer Mode, damit du eigene Verbindungen hinzufügen kannst. Klicke auf Create bzw. Add custom connector. Trage folgende Daten ein: Name: Grünerator URL: https://mcp.gruenerator.eu Authentication: OAuth — Client-ID und Client Secret leer lassen Speichern. ChatGPT leitet dich zur Grünerator-Anmeldung und anschließend auf die Zustimmungsseite. Fertig — der Grünerator steht nun in normalen Chats und in Deep Research als Datenquelle zur Verfügung. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Claude",
    "anchor": "#claude",
    "category": "Integrationen",
    "text": "Öffne claude.ai und logge dich ein. Klicke oben rechts auf dein Profil → Settings. Gehe in der linken Sidebar auf Integrations. Klicke auf Add integration. Trage folgende Daten ein: Name: Grünerator URL: https://mcp.gruenerator.eu Speichern und auf Connect klicken — melde dich an und stimme zu. Fertig! Claude nutzt den Grünerator nun automatisch, wenn es zu deiner Anfrage passt. Du kannst die Verbindung auch manuell im Chat aktivieren, indem du sie in der Tool-Auswahl anhakst. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Mistral Le Chat",
    "anchor": "#mistral-le-chat",
    "category": "Integrationen",
    "text": "Öffne chat.mistral.ai und logge dich ein. Gehe in der linken Sidebar auf Connectors (oder über Profil → Settings → Connectors). Klicke auf Add Connector. Wähle den Tab Custom MCP Connector. Trage folgende Daten ein: Name: Grünerator URL: https://mcp.gruenerator.eu Auth: OAuth Speichern, anmelden, zustimmen. Im Chat die Verbindung aktivieren: In der Seitenleiste unter Connectors den Grünerator anhaken, oder im Prompt /Grünerator eingeben, um ihn als Tool zu aktivieren. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "OpenWebUI (für Fortgeschrittene)",
    "anchor": "#openwebui-für-fortgeschrittene",
    "category": "Integrationen",
    "text": "OpenWebUI ist eine selbst gehostete Chat-Oberfläche, die viele verschiedene KI-Modelle unterstützt. Ab Version 0.6 kann der Grünerator direkt eingebunden werden. Öffne die OpenWebUI-Einstellungen → Tools → MCP Servers. Füge einen neuen Server hinzu: Name: Grünerator URL: https://mcp.gruenerator.eu Auth: OAuth Speichern, anmelden, zustimmen und im Chat als Tool aktivieren. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Übersicht",
    "anchor": "#übersicht",
    "category": "Integrationen",
    "text": "Plattform | Wo einrichten? | URL | Anmeldung | ------------------- | -------------------------------------- | ---------------------------- | ------------------------- | ChatGPT | Settings → Connectors (Developer Mode) | https://mcp.gruenerator.eu | OAuth, Felder leer lassen | Claude | Settings → Integrations | https://mcp.gruenerator.eu | OAuth, läuft automatisch | Mistral Le Chat | Settings → Connectors → Custom MCP | https://mcp.gruenerator.eu | OAuth | OpenWebUI | Settings → Tools → MCP Servers | https://mcp.gruenerator.eu | OAuth | ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Und jetzt?",
    "anchor": "#und-jetzt",
    "category": "Integrationen",
    "text": "Du hast den Grünerator mit deinem KI-Chat verbunden — erfahre jetzt, was du alles fragen kannst: von der Suche in Parteiprogrammen über Social-Media-Beispiele bis hin zu spezialisierten Assistenten für Reden, Anträge und Öffentlichkeitsarbeit. Es geht übrigens auch andersherum: Mit Konnektoren verbindest du externe Dienste wie Notion oder Tally mit dem Grünerator-Chat."
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Was du dafür brauchst",
    "anchor": "#was-du-dafür-brauchst",
    "category": "Integrationen",
    "text": "Ein Grünerator-Konto — die Verbindung läuft über deine Anmeldung Ein Konto bei einem der unterstützten KI-Chats (ChatGPT, Claude, Mistral Le Chat oder OpenWebUI) ChatGPT: Ein Plan mit Connector-Unterstützung (Plus, Pro oder Team) https://mcp.gruenerator.eu Ältere Anleitungen nennen …/mcp oder …/v2 — beide funktionieren weiter und führen an dieselbe Stelle."
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Wenn es nicht klappt",
    "anchor": "#wenn-es-nicht-klappt",
    "category": "Integrationen",
    "text": "„Unauthorized\" oder die Verbindung fragt nicht nach der Anmeldung. Entferne die Verbindung und lege sie neu an — manche Clients merken sich einen alten Stand. Die Verbindung stand schon einmal und ist plötzlich weg. Mit der Zusammenlegung der beiden früheren Server hat sich die Kennung geändert; einmal neu verbinden genügt. Es kommt nur „Keine Treffer\". Suche mit einzelnen Begriffen statt mit ganzen Sätzen — und nenne das Land, wenn es um Österreich geht. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Wie die Anmeldung abläuft",
    "anchor": "#wie-die-anmeldung-abläuft",
    "category": "Integrationen",
    "text": "Beim ersten Verbinden schickt dich dein KI-Chat auf die Grünerator-Anmeldung. Danach siehst du eine Zustimmungsseite, auf der steht, worauf die Verbindung zugreifen darf — Suche, eigene Inhalte lesen, eigene Inhalte anlegen, Projekte, Medien. Erst nach deiner Zustimmung steht die Verbindung. Du gibst dabei kein Passwort an den KI-Chat weiter, und du kannst die Verbindung jederzeit im Grünerator wieder entziehen. Ein Zugangsschlüssel ist nicht nötig: Client-ID und Geheimnis bleiben leer — die Chat-Dienste melden sich selbst am Grünerator an."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "Konnektoren: Externe Dienste im Chat",
    "anchor": "",
    "category": "Integrationen",
    "text": "Mit Konnektoren verbindest du externe Dienste — etwa Notion, Tally oder Brevo — direkt mit dem Grünerator-Chat. Die KI kann dann in deinen Formularen, Dokumenten oder Kontakten arbeiten: „Erstelle ein Anmeldeformular mit @tally\" legt das Formular wirklich in deinem Tally-Konto an. Konnektoren sind aktuell experimentell. Die Auswahl der Dienste und das Verhalten können sich noch ändern. Konnektoren basieren auf dem Model Context Protocol (MCP) — einem offenen Standard, über den KI-Assistenten sicher auf externe Dienste zugreifen. Das ist dieselbe Technik, mit der du auch den Grünerator in ChatGPT & Co nutzen kannst — nur in die andere Richtung."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "1. Dienst auswählen",
    "anchor": "#1-dienst-auswählen",
    "category": "Integrationen",
    "text": "Im Verzeichnis findest du eine handverlesene Auswahl offizieller Konnektoren (siehe Tabelle unten). Über die Suche findest du zusätzlich weitere Server aus dem offenen MCP-Register."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "2. Verbinden und autorisieren",
    "anchor": "#2-verbinden-und-autorisieren",
    "category": "Integrationen",
    "text": "Klicke beim gewünschten Dienst auf Verbinden. Je nach Dienst passiert eines von drei Dingen: Login-Fenster (OAuth): Es öffnet sich ein Popup, in dem du dich beim Dienst anmeldest und den Zugriff bestätigst — wie bei „Mit Google anmelden\". Kein Kopieren von Schlüsseln nötig. API-Token: Manche Dienste (z. B. Brevo, HubSpot) arbeiten mit einem API-Token. Der Dialog verlinkt dir die richtige Stelle beim Anbieter; füge den Token ein — er wird verschlüsselt gespeichert und nur für deine Anfragen verwendet. Keine Anmeldung: Einige Dienste (z. B. Yahoo Finance) brauchen gar keine Autorisierung und sind sofort einsatzbereit. Steht ein Dienst nach erfolgreichem Login noch unter „Autorisierung erforderlich\", klicke oben auf Aktualisieren — die Anzeige holt den aktuellen Stand vom Server. Falls dein Browser das Login-Popup blockiert, erlaube Popups für gruenerator.eu und versuche es erneut."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "3. Im Chat nutzen",
    "anchor": "#3-im-chat-nutzen",
    "category": "Integrationen",
    "text": "Erwähne den verbundenen Dienst im Chat einfach per @-Mention, z. B.: „Erstelle ein Anmeldeformular für unser Sommerfest mit @tally\" „Fasse die offenen Aufgaben aus @todoist zusammen\" „Lege die Pressemitteilung als Seite in @notion ab\" Die Mention erscheint als Chip in deiner Nachricht. Auch Folgefragen ohne erneute Mention bleiben beim Dienst — nach „erstelle ein Formular mit @tally\" versteht der Chat „füge noch ein Feld für die E-Mail-Adresse hinzu\" weiterhin als Tally-Auftrag."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "Eigenen MCP-Server hinzufügen",
    "anchor": "#eigenen-mcp-server-hinzufügen",
    "category": "Integrationen",
    "text": "Für Dienste außerhalb des Verzeichnisses klicke auf „Eigenen MCP-Server hinzufügen\" und trage Name und Server-URL (https://…/mcp) ein. Der Grünerator erkennt automatisch, ob der Server eine Anmeldung braucht, und startet bei Bedarf den Login-Flow. Falls der Anbieter eine manuell registrierte App verlangt, kannst du optional Client-ID und Client-Secret hinterlegen."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "Konnektoren öffnen",
    "anchor": "#konnektoren-öffnen",
    "category": "Integrationen",
    "text": "Du findest die Konnektoren an zwei Stellen: In der Seitenleiste unten auf deinen Account klicken → Konnektoren Oder in den Einstellungen im Tab Konnektoren"
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "Schon da: bereitgestellte Dienste",
    "anchor": "#schon-da-bereitgestellte-dienste",
    "category": "Integrationen",
    "text": "Einige Dienste betreibt der Grünerator selbst. Sie stehen unter „Vom Grünerator bereitgestellt\" ganz oben in der Liste, sind ohne Einrichtung sofort nutzbar und brauchen weder Login noch Zugangsschlüssel: Du sprichst sie wie jeden anderen Konnektor per @-Mention an — etwa „Was steht in @gesetze zu § 823 BGB?\". Meistens brauchst du die Mention gar nicht: erkennt der Chat die passende Frage am Wortlaut, zieht er den Dienst von selbst heran. „Wann fahren heute Abend Züge von Kassel Richtung Berlin?\" — Abfahrten, Ankünfte und Störungen an einem Bahnhof. Keine Verbindungssuche mit Umstiegen oder Preisen. „Wie wird das Wetter am Samstag in Münster? Wir haben Infostand.\" — Vorhersage, aktuelles Wetter und Luftqualität. „Was sind heute die wichtigsten Nachrichten?\" — Meldungen der tagesschau, gesamt, nach Ressort oder Bundesland. „Such mir ein Hotel in Leipzig für den 12. bis 14. März.\" — Preisvergleich über trivago, Preise ohne Gewähr. „Was steht in § 823 BGB?\" — Normtext im Volltext, mit Prüfung, ob das Zitat existiert. Politische Fragen zu denselben Themen bleiben davon unberührt: „Was fordern die Grünen zur Bahnreform?\" ist eine Programmfrage und zieht keine Abfahrtstafel. Wenn du…"
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "Verfügbare Konnektoren",
    "anchor": "#verfügbare-konnektoren",
    "category": "Integrationen",
    "text": "Das Verzeichnis enthält aktuell handverlesene Dienste: Einige bekannte Anbieter (z. B. Typeform, Zoom, DocuSign) verlangen aktuell eine eigene App-Registrierung pro Organisation und sind deshalb vorerst nicht im Verzeichnis. Über die Suche und den offenen MCP-Katalog findest du trotzdem viele weitere Server — oder du fügst einen eigenen hinzu."
  },
  {
    "url": "/docs/integrationen/konnektoren",
    "pageTitle": "Konnektoren: Externe Dienste im Chat",
    "heading": "Verwalten, pausieren, trennen",
    "anchor": "#verwalten-pausieren-trennen",
    "category": "Integrationen",
    "text": "In der Sektion Verbunden siehst du alle deine Dienste mit Status (Verbunden / Pausiert / Nicht autorisiert). Dort kannst du jeden Konnektor: per Schalter pausieren (bleibt verbunden, wird im Chat aber nicht genutzt), testen (zeigt die verfügbaren Werkzeuge des Servers), oder entfernen — gespeicherte Zugangsdaten werden dabei gelöscht. Die bereitgestellten Dienste stehen in einer eigenen Sektion darüber und zeigen Verfügbar bzw. Ausgeschaltet. Für sie gibt es Schalter und Test, aber kein Löschen. Zugangsdaten (Tokens) werden verschlüsselt auf EU-Servern gespeichert und ausschließlich für deine eigenen Chat-Anfragen verwendet. Der Zugriff auf einen Dienst erfolgt immer mit deinem Konto und dessen Berechtigungen — andere Nutzer*innen sehen deine Verbindungen nicht."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Was kann ich den MCP-Server fragen?",
    "anchor": "",
    "category": "Integrationen",
    "text": "Du hast den Grünerator mit deinem KI-Chat verbunden — aber was kannst du damit eigentlich alles machen? Hier erfährst du, welche Fähigkeiten dir zur Verfügung stehen und wie du sie am besten nutzt. Der Grünerator MCP-Server gibt deinem KI-Assistenten Zugriff auf grüne Parteiprogramme, Beschlüsse, Analysen und Social-Media-Beispiele — und auf deine eigenen Grünerator-Inhalte. Du kannst darin suchen, Inhalte filtern und fertige Texte in verschiedenen Formaten erstellen lassen. Beim Verbinden stimmst du einzelnen Bereichen zu — Suche, eigene Inhalte lesen, eigene Inhalte anlegen, Projekte, Medien. Werkzeuge, denen du nicht zugestimmt hast, tauchen gar nicht erst in der Liste auf; dein Assistent kann sie also weder benutzen noch versehentlich vorschlagen. ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Beispiele für Suchanfragen",
    "anchor": "#beispiele-für-suchanfragen",
    "category": "Integrationen",
    "text": "„Was steht im Grundsatzprogramm zum Klimaschutz?\" „Welche Position haben die Grünen zur Verkehrswende?\" „Finde Passagen zur Bildungspolitik im Regierungsprogramm 2025\" „Was sagen die österreichischen Grünen zu Migration?\""
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Bürger*innenanfragen",
    "anchor": "#bürgerinnenanfragen",
    "category": "Integrationen",
    "text": "Beantwortet Bürger*innenanfragen professionell und verständlich. Struktur: Respektvolle Begrüßung → Zusammenfassung der Anfrage → Sachliche Antwort mit Grüner Position → Weiterführende Infos → Freundlicher Abschluss. „Antworte auf: Warum seid ihr gegen den Ausbau der B-Straße?\" „Bürger*innenanfrage: Was tun die Grünen gegen steigende Mieten?\" „Antwort auf Beschwerde über fehlende Parkplätze\" ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Deine eigenen Inhalte",
    "anchor": "#deine-eigenen-inhalte",
    "category": "Integrationen",
    "text": "Weil die Verbindung an deinem Konto hängt, erreicht dein Assistent auch das, was im Grünerator dir gehört: Dokumente, Tabellen und Präsentationen, Boards und Aufgaben, Notebooks, Projekte und Medien — je nachdem, wozu du beim Verbinden zugestimmt hast. „Liste meine Notebooks auf\" „Was steht in meinem Wahlkampf-Notebook zur Verkehrswende?\" „Welche Aufgaben sind bei mir noch offen?\" „Leg mir ein Dokument mit einer Rede zum Thema X an\" Beim Notebook bekommst du eine belegte Antwort samt Quellenliste zurück. Die Suche im Parteikorpus liefert dagegen die gefundenen Textstellen und keine fertig formulierte Antwort — die schreibt dein KI-Assistent selbst daraus. Das ist der Unterschied zum Grünerator-Chat, der die Synthese übernimmt. Aktionen, die etwas löschen oder nach außen sichtbar machen, fragen immer zuerst nach. Erst nach deinem Ja werden sie ausgeführt."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Ergebnisse filtern",
    "anchor": "#ergebnisse-filtern",
    "category": "Integrationen",
    "text": "Du kannst die Suchergebnisse nach Kategorien einschränken. Sag der KI einfach, wonach du filtern möchtest: „Zeig mir nur Praxishilfen im KommunalWiki zum Thema Haushalt\" „Europa-Analysen der Böll-Stiftung\" „Nur Fachtexte der Bundestagsfraktion zur Energiewende\""
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Für Landesverbände",
    "anchor": "#für-landesverbände",
    "category": "Integrationen",
    "text": "Partner-Zugänge mit einem freigeschalteten Landesverband bekommen zusätzlich die Werkzeuge notebookslist, notebookssearch und notebooksgetfilters — der Zugriff auf den Quellenbestand des jeweiligen Landesverbands. ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Kommunalpolitik (Anträge & Anfragen)",
    "anchor": "#kommunalpolitik-anträge--anfragen",
    "category": "Integrationen",
    "text": "Der Kommunalpolitik-Assistent erstellt formal korrekte kommunalpolitische Dokumente und berät bei der Gremienarbeit — in drei Modi: Entwurf (Dokumente schreiben), Diskussion/Beratung und Bewertung (z. B. Feedback zu Haushalten). Kann erstellen: Anträge — Beschlussvorschläge für kommunale Gremien Kleine Anfragen — Faktensammlung, präzise Fragen an die Verwaltung Große Anfragen — Themen auf die Tagesordnung setzen, Debatte anstoßen Haushaltsanträge, Resolutionen und Redebeiträge „Erstelle einen Antrag für mehr Straßenbäume in der Innenstadt\" „Schreibe eine Kleine Anfrage zum Stand der Radwegeplanung\" „Formuliere eine Große Anfrage zur Wohnungspolitik\" ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Landesverbände",
    "anchor": "#landesverbände",
    "category": "Integrationen",
    "text": "Zusätzlich kannst du gezielt in Dokumenten einzelner Landesverbände suchen. Diese werden bei einer normalen Landessuche nicht automatisch mitdurchsucht — du musst den Landesverband explizit nennen. Beispielfragen: „Was sagen die Grünen Hamburg zum Thema Verkehr?\" · „Wahlprogramm der Grünen Schleswig-Holstein zu Bildung\" · „Grüne Bayern Position zur Wirtschaft\" Du kannst auch nach demselben Thema in verschiedenen Sammlungen suchen lassen, z.B.: „Vergleiche die Position von Deutschland und Österreich zum Thema Mobilität.\" Die KI sucht dann automatisch in beiden Sammlungen."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Öffentlichkeitsarbeit & Social Media",
    "anchor": "#öffentlichkeitsarbeit--social-media",
    "category": "Integrationen",
    "text": "Erstellt plattformgerechte Inhalte für Presse und soziale Medien. Plattform | Format | Länge | -------------------- | ------------------------------------------- | ------------------ | Pressemitteilung | Journalistisch mit Lead-Absatz und W-Fragen | ca. 2.000 Zeichen | Instagram | Visuell ansprechend mit Hashtags | max. 600 Zeichen | Facebook | Locker, Community-fokussiert | 300–700 Zeichen | Twitter / X | Prägnant und direkt | max. 280 Zeichen | LinkedIn | Professionell, analytisch | max. 600 Zeichen | Reel / TikTok | 3-Akt-Skript (Hook → Main → CTA) | max. 1.500 Zeichen | Aktionsideen gehören trotz thematischer Nähe nicht in diese Tabelle: Sie sind ein Rezept des universellen Textassistenten, keine Plattform-Variante der Öffentlichkeitsarbeit. Frag einfach direkt danach. „Schreibe eine Pressemitteilung zum neuen Radverkehrskonzept\" „Erstelle einen Instagram-Post zur Verkehrswende\" „Schreibe ein Reel-Skript über bezahlbares Wohnen\" ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Reden",
    "anchor": "#reden",
    "category": "Integrationen",
    "text": "Schreibt politische Reden mit Struktur, Rhetorik und Redehinweisen. Enthält immer: 2–3 Einstiegsideen für die Eröffnung 2–3 Kernargumente 2–3 Ideen für einen starken Schluss Rednerhinweise (Pausen, Betonung) „Schreibe eine 5-Minuten-Rede für die Klimademo\" „Rede zur Eröffnung unseres Sommerfests\" „Begrüßungsrede für den Kreisparteitag\" ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Social-Media-Beispiele finden",
    "anchor": "#social-media-beispiele-finden",
    "category": "Integrationen",
    "text": "Brauchst du Inspiration für deinen nächsten Post? Der Server hat eine Sammlung erfolgreicher Social-Media-Beiträge der Grünen: „Zeig mir Instagram-Posts zum Thema Klimaschutz\" „Erfolgreiche Facebook-Beiträge aus Österreich\" „Social-Media-Beispiele zur Bildungspolitik\" Du kannst nach Plattform (Instagram, Facebook) und Land (Deutschland, Österreich) filtern. ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Spezialisierte Assistenten (Prompts)",
    "anchor": "#spezialisierte-assistenten-prompts",
    "category": "Integrationen",
    "text": "Das Herzstück für die Inhaltserstellung: Der MCP-Server bietet über 30 spezialisierte KI-Assistenten, die jeweils für eine bestimmte Textform optimiert sind. Jeder Assistent kennt den richtigen Ton, die passende Struktur und die formalen Anforderungen. Die wichtigsten stellen wir hier vor. In Claude kannst du Prompts direkt über die Prompt-Auswahl aktivieren. In anderen Clients beschreibe einfach, was du brauchst — die KI wählt den passenden Assistenten automatisch."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Suche in grünen Dokumenten",
    "anchor": "#suche-in-grünen-dokumenten",
    "category": "Integrationen",
    "text": "Die Kernfunktion des MCP-Servers ist die semantische Suche über grüne Parteiprogramme und politische Inhalte. Du kannst einfach Fragen stellen oder nach Themen suchen — die KI versteht auch Zusammenhänge, nicht nur exakte Stichwörter."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Suchmodi",
    "anchor": "#suchmodi",
    "category": "Integrationen",
    "text": "Die Suche funktioniert in drei Modi — du musst den Modus normalerweise nicht angeben, denn der Standardmodus (Hybrid) liefert die besten Ergebnisse: Modus | Wann sinnvoll? | Beispiel | --------------------- | ------------------------------------ | ---------------------------------------------- | Hybrid (Standard) | Für fast alle Anfragen | „Was sagen die Grünen zu Klimaschutz?\" | Text | Exakte Begriffe, Paragraphen, Zahlen | „Finde §20a GG\", „Regierungsprogramm 2025\" | Semantisch | Abstrakte Konzepte, Argumente | „Argumente für die Verkehrswende\" | ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Tipps für bessere Ergebnisse",
    "anchor": "#tipps-für-bessere-ergebnisse",
    "category": "Integrationen",
    "text": "Sei spezifisch: „Klimaschutz im Grundsatzprogramm\" liefert bessere Ergebnisse als nur „Klimaschutz\". Nenne die Sammlung: Wenn du weißt, wo du suchen willst, sag es: „Suche im KommunalWiki nach Haushaltsfragen\". Nutze die Assistenten: Für Texterstellung sind die spezialisierten Prompts deutlich besser als eine generische Anfrage. Filtere gezielt: „Nur Praxishilfen\" oder „nur Europa-Analysen\" schränkt die Ergebnisse sinnvoll ein. Keine Ergebnisse? Versuche es mit einfacheren Stichwörtern, einem anderen Suchmodus oder einer anderen Sammlung."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Universeller Textassistent",
    "anchor": "#universeller-textassistent",
    "category": "Integrationen",
    "text": "Für alle Textformen, die nicht in eine spezielle Kategorie fallen. Kann erstellen: Blogbeiträge, Newsletter, Flyer-Texte, Grußworte, Einladungen, Website-Inhalte, offene Briefe, Stellungnahmen und mehr. „Schreibe einen Newsletter-Text zu unserer Klimaschutz-Initiative\" „Erstelle eine Einladung zur Mitgliederversammlung am 15. März\" „Verfasse einen Blogbeitrag über die Verkehrswende in unserer Stadt\" ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Verfügbare Filter je Sammlung",
    "anchor": "#verfügbare-filter-je-sammlung",
    "category": "Integrationen",
    "text": "Sammlung | Filterbar nach | -------------------------------------------- | ------------------------------------------------------------------ | Alle | Themenbereich (primarycategory) | KommunalWiki | + Inhaltstyp (z.B. Praxishilfe, Artikel), Unterkategorien | Böll-Stiftung | + Inhaltstyp, Unterkategorien, Region (z.B. Europa, Asien, Nahost) | Bundestagsfraktion, gruene.de, gruene.at | + Land (DE/AT) | Landesverbände | + Inhaltstyp (Typ), Themenbereich (Kategorie) | Die KI fragt automatisch die verfügbaren Filterwerte ab, bevor sie filtert. Du musst dir also keine exakten Werte merken — beschreib einfach, was du suchst. ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Wahlprogramm",
    "anchor": "#wahlprogramm",
    "category": "Integrationen",
    "text": "Erstellt strukturierte Wahlprogramm-Kapitel mit konkreten Forderungen. Struktur: Einleitung → 3–4 Unterkapitel mit beschreibenden Überschriften → jeweils 2–3 Absätze mit konkreten Forderungen. „Kapitel zum Thema Klimaschutz für unser Kommunalwahlprogramm\" „Abschnitt zu Bildung und Betreuung\" „Wahlprogramm-Kapitel zur Verkehrswende\" ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Weitere Assistenten",
    "anchor": "#weitere-assistenten",
    "category": "Integrationen",
    "text": "Darüber hinaus gibt es u. a. Assistenten für Sharepics, Leichte Sprache, Dokumente, Tabellen, Präsentationen und Boards, für Bundestag und Abgeordnetenwatch (Parlamentsrecherche) sowie Landesverbands-Varianten der Pressemitteilungs- und Bürger*innenanfragen-Assistenten (z. B. Berlin, Hamburg, Bayern, Österreich) — sie schreiben im Stil und mit dem Wissen des jeweiligen Landesverbands. ---"
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Welche Sammlungen gibt es?",
    "anchor": "#welche-sammlungen-gibt-es",
    "category": "Integrationen",
    "text": "Der Server durchsucht verschiedene Dokumentensammlungen — überregionale Sammlungen und Landesverbände: Beispielfragen: „Was steht im Grundsatzprogramm zu X?\" · „Bundestags-Position zu X\" · „Wie macht man X in der Kommune?\" · „Wie hat Abgeordnete*r X bei Y abgestimmt?\""
  },
  {
    "url": "/docs/konto/einstellungen",
    "pageTitle": "Einstellungen",
    "heading": "Einstellungen",
    "anchor": "",
    "category": "Konto & Projekte",
    "text": "Alles, was du am Grünerator für dich einstellen kannst, liegt in einem Fenster: Einstellungen. Du öffnest es über dein Profilbild unten in der Seitenleiste oder direkt über die Adresse /settings. Es legt sich über die Seite, auf der du gerade bist — du verlierst also nichts, was du angefangen hast. Was du hier änderst, gilt für dein Konto und damit auf allen Geräten, an denen du angemeldet bist. Gespeichert wird sofort; nur bei längeren Texten wie den Anweisungen gibt es einen Speichern-Knopf. Zwei Dinge werden häufig hier gesucht und sind woanders: Was der Chat kann — steht unter KI-Chat Einstellungen einzelner Grüneratoren (Region, Modell, Werkzeuge) — die gehören zum jeweiligen Grünerator, nicht zu deinem Konto, siehe Eigene Grüneratoren erstellen"
  },
  {
    "url": "/docs/konto/einstellungen",
    "pageTitle": "Einstellungen",
    "heading": "Wenn etwas fehlt",
    "anchor": "#wenn-etwas-fehlt",
    "category": "Konto & Projekte",
    "text": "Manche Bereiche brauchen eine Verbindung. Wolke, Websites und Konnektoren zeigen erst etwas, wenn du dort einen Dienst verbunden hast — vorher stehen sie leer da, das ist kein Fehler. Name und E-Mail lassen sich hier nicht ändern. Sie stammen aus deinem Grünen Login. Änderst du sie dort, sind sie nach der nächsten Anmeldung auch hier aktuell. Nicht jede Umgebung zeigt alle Bereiche. Einzelne Funktionen werden schrittweise freigegeben; fehlt ein Bereich bei dir, ist er für deinen Zugang noch nicht aktiv. --- Die Bereiche, Beschriftungen und Auswahlmöglichkeiten auf dieser Seite stammen direkt aus dem Programmcode des Grünerators. Kommt eine Einstellung dazu oder ändert sich ihre Bezeichnung, meldet sich die Doku-Prüfung von selbst — die Seite kann also nicht stillschweigend veralten."
  },
  {
    "url": "/docs/konto/projekte",
    "pageTitle": "Projekte",
    "heading": "Projekte",
    "anchor": "",
    "category": "Konto & Projekte",
    "text": "Ein Projekt bündelt alles, was zu einem Arbeitszusammenhang gehört: Chats, Dokumente und die Menschen, die daran arbeiten. Statt Unterhaltungen und Dateien über den ganzen Grünerator zu verstreuen, liegt eine Kampagne, ein Ortsverband oder eine Arbeitsgruppe an einem Ort. Du findest Projekte in der Seitenleiste und als Kachel im Arbeiten-Tab. Gruppen und Ordner sind zu einem Begriff zusammengefasst worden. Alte Links auf /gruppen funktionieren weiterhin und leiten automatisch weiter — du musst nichts anpassen."
  },
  {
    "url": "/docs/konto/projekte",
    "pageTitle": "Projekte",
    "heading": "Chats einem Projekt zuordnen",
    "anchor": "#chats-einem-projekt-zuordnen",
    "category": "Konto & Projekte",
    "text": "Der eigentliche Nutzen entsteht, wenn du Unterhaltungen zuordnest. Ein Chat, der zu einem Projekt gehört, taucht dort auf — und die Suche kann gezielt innerhalb eines Projekts suchen, statt über alles. Das hilft besonders, wenn du an mehreren Themen parallel arbeitest: „Was hatten wir dazu schon besprochen?\" liefert dann Antworten aus dem richtigen Zusammenhang statt aus allen Gesprächen der letzten Monate."
  },
  {
    "url": "/docs/konto/projekte",
    "pageTitle": "Projekte",
    "heading": "Mitglieder",
    "anchor": "#mitglieder",
    "category": "Konto & Projekte",
    "text": "In einer Gruppe gibt es zwei Rollen: Rolle | Was sie darf | ------------ | ------------------------------------------------------------------------- | Mitglied | Inhalte des Projekts sehen und mitarbeiten | Admin | zusätzlich Mitglieder verwalten und die Einstellungen des Projekts ändern | Du kannst Menschen per E-Mail einladen. Wer noch kein Konto hat, wird durch die Anmeldung geführt und landet danach direkt im Projekt. Ein Projekt kann außerdem öffentlich geschaltet werden. Dann können andere es finden und um Aufnahme bitten; die Anfrage geht an die Admins, die sie annehmen oder ablehnen. Ohne diese Einstellung ist ein Projekt nur über eine Einladung erreichbar."
  },
  {
    "url": "/docs/konto/projekte",
    "pageTitle": "Projekte",
    "heading": "Projekte und Dokumente",
    "anchor": "#projekte-und-dokumente",
    "category": "Konto & Projekte",
    "text": "Office-Dokumente lassen sich mit einem Projekt teilen, statt einzeln mit jeder Person. Wer dem Projekt beitritt, bekommt dadurch Zugriff — und wer es verlässt, verliert ihn wieder. Bei wechselnden Mitstreiter*innen ist das deutlich weniger Pflegeaufwand als eine Liste einzelner Freigaben. Mehr zu den Freigabestufen steht unter Office."
  },
  {
    "url": "/docs/konto/projekte",
    "pageTitle": "Projekte",
    "heading": "Zwei Arten von Projekten",
    "anchor": "#zwei-arten-von-projekten",
    "category": "Konto & Projekte",
    "text": "Beim Anlegen entscheidest du dich für eine der beiden: Projekt — nur für dich. Gedacht, um die eigene Arbeit zu sortieren: alles zur Haushaltsdebatte an einem Ort, getrennt von allem zur Verkehrspolitik. Es taucht bei niemand anderem auf und lässt sich auch nicht finden. Gruppe — für die Zusammenarbeit. Andere können Mitglied werden, sehen die zugeordneten Inhalte und arbeiten mit. Die Wahl legt dich nicht endgültig fest, aber sie bestimmt, ob überhaupt jemand anders hineinschauen kann — überleg also kurz, bevor du etwas Vertrauliches in eine Gruppe legst."
  },
  {
    "url": "/docs/sonstiges/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Aktualisierung",
    "anchor": "#aktualisierung",
    "category": "Sonstiges",
    "text": "Landesverbände: Stündlich zwischen 06:00 und 22:00 Uhr Alle anderen Quellen: Täglich um 03:00 Uhr Die Synchronisation läuft automatisch über GitHub Actions. Neue Inhalte werden erkannt, in Textabschnitte aufgeteilt und als Vektoren (Embeddings) gespeichert."
  },
  {
    "url": "/docs/sonstiges/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Landesverbände",
    "anchor": "#landesverbände",
    "category": "Sonstiges",
    "text": "Die Landesverbände-Sammlung enthält 25.620 Vektoren aus 13 Quellen. Landesverband | Kürzel | Vektoren | ------------------------------- | ------ | ---------: | Berlin | BE | 4.023 | Saarland | SL | 3.484 | Hessen Fraktion | HE-F | 3.234 | Bayern Fraktion | BY-F | 2.902 | Mecklenburg-Vorpommern Fraktion | MV-F | 2.445 | Berlin Fraktion | BE-F | 2.263 | Brandenburg | BB | 2.170 | Mecklenburg-Vorpommern | MV | 1.545 | Sachsen-Anhalt Fraktion | LSA-F | 1.416 | Thüringen | TH | 779 | Bayern | BY | 721 | Hessen | HE | 355 | Sachsen-Anhalt | LSA | 283 | Gesamt | | 25.620 |"
  },
  {
    "url": "/docs/sonstiges/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Sammlungen",
    "anchor": "#sammlungen",
    "category": "Sonstiges",
    "text": "Sammlung | Vektoren | ---------------------- | ---------: | Landesverbände | 25.620 | Abgeordnetenwatch | 20.956 | KommunalWiki | 8.034 | Bundestag | 3.274 | Böll-Stiftung | 2.223 | gruene.at | 1.007 | Grundsatzprogramm | 968 | gruene.de | 859 | Grüne Österreich | 645 | Grünblog | 601 | Social-Media-Beispiele | 537 | Gesamt | 64.724 |"
  },
  {
    "url": "/docs/sonstiges/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Übersicht",
    "anchor": "#übersicht",
    "category": "Sonstiges",
    "text": "Der Grünerator durchsucht und indexiert Inhalte aus verschiedenen Quellen der Grünen Partei. Insgesamt sind 64.724 Vektoren in der Datenbank gespeichert."
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Wie diese Doku entsteht",
    "anchor": "",
    "category": "Sonstiges",
    "text": "Diese Dokumentation beschreibt ein Werkzeug, das sich fast wöchentlich ändert. Damit die Beschreibung nicht still veraltet, entsteht sie größtenteils direkt am Quellcode des Grünerators — die Aufzählungen werden maschinell aus ihm ausgelesen, die erklärenden Texte zum überwiegenden Teil von einer KI geschrieben, die den Code dabei mitliest. Weil das eine ungewöhnliche Arbeitsweise ist, steht hier offen, welcher Teil woher kommt. Der größte Teil dieser Doku ist von einer KI geschrieben — beauftragt, gegengelesen und freigegeben von Menschen. Die Listen darin stammen nicht aus der KI, sondern werden Wort für Wort aus dem Quellcode ausgelesen."
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Drei Schichten, drei Verfahren",
    "anchor": "#drei-schichten-drei-verfahren",
    "category": "Sonstiges",
    "text": "Schicht | Wer macht es | Kann es sich irren? | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | Listen und Namen — Werkzeuge, Einstellungen, Chat-Fähigkeiten, Dateilimits | Ein Programm liest den Quellcode aus. Keine KI beteiligt. | Nein. Es steht wörtlich das da, was im Code steht — oder der Bau der Seite schlägt fehl. | Erklärender Text — Anleitungen, Beispiele, Einordnungen | Überwiegend eine KI, die den Quellcode mitliest. Ein Mensch beauftragt, liest gegen und gibt frei. | Ja. Text kann danebenliegen oder veralten. | Prüfung — Stimmt der Text noch mit der App überein? | Eine zweite KI, die nur lesen darf: Sie vergleicht Artikel und Code und meldet Abweichungen, ändert aber nichts. | Ja. Sie meldet Verdachtsfälle, entscheiden tun Menschen. | Die zweite und die dritte Zeile sind bewusst getrennt. Beim Schreiben arbeitet die KI in einer beauftragten Sitzung: Ein Mensch gibt vor, was dokumentiert werden soll, die KI liest den zugehörigen Code und…"
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Grenzen",
    "anchor": "#grenzen",
    "category": "Sonstiges",
    "text": "Ein von einer KI geschriebener Absatz kann flüssig klingen und trotzdem falsch sein. Das Gegenlesen durch Menschen und die wöchentliche Prüfung fangen vieles ab, aber nicht alles. Der KI-Agent kann sich irren — in beide Richtungen. Er meldet manchmal etwas, das in Ordnung ist, und er übersieht manchmal etwas. Er ist eine zusätzliche Sicherung, keine Garantie. Zwischen zwei Prüfungen liegt bis zu eine Woche. Direkt nach einer Änderung am Grünerator kann ein Absatz kurzzeitig veraltet sein. Screenshots werden nicht automatisch geprüft. Ältere Bilder zeigen deshalb manchmal noch frühere Bezeichnungen. Wenn dir etwas auffällt, das nicht mehr stimmt: melde es auf GitHub oder schreib uns. Das ist immer noch der schnellste Weg — die Automatik ersetzt keine aufmerksamen Leserinnen und Leser."
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Selbst nachsehen",
    "anchor": "#selbst-nachsehen",
    "category": "Sonstiges",
    "text": "Der gesamte Grünerator ist quelloffen, dieses Verfahren also auch. Die Skripte, die den Code auslesen, liegen unter documentation/scripts/, die Prüfung unter apps/api/check-docs-freshness.ts, die zugehörigen Abläufe in .github/workflows/ (alle Dateien, die mit docs- beginnen). Diese Seite ist die Kennzeichnung, die wir selbst für richtig halten: offenlegen, wo KI im Spiel war, statt es zu verschweigen. Wie das für deine eigenen Texte aussieht, steht im Kennzeichnungs-Guide."
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Was blockiert und was nur meldet",
    "anchor": "#was-blockiert-und-was-nur-meldet",
    "category": "Sonstiges",
    "text": "Nicht jede Abweichung wiegt gleich schwer, deshalb gibt es zwei Härtegrade: Blockierend — die Änderung kann nicht übernommen werden: Eine ausgelesene Liste ist veraltet. Im Text steht ein Werkzeugname, den es im Code nicht mehr gibt. Ein Artikel wurde hinzugefügt oder umbenannt, ohne das Verzeichnis nachzuziehen, das der Chat für seine Quellenangaben nutzt. Nur meldend — es entsteht eine Aufgabe, aber nichts steht still: Eine neue Fähigkeit ist im Code da, aber noch nirgends beschrieben. Der KI-Agent hält eine Textstelle für veraltet. Die Trennung ist Absicht: Eine neue Funktion im Grünerator soll nicht daran scheitern, dass der passende Doku-Absatz noch fehlt. Umgekehrt soll ein nachweislich falscher Name gar nicht erst online gehen."
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Was die KI prüft",
    "anchor": "#was-die-ki-prüft",
    "category": "Sonstiges",
    "text": "Ein Knopfname lässt sich maschinell abgleichen, ein Erklärabsatz nicht — er kann veralten, ohne dass ein einziges Wort im Code fehlt. Deshalb bekommt der geschriebene Teil eine eigene, wiederkehrende Prüfung: Jeden Freitagmorgen geht ein KI-Agent alle Anleitungsartikel durch. Er liest den Artikel, sucht die passenden Stellen im Quellcode und beantwortet eine Frage: Gibt es diesen Knopf, dieses Menü, diesen Ablauf noch so, wie der Text es behauptet? Bei Änderungen am Code läuft dieselbe Prüfung sofort — allerdings nur für die Artikel, die zum geänderten Bereich gehören. Das Ergebnis erscheint als Kommentar am Änderungsvorschlag, noch bevor er übernommen wird. Jeder Befund nennt Belege: die zitierte Stelle aus dem Artikel, die dazugehörige Stelle im Code und einen Vorschlag. Daraus wird eine Aufgabe auf GitHub, öffentlich einsehbar. Der Agent arbeitet mit einem Sprachmodell der Claude-Familie und ist auf Lesewerkzeuge beschränkt: Dateien lesen, Text suchen, Dateien finden. Schreiben, Befehle ausführen und ins Internet gehen kann er nicht. Nicht geprüft werden Bereiche, denen kein Code gegenübersteht: das Newsletter-Archiv, die Grundlagenartikel über KI im Allgemeinen und interne…"
  },
  {
    "url": "/docs/sonstiges/wie-diese-doku-entsteht",
    "pageTitle": "Wie diese Doku entsteht",
    "heading": "Was direkt aus dem Code kommt",
    "anchor": "#was-direkt-aus-dem-code-kommt",
    "category": "Sonstiges",
    "text": "Für die Teile, die reine Aufzählung sind, gibt es keine abgetippte Kopie in der Doku. Ein Skript liest die Konfigurationsdateien des Grünerators und schreibt daraus eine Datenliste, die die Doku-Seite beim Bauen einbindet: Was | Woraus | Wo du es siehst | ------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | Werkzeuge und ihre Gruppen | Die Kachel- und Katalog-Konfiguration der Weboberfläche | Alle Werkzeuge | Chat-Fähigkeiten | Die Liste der Absichten, die der Chat erkennen kann, plus die @-Erwähnungen | Was kann ich fragen? | Einstellungen | Der Aufbau des Einstellungen-Dialogs und alle Schalter darin | Einstellungen | Office-Funktionen | Die Verträge zwischen App und KI — und was der Editor davon wirklich ausführt | Office-Überblick | Dateilimits, Sammlungen, Konnektoren | Die Upload-Prüfung und die Konnektor-Registry | Dateien hinzufügen, Konnektoren | Regale der Agentura | Der Kategorien-Katalog des Marktplatzes | Agentura | Namen von Werkzeugen und Menüpunkten im Fließtext | Dieselben…"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Webinare",
    "anchor": "",
    "category": "Allgemein",
    "text": "Erweitere dein Wissen über Künstliche Intelligenz und den Grünerator mit unseren interaktiven Online-Seminaren. Alle Webinare sind kostenlos und speziell auf die Bedürfnisse grüner Kommunalpolitik zugeschnitten. Du möchtest ein Webinar für deinen Kreisverband oder Ortsverband buchen? Unter jedem Webinar findest du einen Muster-Einladungstext, den du direkt kopieren und anpassen kannst. ---"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Das lernst du im Webinar",
    "anchor": "#das-lernst-du-im-webinar",
    "category": "Allgemein",
    "text": "Wie KI wie ChatGPT Texte und Bilder erstellen kann Welche Tools du am besten für kommunalpolitische Arbeit nutzen kannst Praktische Tipps und Tricks: Wie du die KI optimal für deine kommunalpolitische Arbeit nutzt"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Das lernst du im Webinar",
    "anchor": "#das-lernst-du-im-webinar",
    "category": "Allgemein",
    "text": "Hands-on Übungen: Gemeinsam erstellen wir Pressemitteilungen und Social Media Posts Workflow-Optimierung: Wie du den Grünerator in deine Workflows einbaust Praktische Tipps und Tricks: Wie du die KI optimal für deine kommunalpolitische Arbeit nutzt"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Das lernst du im Webinar",
    "anchor": "#das-lernst-du-im-webinar",
    "category": "Allgemein",
    "text": "Profil: Wie du einen Account erstellst und konfigurierst Eigene Grüneratoren: Wie du dir deinen ersten eigenen Grünerator erstellst Wolke: Wie du unsere Grüne Nextcloud einbindest"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Für wen ist dieses Webinar geeignet?",
    "anchor": "#für-wen-ist-dieses-webinar-geeignet",
    "category": "Allgemein",
    "text": "Grüne in Ortsverbänden und Fraktionen Alle, die ihre ehrenamtliche Arbeit effizienter gestalten möchten Einsteiger*innen ohne technische Vorkenntnisse Alle, die KI verantwortungsvoll und klimabewusst einsetzen möchten Muster-Einladungstext zum Kopieren"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "GRÜNERATOR – KI für die kommunalpolitische Arbeit nutzen",
    "anchor": "#grünerator--ki-für-die-kommunalpolitische-arbeit-nutzen",
    "category": "Allgemein",
    "text": "Du möchtest Pressemitteilungen schneller erstellen oder Deine Social-Media-Präsenz stärken? Der Grünerator macht's möglich. Im Webinar zeige ich Dir, wie Du das KI-Tool optimal einsetzt, um Deine Arbeit vor Ort zu unterstützen. Der Grünerator ist ein speziell für die Grünen entwickeltes KI-Tool, das grüne Inhalte nach Wahl erstellen kann. Das Tool ist einfach und selbsterklärend. Du gibst Deine Stichworte in die vorgegebenen Felder ein – der Grünerator erstellt unter Berücksichtigung grüner Sprache und Werte Grünen Content. Das Ergebnis ist ein Vorschlag, den Du weiterbearbeiten kannst. Egal ob für die tägliche Fraktionsarbeit, Wahlkampf oder Social Media – der Grünerator ist Dein digitaler Partner. Das lernst Du im Webinar: Erste Hands-on Übungen: Gemeinsam erstellen wir Pressemitteilungen und Social Media Posts Workflow-Optimierung: Wir lernen zusammen, wie du den Grünerator in deine Workflows einbaust Praktische Tipps und Tricks: Wie Du die KI optimal für Deine kommunalpolitische Arbeit nutzt Über den Referenten Moritz Wächter ist der Entwickler des Grünerators. Er ist Kreisvorsitzender der Grünen im Rhein-Sieg-Kreis und seit zehn Jahren ehrenamtlich auf kommunaler Ebene…"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Grünerator Advanced",
    "anchor": "#grünerator-advanced",
    "category": "Allgemein",
    "text": "| | ------------------- | ------------------------------------------ | Dauer | 90 Minuten | Level | Fortgeschritten | Voraussetzungen | Grundkenntnisse erforderlich | Referent | Moritz Wächter, Entwickler des Grünerators | Du kennst den Grünerator schon? Dann lerne jetzt die fortgeschrittenen Funktionen kennen. Im Webinar zeige ich dir, wie du einen Account erstellst und konfigurierst, wie du dir deinen ersten eigenen Grünerator erstellst und wie du unsere Grüne Nextcloud einbindest."
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "GRÜNERATOR Advanced – Eigene KI-Tools erstellen",
    "anchor": "#grünerator-advanced--eigene-ki-tools-erstellen",
    "category": "Allgemein",
    "text": "Du hast bereits Erfahrung mit dem Grünerator und möchtest noch mehr aus dem Tool herausholen? In diesem fortgeschrittenen Webinar zeige ich Dir, wie Du eigene Grüneratoren erstellst und die Cloud-Anbindung optimal nutzt. Der Grünerator ist ein speziell für die Grünen entwickeltes KI-Tool, das grüne Inhalte nach Wahl erstellen kann. In diesem zweiten Webinar gehen wir über die Grundlagen hinaus und tauchen in die erweiterten Funktionen ein. Du lernst, wie Du das Tool an Deine spezifischen Bedürfnisse anpasst und noch effizienter in Deiner politischen Arbeit einsetzt. Das lernst du im Webinar: Profil: Wie du einen Account erstellst und konfigurierst Eigene Grüneratoren: Wie du dir deinen ersten eigenen Grünerator erstellst Wolke: Wie du unsere Grüne Nextcloud einbindest Über den Referenten Moritz Wächter ist der Entwickler des Grünerators. Er ist Kreisvorsitzender der Grünen im Rhein-Sieg-Kreis und seit zehn Jahren ehrenamtlich auf kommunaler Ebene unterwegs. ---"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Grünerator Basics",
    "anchor": "#grünerator-basics",
    "category": "Allgemein",
    "text": "| | ------------------- | ------------------------------------------ | Dauer | 90 Minuten | Level | Anfänger | Voraussetzungen | Keine Vorkenntnisse erforderlich | Referent | Moritz Wächter, Entwickler des Grünerators | Du möchtest Pressemitteilungen schneller erstellen oder deine Social-Media-Präsenz stärken? Der Grünerator macht's möglich. Im Webinar zeige ich dir, wie du das KI-Tool optimal einsetzt, um deine Arbeit vor Ort zu unterstützen. Der Grünerator ist ein speziell für die Grünen entwickeltes KI-Tool, das grüne Inhalte nach Wahl erstellen kann."
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "KI Basics",
    "anchor": "#ki-basics",
    "category": "Allgemein",
    "text": "| | ------------------- | --------------------------------------------------- | Dauer | 90 Minuten | Level | Anfänger | Voraussetzungen | Keine Vorkenntnisse erforderlich | Format | Interaktives Online-Webinar mit praktischen Übungen | Ehrenamtliche Arbeit ist ganz schön zeitaufwendig. Manchmal wünschen wir uns ein paar helfende Hände, die uns bei den ausführenden Tätigkeiten unterstützen. Dafür gibt es jetzt Künstliche Intelligenz. Sie kann uns die Arbeit im Ortsverband oder in der Fraktion erleichtern. Im Webinar zeige ich dir, wie ChatGPT und Co funktionieren und welche Tools dich am besten in der Arbeit vor Ort unterstützen."
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Über den Referenten",
    "anchor": "#über-den-referenten",
    "category": "Allgemein",
    "text": "Moritz Wächter ist der Entwickler des Grünerators. Er ist Kreisvorsitzender der Grünen im Rhein-Sieg-Kreis und seit zehn Jahren ehrenamtlich auf kommunaler Ebene unterwegs. Muster-Einladungstext zum Kopieren"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Über den Referenten",
    "anchor": "#über-den-referenten",
    "category": "Allgemein",
    "text": "Moritz Wächter ist der Entwickler des Grünerators. Er ist Kreisvorsitzender der Grünen im Rhein-Sieg-Kreis und seit zehn Jahren ehrenamtlich auf kommunaler Ebene unterwegs. Muster-Einladungstext zum Kopieren"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Webinar anfragen",
    "anchor": "#webinar-anfragen",
    "category": "Allgemein",
    "text": "Du möchtest ein Webinar für deinen Kreisverband, Ortsverband oder deine Fraktion buchen? Melde dich per E-Mail — wir finden gemeinsam einen passenden Termin. 📧 info@moritz-waechter.de"
  },
  {
    "url": "/docs/webinare",
    "pageTitle": "Webinare",
    "heading": "Webinar-Einladung: KI-Basics - Künstliche Intelligenz für ehrenamtliche Politik",
    "anchor": "#webinar-einladung-ki-basics---künstliche-intelligenz-für-ehrenamtliche-politik",
    "category": "Allgemein",
    "text": "Liebe Grüne, wir laden euch herzlich zu unserem kostenlosen Online-Webinar \"KI-Basics: Künstliche Intelligenz für ehrenamtliche Politik\" ein. Webinar-Details Thema: KI-Basics - Künstliche Intelligenz für ehrenamtliche Politik Dauer: 90 Minuten Level: Anfänger (keine Vorkenntnisse erforderlich) Format: Interaktives Online-Webinar mit praktischen Übungen Kosten: Kostenlos Darum geht es Ehrenamtliche Arbeit ist ganz schön zeitaufwendig. Manchmal wünschen wir uns ein paar helfende Hände, die uns bei den ausführenden Tätigkeiten unterstützen. Dafür gibt es jetzt Künstliche Intelligenz. Sie kann uns die Arbeit im Ortsverband oder in der Fraktion erleichtern. Doch ist mit Blick auf Datenschutz, Falschinformationen und Klimaverträglichkeit Vorsicht geboten. Im Webinar zeige ich dir, wie ChatGPT und Co funktionieren und welche Tools dich am besten in der Arbeit vor Ort unterstützen. Das lernst Du im Webinar Wie KI wie ChatGPT Texte und Bilder erstellen kann Welche Tools du am besten für kommunalpolitische Arbeit nutzen kannst Praktische Tipps und Tricks: Wie Du die KI optimal für Deine kommunalpolitische Arbeit nutzt Für wen ist dieses Webinar geeignet? Grüne in Ortsverbänden und…"
  }
];
