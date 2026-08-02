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
    "url": "/docs/chat/social-media-post",
    "title": "Social-Media-Post erstellen",
    "category": "Chat",
    "lead": "Du kannst dir im KI-Chat einen kompletten Social-Media-Post in einem Schritt erstellen lassen: Posttext und passende Sharepic-Grafik zusammen, in einer Karte."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "title": "Was kann ich fragen?",
    "category": "Chat",
    "lead": "Der Grünerator ist kein Suchfeld mit festen Befehlen — du schreibst in normalem Deutsch, was du brauchst. Diese Seite zeigt, was dabei alles möglich ist, mit Musterfragen zum Abschauen und Weiterschr…"
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "title": "Agentura",
    "category": "Grüneratoren",
    "lead": "Die Agentura ist der Marktplatz für alle Grüneratoren und Rezepte. Hier findest du an einem Ort alle verfügbaren Grüneratoren — vom Pressestellen-Profi bis zum Landesverbands-Assistenten — entdeckst…"
  },
  {
    "url": "/docs/grueneratoren/eigene-agentinnen-erstellen",
    "title": "Eigene Grüneratoren erstellen",
    "category": "Grüneratoren",
    "lead": "Du kannst dir im Grünerator deine eigenen Grüneratoren bauen — ganz ohne technische Vorkenntnisse. Es gibt zwei Wege: per Beschreibung (die KI erstellt einen Entwurf) oder manuell über das Formular."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "title": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "category": "Grundlagen",
    "lead": "Stellt euch vor, ihr habt einen neuen Mitarbeiter*in eingestellt. Diese Person ist klug, spricht fließend Deutsch und kann gut schreiben — aber sie kennt weder den Kommunikationsstil der Grünen, noch…"
  },
  {
    "url": "/docs/grundlagen/Kennzeichnungs-Guide",
    "title": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "category": "Grundlagen",
    "lead": "Bei der Nutzung des Grünerators stellen sich viele von euch Fragen der Transparenz: Wann muss ich kennzeichnen, dass ein Text von KI erstellt wurde und wann nicht?"
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "title": "Risiken und Gefahren",
    "category": "Grundlagen",
    "lead": "Zugegeben, KI ist praktisch. Aber wir wären nicht bei den GRÜNEN, wenn wir nicht auch darauf achten würden, welche Risiken und Gefahren KI zugrunde liegen. Ich würde folgende Punkte fokussieren:"
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "title": "Welches KI-Tool wofür",
    "category": "Grundlagen",
    "lead": "Claude von Anthropic eignet sich hervorragend für die Erstellung hochwertiger Texte und zeichnet sich durch gute Deutschkenntnisse aus. Speziell für Die Grünen gibt es den Grünerator, der anhand grün…"
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "title": "Grundlagen",
    "category": "Grundlagen",
    "lead": "Ein großes Sprachmodell, wie zum Beispiel ChatGPT , ist ein KI-Modell, das darauf trainiert ist, menschenähnlichen Text zu verstehen und zu erzeugen. Es ist im Kern eine hochentwickelte Anwendung von…"
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "title": "GrünOMat einbetten",
    "category": "Integrationen",
    "lead": "Dieser Artikel ist über draft: true aus dem Build genommen und nicht aktuell. Zwei Dinge müssen geprüft werden, bevor er wieder freigegeben wird:"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "title": "Grünerator in ChatGPT & Co nutzen",
    "category": "Integrationen",
    "lead": "Du kannst den Grünerator direkt in ChatGPT, Claude, Mistral Le Chat oder OpenWebUI verwenden — ohne gruenerator.eu öffnen zu müssen. Dein KI-Assistent kann dann grüne Parteiprogramme durchsuchen, Pos…"
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
    "url": "/docs/konto/gruene-wolke",
    "title": "Wolke einbinden",
    "category": "Konto & Projekte",
    "lead": "Die Grüne Wolke ist unser sicherer Cloud-Speicher für alle grünen Organisationen. Mit der richtigen Konfiguration kannst du deine Dateien nahtlos mit dem Grünerator teilen und automatisch Dokumente h…"
  },
  {
    "url": "/docs/konto/projekte",
    "title": "Projekte",
    "category": "Konto & Projekte",
    "lead": "Ein Projekt bündelt alles, was zu einem Arbeitszusammenhang gehört: Chats, Dokumente und die Menschen, die daran arbeiten. Statt Unterhaltungen und Dateien über den ganzen Grünerator zu verstreuen, l…"
  },
  {
    "url": "/docs/office/boards",
    "title": "Boards",
    "category": "Office",
    "lead": "Ein Board ist eine Tafel aus Spalten und Karten — für Aufgabenverteilung, Redaktionsplanung oder den Stand einer Kampagne. Du legst es über an."
  },
  {
    "url": "/docs/office/dokumente",
    "title": "Dokumente",
    "category": "Office",
    "lead": "Ein Dokument ist der Ort für Fließtext: Anträge, Pressemitteilungen, Protokolle, Notizen, Einladungen. Du legst es über an oder startest über aus einer Vorlage."
  },
  {
    "url": "/docs/office/intro",
    "title": "Office: Dokumente, Tabellen, Folien und Boards",
    "category": "Office",
    "lead": "Office ist der Ort für alles, was aus Text, Zahlen und Plänen besteht. Vier Arten von Dokumenten liegen dort nebeneinander: . Du findest sie über den Tab Arbeiten unter der Kachel ."
  },
  {
    "url": "/docs/office/ki-im-editor",
    "title": "Der Grünerator im Editor",
    "category": "Office",
    "lead": "Jedes Office-Dokument hat eine Chat-Seitenleiste. Sie sieht aus wie der normale Chat und kann auch dasselbe — recherchieren, nachschlagen, Texte schreiben. Der Unterschied: Sie kennt das geöffnete Do…"
  },
  {
    "url": "/docs/office/praesentationen",
    "title": "Präsentationen",
    "category": "Office",
    "lead": "Eine Präsentation ist eine Folge von Folien mit eigenem Vortragsmodus. Du legst sie über an — oder lässt sie dir im Chat aus einem Thema erzeugen."
  },
  {
    "url": "/docs/office/tabellen",
    "title": "Tabellen",
    "category": "Office",
    "lead": "Eine Grünerator-Tabelle ist eine vollwertige Kalkulationstabelle: Formeln, Filter, Sortierung, Auswahllisten, bedingte Formatierung. Du legst sie über auf der Office-Startseite an — oder du lässt sie…"
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "title": "Barrierefreiheit",
    "category": "Über den Grünerator",
    "lead": "Diese Seite sagt, wie barrierefrei der Grünerator heute ist — einschließlich der Stellen, an denen er es noch nicht ist. Eine geschönte Liste hilft niemandem: Wer auf eine Barriere stößt, die hier ni…"
  },
  {
    "url": "/docs/ueber-den-gruenerator/gruenerator-pro-eu",
    "title": "Grünerator Pro-EU",
    "category": "Über den Grünerator",
    "lead": "Wenn Parteien, Abgeordnete und Ehrenamtliche KI-Werkzeuge nutzen, fließen politische Inhalte durch fremde Infrastruktur – Kampagnentexte, Pressemitteilungen, interne Strategien. Bei den meisten KI-To…"
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "title": "Grünerator - die Grüne KI",
    "category": "Über den Grünerator",
    "lead": "Der Grünerator ist ein speziell für Bündnis 90/Die Grünen entwickeltes KI-Tool. Er erstellt Texte wie Pressemitteilungen, Social-Media-Beiträge, Anträge für kommunale Parlamente und viele weitere. Au…"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "title": "Wie nachhaltig ist der Grünerator?",
    "category": "Über den Grünerator",
    "lead": "{/ Modell-Stand aus dem Code (bei Änderungen dort auch hier nachziehen):"
  },
  {
    "url": "/docs/ueber-den-gruenerator/notebook",
    "title": "Deine Daten im Grünerator",
    "category": "Über den Grünerator",
    "lead": "Landesverbände und Abgeordnetenbüros können ein Grünerator Notebook erwerben und eigene Daten in den Grünerator einpflegen. Damit ermöglicht ihr, dass Basismitglieder und Kommunalos den Grünerator da…"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "title": "Worauf der Grünerator aufbaut",
    "category": "Über den Grünerator",
    "lead": "Der Grünerator steht auf den Schultern vieler freier Open-Source-Projekte – Software, die offen entwickelt wird und die alle nutzen, einsehen und weiterentwickeln dürfen. Das passt zu unserer Haltung…"
  },
  {
    "url": "/docs/ueber-den-gruenerator/tools",
    "title": "Welche Werkzeuge gibt es?",
    "category": "Über den Grünerator",
    "lead": "Der Grünerator ist kein einzelnes Programm, sondern eine Sammlung von Werkzeugen. Diese Seite zeigt, welche es gibt und wofür man sie nimmt — damit du nicht suchen musst, wo du etwas findest."
  },
  {
    "url": "/docs/webinare",
    "title": "Webinare",
    "category": "Allgemein",
    "lead": "Erweitere dein Wissen über Künstliche Intelligenz und den Grünerator mit unseren interaktiven Online-Seminaren. Alle Webinare sind kostenlos und speziell auf die Bedürfnisse grüner Kommunalpolitik zu…"
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "title": "Eigenes Notebook erstellen",
    "category": "Wissen",
    "lead": "Ein Notebook bündelt Dokumente zu einem Thema und macht ihren Inhalt im Grünerator durchsuchbar — etwa für Anträge, Beschlüsse, Programme oder Pressemitteilungen. Diese Anleitung führt dich Schritt f…"
  },
  {
    "url": "/docs/wissen/inhaltsdatenbank",
    "title": "Inhaltsdatenbank",
    "category": "Wissen",
    "lead": "Der Grünerator durchsucht und indexiert Inhalte aus verschiedenen Quellen der Grünen Partei. Insgesamt sind 33.504 Vektoren in der Datenbank gespeichert."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "title": "Landesverband-Grüneratoren",
    "category": "Wissen",
    "lead": "Der Grünerator hat für mehrere Landesverbände eigene, regional getunte Grüneratoren. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sp…"
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
    "text": "Ich will für verschiedene Organisationen sogenannte „Notebooks\" erstellen. Notebooks speisen sich aus öffentlichen Daten: Ganze Webseiten von Fraktionen und Landesverbänden, Grünen Wikis, Beschlüssen etc. Jedes Notebook kann individuell durch den Grünerator abgerufen werden. Dafür habe ich ein neues Interface geschaffen, das aus den Dokumenten zitiert. Du kannst also ganz genau nachprüfen, ob das auch wirklich stimmt, was die KI erzählt. Zukünftig können wir alles Wissen unserer Partei per Klick verfügbar machen. Was haben wir auf der BDK beschlossen? Was steht im Wahlprogramm der Grünen in Schleswig-Holstein? Wie mache ich meine Heimatstadt zur Schwammstadt? Frag einfach den Grünerator. Wir schaffen dafür eine einheitliche Datenbank von maschinenlesbaren Daten aus öffentlichen Quellen unserer Partei. Diese liegen sicher bei der Netzbegrünung ab. Man kann sie dann über verschiedene Wege abrufen: Der Grünerator selbst soll im Laufe dieses Jahres Apps für alle Plattformen erhalten. Außerdem sollt ihr die Datenbank des Grünerators auch mit ChatGPT, Claude und Co verbinden können – über einen sogenannten „MCP-Server\". Die Datenbank ist über die Netzbegrünung zudem öffentlich, es können"
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
    "text": "Deshalb veröffentliche ich heute den Grünerator Chat. Ein vollständiger KI-Chat — vergleichbar mit ChatGPT oder Claude — aber ausschließlich auf unseren europäischen Servern, ohne militärische Verträge, ohne Überwachung, ohne dass deine Daten zum Training verwendet werden. Was kann der Chat? Spezialisierte Assistenten für Anträge, Pressemitteilungen, Social Media, Reden und mehr — tippe dafür / im Eingabefeld. In der Regel erkennt der Grünerator diese aber automatisch. Grüne Quellen durchsuchen: Landesverbände, die ein Notebook gekauft haben, können mit @ (z.B. @Thueringen) direkt mit ihren Dokumenten chatten und damit z.B. Bürger*innenanfragen beantworten. Websuche für aktuelle Nachrichten und Fakten. Dateien hochladen — PDFs und Bilder als Kontext nutzen (experimentell). Quellenangaben mit Zitaten, die du nachprüfen kannst. Alles in einer Oberfläche, die du von ChatGPT kennst — nur grüner. Aber Achtung: Das Chat-Feature ist in der Beta-Phase. Es kann zu Fehlern kommen. Zudem braucht die UI hier und da noch Feinschliff. Bitte sichere wichtige Texte außerhalb des Grünerators, etwa indem du sie als Docx herunterlädst. Ich habe mich dazu entschieden, den Launch vorzuziehen, um ihn an"
  },
  {
    "url": "/docs/archiv/newsletter/2026-03-ki-chat-launch",
    "pageTitle": "März 2026: Grünerator Chat",
    "heading": "Hintergrund: Was ist passiert?",
    "anchor": "#hintergrund-was-ist-passiert",
    "category": "Archiv",
    "text": "Das Pentagon — von der Trump-Regierung in „Department of War\" umbenannt — hat Rahmenverträge mit KI-Anbietern wie Anthropic, OpenAI, Google und xAI geschlossen. Ziel: KI in Waffenentwicklung, Geheimdienstarbeit und Gefechtsführung einzusetzen. Als Anthropic sich weigerte, seine roten Linien gegen autonome Waffen und Massenüberwachung aufzugeben, drohte das Pentagon, das Unternehmen als „Lieferkettenrisiko\" einzustufen — eine Kategorie, die sonst feindlichen Staaten vorbehalten ist. Und setzt dies nun um. OpenAI – die Firma hinter ChatGPT – sprang ein. OpenAI-Chef Sam Altman unterschrieb einen Deal, der dem Militär Zugang zu OpenAIs Modellen auf geheimen Netzen gewährt. Die roten Linien? Stehen im Vertrag. Ob sie durchgesetzt werden? Offen. Altman bezeichnete das Abkommen später als überhastet. Da war das Kind aber schon in den Brunnen gefallen. Und dann nutzten die USA KI-Systeme (ironischerweise von Anthropic) für den Angriff auf den Iran. Für was genau, dafür gibt es in US-Medien Vermutungen. Hunderte Mitarbeitende bei Google DeepMind und OpenAI haben in offenen Briefen dieselben roten Linien wie Anthropic gefordert: Nein zu Massenüberwachung, Nein zu autonomen Waffen ohne mensch"
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
    "text": "Newsletter Mai 2026 --- Hallo zusammen, ab sofort kannst du im Grünerator deine eigenen Notebooks erstellen – mit eigenen Quellen, eigenen Fragen, eigenen Antworten. Ein Notebook ist im Grunde dein persönliches Archiv: Du wirfst Dokumente rein, und der Grünerator beantwortet deine Fragen ausschließlich auf Basis dieser Dokumente – mit nachprüfbaren Quellenangaben. Lade einfach Dokumente hoch, verbinde einen Ordner aus der Grünen Wolke oder importiere eigene Grünerator Docs als Quelle. Offen gesagt: Ich glaube, Notebooks können die Art und Weise, wie wir Parteiarbeit machen, für immer verändern. Wissen wird durchsuchbar und verständlich wie nie. Um dieses Feature dauerhaft für uns als Basis kostenfrei und unbegrenzt verfügbar zu machen, können sich Landesverbände (in Österreich der Bundesverband) spezielle Notebooks einkaufen, die über 1.000 Dokumente beinhalten, die sich automatisiert aus den öffentlichen Beschlüssen und Pressemitteilungen speisen. Cool, oder? Die bestehenden Notebooks findest du online. Wenn das für deinen Landesverband interessant ist, melde dich gern! Um ein Notebook zu erstellen, klicke unten auf Zu den Notebooks und dann rechts bei „Eigene\" auf das Plus-Icon. "
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
    "text": "Verschickt am 19. Mai 2026 als Signal-Broadcast · Kurzfassung zum Newsletter Mai 2026. --- Die Karte unten zeigt die Nachricht, wie sie in Signal-Gruppen verschickt wurde — in ihr-Form, weil Signal mehrere Leute gleichzeitig erreicht. Mit einem Klick auf „Für Signal kopieren\" landet der Text in der Zwischenablage: Links als reine URL, Genderstern als Doppelpunkt, Fett wird weggelassen (Signal rendert keine Markdown-Sternchen) — wenn du Fett brauchst, einfach im Chat manuell setzen. Das Bild lädst du mit dem zweiten Button herunter und hängst es in Signal an. Hallo zusammen, ab sofort könnt ihr im Grünerator eure eigenen Notebooks erstellen – mit eigenen Quellen, eigenen Fragen, eigenen Antworten. Ein Notebook ist euer persönliches Archiv: Ihr werft Dokumente rein, und der Grünerator beantwortet eure Fragen ausschließlich auf Basis dieser Dokumente – mit nachprüfbaren Quellenangaben. Offen gesagt: Ich glaube, Notebooks können die Art und Weise, wie wir Parteiarbeit machen, für immer verändern. Wissen wird durchsuchbar wie nie. Damit das Feature für die Basis kostenfrei bleibt, können sich Landesverbände (in Österreich der Bundesverband) spezielle Notebooks mit über 1.000 Dokumenten "
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
    "text": "| | ------------------------------------- | ------------------------------------- | Dateien pro Nachricht | | Größe je Datei | | Alle Dateien einer Nachricht zusammen | | Videos (eigener Weg, siehe unten) | je Datei | Videos zählen nicht in die Gesamtsumme. Sie nehmen einen anderen Weg als die übrigen Dateien — statt in die Anfrage eingebettet zu werden, laden sie separat hoch. Deshalb haben sie ein eigenes, viel höheres Limit. Wählst du eine Datei aus, die der Grünerator nicht lesen kann, bekommst du eine Fehlermeldung mit der Liste der erlaubten Typen — und keine deiner Dateien wird angehängt, auch die gültigen nicht. Nimm die betroffene Datei heraus und häng den Rest erneut an."
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
    "text": "Der Grünerator Chat ist dein persönlicher KI-Assistent für grüne Politik. Du kannst Fragen stellen, Texte erstellen lassen, in Parteiprogrammen recherchieren und sogar Bilder generieren — alles in einer Chat-Oberfläche."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Dateien im Chat",
    "anchor": "#dateien-im-chat",
    "category": "Chat",
    "text": "Du kannst PDFs und Bilder direkt im Chat hochladen, um sie als Kontext für deine Frage zu verwenden. Öffne dazu das „+\"-Menü im Eingabefeld und wähle Dateien. Mehr Details zu unterstützten Dateitypen und Einschränkungen findest du unter Dateien hinzufügen."
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
    "text": "Den Chat erreichst du über den Menüpunkt in der Seitenleiste oder direkt unter /chat. Dort siehst du: Eingabefeld unten zum Schreiben deiner Nachricht Seitenleiste links mit deinem Gesprächsverlauf — Gespräche kannst du dort auch in Ordnern organisieren „+\"-Menü links im Eingabefeld für Modus, Werkzeuge, Quellen und Dateien Modell-Auswahl rechts unten im Eingabefeld Jedes Gespräch wird als eigener Thread mit eigener Adresse (/chat/…) gespeichert. Du kannst jederzeit ein neues Gespräch beginnen oder in der Seitenleiste zu einem früheren Gespräch zurückkehren."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Quellen durchsuchen",
    "anchor": "#quellen-durchsuchen",
    "category": "Chat",
    "text": "Der Chat kann gezielt in grünen Parteiprogrammen, Beschlüssen und Dokumenten recherchieren. Tippe @ im Eingabefeld, um eine Quelle auszuwählen. Kürzel | Quelle | Inhalt | --------------------- | ------------------------- | ------------------------------------------------- | @alle | 🔍 Alle Quellen | Durchsucht mehrere Quellen parallel | @grundsatz | 📗 Grundsatzprogramm | Grundsatzprogramme von Bündnis 90/Die Grünen | @bundestagsfraktion | 🏛️ Bundestagsfraktion | Inhalte von gruene-bundestag.de | @thüringen | 🏔️ Grüne Thüringen | Beschlüsse und Wahlprogramme Thüringen | @bayern | 🦁 Grüne Bayern | Regierungsprogramm Bayern | @berlin | 🐻 Grüne Berlin | Pressemitteilungen und Beschlüsse Berlin | @mv | 🌊 Grüne MV | Mecklenburg-Vorpommern | @brandenburg | 🌲 Grüne Brandenburg | Brandenburg | @sachsen-anhalt | 🏰 Grüne Sachsen-Anhalt | Sachsen-Anhalt | @hessen | 🦌 Grüne Hessen | Hessen | @saar | 🌿 Grüne Saarland | Saarland | @at | 🇦🇹 Grüne Österreich | Programme von Die Grünen Österreich | @kommunalwiki | 📚 KommunalWiki | Fachwissen zur Kommunalpolitik | @böll | 📖 Heinrich-Böll-Stiftung | Analysen und Dossiers der Böll-Stiftung | @gruenblog | ✍️ Grünblog | Beiträge aus dem Grü"
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Quellenangaben",
    "anchor": "#quellenangaben",
    "category": "Chat",
    "text": "Wenn der Chat in Dokumenten oder im Web recherchiert, zeigt er dir die verwendeten Quellen an: Nummerierte Badges im Text (z.B. [1], [2]) verweisen auf die genutzten Quellen Hover über einen Badge zeigt dir Titel, URL und einen Textauszug Gruppierte Quellenübersicht unterhalb der Antwort mit allen verwendeten Dokumenten Quellenangaben helfen dir, die Antworten des Grünerators nachzuvollziehen und zu überprüfen. Du kannst jede Quelle direkt anklicken, um das Originaldokument zu öffnen."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Skills auswählen",
    "anchor": "#skills-auswählen",
    "category": "Chat",
    "text": "Skills sind spezialisierte Schreib-Modi, die auf bestimmte Textarten optimiert sind — sie kennen den richtigen Ton, die Struktur und die Längenvorgaben der jeweiligen Plattform. So wählst du einen Skill: Tippe / im Eingabefeld und wähle aus der Liste, oder öffne das „+\"-Menü im Eingabefeld Befehl | Skill | Beschreibung | ------------ | ------------------- | -------------------------------- | /presse | 📰 Pressemitteilung | Pressemitteilungen verfassen | /instagram | 📸 Instagram | Instagram-Posts & Captions | /facebook | 👍 Facebook | Facebook-Posts & Beiträge | /twitter | 🐦 Twitter / X | Tweets & Threads | /linkedin | 💼 LinkedIn | LinkedIn-Posts & Artikel | /reel | 🎬 Reel / TikTok | Reel- & TikTok-Skripte | /aktion | 💡 Aktionsideen | Kreative Aktionsideen entwickeln | Für Anträge, Reden, Wahlprogramme und Bürger*innenanfragen gibt es eigene Grüneratoren — du findest sie unter dem Menüpunkt in der Seitenleiste und kannst sie direkt im Chat öffnen. Du kannst einen Skill mit Quellen und Werkzeugen kombinieren. Zum Beispiel: /presse @grundsatz Klimaschutz in Kommunen schreibt eine Pressemitteilung auf Basis des Grundsatzprogramms."
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Tipps für die Nutzung",
    "anchor": "#tipps-für-die-nutzung",
    "category": "Chat",
    "text": "Kombiniere Skill + Quelle + Thema für die besten Ergebnisse, z.B. /presse @bundestagsfraktion Kindergrundsicherung Nutze @recherche für aktuelle Nachrichten und tiefgehende Analysen — es durchsucht Web und Dokumente und wählt die Suchtiefe automatisch Starte ein neues Gespräch für jedes neue Thema — so bleibt der Kontext sauber und die Antworten präziser Lade relevante Dokumente hoch, wenn du einen bestehenden Text überarbeiten oder darauf aufbauen möchtest"
  },
  {
    "url": "/docs/chat/ki-chat",
    "pageTitle": "KI-Chat",
    "heading": "Werkzeuge nutzen",
    "anchor": "#werkzeuge-nutzen",
    "category": "Chat",
    "text": "Werkzeuge erweitern die Fähigkeiten des Chats über die reine Textgenerierung hinaus. Du kannst sie per @-Mention im Eingabefeld aktivieren. Kürzel | Werkzeug | Beschreibung | -------------------- | -------------------- | -------------------------------------------------------------------------- | @recherche | 🔬 Recherche | Web- und Multi-Quellen-Recherche — die Suchtiefe passt sich automatisch an | @dokumente | 📄 Dokumente | Parteiprogramme & Beschlüsse durchsuchen | @docs | 💬 Dokument einfügen | Eigene Dokumente als Kontext einbinden | @zusammenfassung | 📝 Zusammenfassung | Dokument(e) zusammenfassen | @bildgenerieren | 🎨 Bildgenerierung | Bild mit KI generieren | @bildbearbeiten | 🖌️ Bildbearbeitung | Ein generiertes oder hochgeladenes Bild verändern | @sharepic | 🖼️ Sharepic | Sharepic im Grünen Design erstellen (experimentell) | @stadtbegruenen | 🌳 Stadt begrünen | Stadtbild mit Grün transformieren | @umfragen | 📊 Umfragen | Aktuelle Wahlumfragen abfragen | @bundestag | 🏛️ Bundestag | Drucksachen und Reden aus dem Bundestag | @abgeordnetenwatch | 🗳️ Abgeordnetenwatch | Abstimmungen und Profile von Abgeordneten | Öffne das „+\"-Menü links im Eingabefeld, um Werkzeuge d"
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
    "text": "Alle verfügbaren Modelle erfüllen höchste Datenschutzstandards: Europäische Server: Deine Eingaben werden ausschließlich auf europäischen Servern verarbeitet – entweder bei Mistral AI (Frankreich) oder auf selbst gehosteten Servern. Kein KI-Training: Deine Eingaben werden nicht zum Training der KI verwendet. Open Source: Die selbst gehosteten Modelle (Gemma, GPT-OSS) sind vollständig quelloffen und transparent."
  },
  {
    "url": "/docs/chat/ki-modelle",
    "pageTitle": "KI-Modelle",
    "heading": "Verfügbare Modelle",
    "anchor": "#verfügbare-modelle",
    "category": "Chat",
    "text": "⭐ Mistral – Der beste Allrounder für die meisten Aufgaben. Läuft auf EU-Servern von Mistral AI (Frankreich). 🌳 Gemma 4 – Besonders gut für Kreativtexte. Open-Source-Modell, selbst gehostet auf europäischen Servern. 🌳 GPT-OSS – Das schnellste Modell. Vollständig quelloffen und selbst gehostet auf europäischen Servern – ideal, wenn du Wert auf maximale Datensouveränität legst. Für die Bildgenerierung kommen eigene Modelle zum Einsatz (u. a. Flux von Black Forest Labs, Deutschland). Auch hier gilt: Verarbeitung auf europäischen Servern."
  },
  {
    "url": "/docs/chat/social-media-post",
    "pageTitle": "Social-Media-Post erstellen",
    "heading": "Social-Media-Post erstellen",
    "anchor": "",
    "category": "Chat",
    "text": "Du kannst dir im KI-Chat einen kompletten Social-Media-Post in einem Schritt erstellen lassen: Posttext und passende Sharepic-Grafik zusammen, in einer Karte. Diese Funktion ist noch in der Erprobung. Verhalten und Ergebnisse können sich ändern, und nicht alles funktioniert schon zuverlässig. Prüfe Text und Grafik vor der Veröffentlichung immer selbst."
  },
  {
    "url": "/docs/chat/social-media-post",
    "pageTitle": "Social-Media-Post erstellen",
    "heading": "Grafik-Variante gezielt anfragen",
    "anchor": "#grafik-variante-gezielt-anfragen",
    "category": "Chat",
    "text": "Ohne weitere Angabe bekommst du die drei Varianten Dreizeiler, Zitat und Info zur Auswahl. Du kannst aber auch direkt eine bestimmte Variante anfragen — nenne sie einfach im Text: Variante | Stichwörter | ---------------------- | ----------------------------------------------------- | Dreizeiler | „Dreizeiler\", „3 Zeilen\", „Slogan\", „Balken\" | Zitat | „Zitat\", „Spruch\", „Statement\", „Aussage\" | Info | „Info\", „Fakten\", „Faktencheck\", „erklär…\" | Slider / Karussell | „Slider\", „Karussell\", „Carousel\", „Slides\", „Folien\" | Beispiel: „Erstelle ein Zitat-Sharepic zu Artenschutz\" liefert direkt die Zitat-Variante. Ein Slider (mehrseitiges Insta-Karussell) ist ein eigenständiges Format und wird nur auf ausdrückliche Anfrage erzeugt — nicht als Teil der drei Standard-Varianten. Frag ihn z. B. mit „… als Karussell\" an."
  },
  {
    "url": "/docs/chat/social-media-post",
    "pageTitle": "Social-Media-Post erstellen",
    "heading": "Gut zu wissen",
    "anchor": "#gut-zu-wissen",
    "category": "Chat",
    "text": "Die drei Sharepic-Varianten und der Text gehören zusammen: Öffnest du eine Variante im Studio, bleibt genau deren Inhalt erhalten. Änderungen im Chat und im Studio arbeiten am selben Dokument — du kannst also im Chat vorbereiten und im Studio feinschleifen."
  },
  {
    "url": "/docs/chat/social-media-post",
    "pageTitle": "Social-Media-Post erstellen",
    "heading": "So geht's",
    "anchor": "#so-gehts",
    "category": "Chat",
    "text": "Beschreibe im Chat einfach, was du brauchst — zum Beispiel: Erstelle einen Instagram-Post mit Sharepic zu mehr Klimaschutz Der Grünerator erzeugt daraufhin eine Karte mit: Posttext — fertige Caption inklusive Hashtags und Zeichenzähler (passend zum Kanal, z. B. Instagram) Sharepic-Vorschau — dazu drei Varianten zur Auswahl: Dreizeiler, Zitat und Info"
  },
  {
    "url": "/docs/chat/social-media-post",
    "pageTitle": "Social-Media-Post erstellen",
    "heading": "Was du mit der Karte machen kannst",
    "anchor": "#was-du-mit-der-karte-machen-kannst",
    "category": "Chat",
    "text": "Variante wählen: Klicke eine der drei Miniaturen an, um die Vorschau umzuschalten. Text kopieren: Über das Kopieren-Symbol übernimmst du die Caption direkt in die Zwischenablage. Herunterladen: Lädt die gewählte Sharepic-Variante als Bild herunter. Im Studio öffnen: Öffnet die Grafik im Sharepic-Studio, wo du Text, Farben und Layout weiter anpassen kannst. Im Chat bearbeiten: Beschreibe Änderungen einfach als Nachricht (z. B. „mach den Zitat-Text kürzer\" oder „anderer Hintergrund\") — der Grünerator passt Text oder Grafik direkt an. Nenne den Kanal in deiner Anfrage (Instagram, Facebook, LinkedIn …), damit Tonalität, Länge und Hashtags dazu passen."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "Was kann ich fragen?",
    "anchor": "",
    "category": "Chat",
    "text": "Der Grünerator ist kein Suchfeld mit festen Befehlen — du schreibst in normalem Deutsch, was du brauchst. Diese Seite zeigt, was dabei alles möglich ist, mit Musterfragen zum Abschauen und Weiterschreiben. Du findest den Chat unter dem Menüpunkt . Wie du dort Skills, Quellen und Dateien auswählst, steht unter KI-Chat."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "So stellst du eine gute Frage",
    "anchor": "#so-stellst-du-eine-gute-frage",
    "category": "Chat",
    "text": "Einfach lostippen. Der Grünerator erkennt an deiner Formulierung selbst, ob er nachschlagen, recherchieren, rechnen oder etwas erstellen soll. „Was steht im Grundsatzprogramm zum Mietendeckel?\" reicht — du musst kein Werkzeug auswählen. Nenne das Ziel, nicht den Weg. Statt „such im Web und schreib dann einen Post\" genügt „Schreib einen Instagram-Post zum aktuellen Stand der Wärmewende\". Mehrschrittige Aufträge löst der Grünerator in einem Rutsch. Werde konkret, wenn es darauf ankommt. Ort, Zeitraum, Länge und Zielgruppe verbessern das Ergebnis spürbar: „Pressemitteilung, etwa 2.000 Zeichen, für die Lokalpresse in Kassel.\" Mit @ steuerst du gezielt. Eine Erwähnung legt fest, worauf sich die Antwort stützt — eine Quelle, ein Dokument, ein Board oder ein verbundener Dienst. Mit / wählst du einen Schreib-Skill. Nachfragen ist erwünscht. Antworten lassen sich im Gespräch weiterentwickeln: „kürzer\", „sachlicher\", „mach ein Sharepic daraus\". Der Grünerator behält den Zusammenhang. „Was kannst du?\" oder „Wie erstelle ich ein Sharepic?\" beantwortet der Chat direkt — er kennt seinen eigenen Funktionsumfang."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "Was du fragen kannst",
    "anchor": "#was-du-fragen-kannst",
    "category": "Chat",
    "text": "Anfordern musst du nichts davon — es genügt, die Frage zu stellen. Die Kennzeichnungen an den Karten bedeuten: @kürzel — für diese Fähigkeit gibt es zusätzlich eine Erwähnung, mit der du sie im Eingabefeld vorwählen kannst. Nur ein Teil der Fähigkeiten hat so ein Kürzel, und das ist Absicht: Erwähnungen gibt es dort, wo die Vorauswahl wirklich etwas ändert — bei Quellen, die man gezielt ansteuert, und bei Formaten, die man bewusst wählt. Alles Übrige erkennt der Grünerator zuverlässig an der Formulierung allein („Wie wird das Wetter am Samstag?\" braucht kein @wetter), deshalb gibt es dafür bewusst keine Abkürzung. experimentell — noch jung. Funktioniert, kann sich aber in Bedienung und Ergebnis noch ändern und ist nicht überall verfügbar. Verlass dich für etwas Wichtiges nicht blind darauf. Werkzeug: … — diese Fähigkeit lässt sich in eigenen Grüneratoren gezielt an- und abschalten. Zusatzquelle: … — dahinter steckt ein externer Dienst (Bahn, Wetterdienst, tagesschau, trivago), der pro Umgebung angebunden wird. Fehlt die Anbindung gerade, bleibt die Frage nicht unbeantwortet: der Grünerator weicht auf die Websuche aus — bei Zugverbindungen dann ohne Live-Daten."
  },
  {
    "url": "/docs/chat/was-kann-ich-fragen",
    "pageTitle": "Was kann ich fragen?",
    "heading": "Wenn etwas nicht geht",
    "anchor": "#wenn-etwas-nicht-geht",
    "category": "Chat",
    "text": "Manches ist nur in der Web-Version möglich. Sharepics und einige Editor-Funktionen brauchen die große Oberfläche; in der App wirst du dorthin weitergeleitet. Einige Quellen decken nur Deutschland ab. Bundestag, Abgeordnetenwatch, Bahn und tagesschau beziehen sich auf deutsche Daten. Bei österreichischen Fragen weicht der Grünerator auf die Websuche aus. Nicht jede Zusatzquelle ist überall angebunden. Bahn, Wetterdienst, tagesschau und trivago werden pro Umgebung eingerichtet. Fehlt eine, greift der Grünerator auf die Websuche zurück und sagt dazu, worauf die Antwort beruht — erfundene Abfahrtszeiten gibt es nicht. Erfindet der Grünerator nichts? Bei Recherchen und Datenquellen nennt er die Belege. Prüfe Zahlen und Zitate trotzdem, bevor sie nach außen gehen — mehr dazu unter Risiken und Gefahren von LLMs. Du nutzt den Grünerator in ChatGPT, Claude oder Le Chat? Dort steht ein kleinerer Funktionsumfang bereit — was dann möglich ist, steht unter Was kann ich den MCP-Server fragen?. Namen, Beschreibungen und Kürzel stammen direkt aus dem Programmcode des Grünerators. Kommt eine neue Fähigkeit dazu, meldet sich die Doku-Prüfung automatisch mit einem Hinweis, bis sie hier mit Musterfrag"
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Agentura",
    "anchor": "",
    "category": "Grüneratoren",
    "text": "RecipeCategories, ShelfCount, SortOptions, } from '@site/src/components/AgenturaShelves'; Die Agentura ist der Marktplatz für alle Grüneratoren und Rezepte. Hier findest du an einem Ort alle verfügbaren Grüneratoren — vom Pressestellen-Profi bis zum Landesverbands-Assistenten — entdeckst neue Werkzeuge und baust dir mit wenigen Klicks deine eigenen. Du erreichst die Agentura über den Menüpunkt in der Seitenleiste oder direkt unter /agentura. Die alten Adressen /agents und /skills leiten automatisch dorthin weiter. Was früher Agent*innen hieß, heißt jetzt Grüneratoren; aus Skills sind Rezepte geworden. Ältere Screenshots und Newsletter benutzen noch die alten Begriffe — gemeint ist dasselbe."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Detailseiten",
    "anchor": "#detailseiten",
    "category": "Grüneratoren",
    "text": "Jeder Grünerator und jedes Rezept hat eine eigene Detailseite — wie ein Produkt im Laden. Grüneratoren (/agentura/agent/...): Kopfbereich mit den Aktionen Im Chat öffnen, Favorit und Teilen. Übersicht — Beschreibung, Begrüßungsnachricht und eine Vorschau auf Beispiel-Antworten. Fähigkeiten — welche Werkzeuge der Grünerator-Agent nutzt, auf welches Wissen er zugreift und welches Sprachmodell dahintersteckt. Verwandte — ähnliche Grüneratoren, die zum Thema passen. Rezepte (/agentura/skill/...): Kopfbereich mit denselben Aktionen. Der vollständige Rezept-Text als Markdown — so siehst du genau, was das Rezept macht, bevor du es nutzt. Eine Vorlage und verwandte Rezepte."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Eigene Grüneratoren bauen",
    "anchor": "#eigene-grüneratoren-bauen",
    "category": "Grüneratoren",
    "text": "Das Herzstück der Agentura: Du kannst deine eigenen Grüneratoren bauen — ganz ohne technische Vorkenntnisse. Wie das Schritt für Schritt geht, liest du unter Eigene Grüneratoren erstellen."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Favoriten",
    "anchor": "#favoriten",
    "category": "Grüneratoren",
    "text": "Mit dem Stern auf einer Karte oder Detailseite markierst du einen Grünerator-Agenten oder ein Rezept als Favorit. System-, geteilte und Landesverbands-Grüneratoren werden dadurch an deine Seitenleiste angeheftet, sodass du sie mit einem Klick im Chat öffnen kannst."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Grüneratoren und Rezepte",
    "anchor": "#grüneratoren-und-rezepte",
    "category": "Grüneratoren",
    "text": "In der Agentura leben zwei Arten von Helfern: Grüneratoren sind spezialisierte KI-Persönlichkeiten mit eigenem Ton, eigenem Wissen und eigenen Werkzeugen. Du öffnest sie direkt im Chat und arbeitest dort mit ihnen. Rezepte sind kurze Schnellbefehle für eine konkrete Aufgabe (z. B. eine Pressemitteilung im Stil deines Landesverbands). Du rufst sie im Chat mit / auf. Eine Faustregel: Ein Grünerator-Agent ist ein eigenständiges Gegenüber für ein ganzes Themenfeld. Ein Rezept ist eine einzelne Vorlage, die du auf jeden beliebigen Grünerator-Agenten anwenden kannst. In der Mehrzahl heißen sie Grüneratoren. In der Einzahl sagen wir Grünerator-Agent — „der Grünerator\" ohne Zusatz meint das Produkt als Ganzes."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Im Marktplatz stöbern",
    "anchor": "#im-marktplatz-stöbern",
    "category": "Grüneratoren",
    "text": "Die Agentura ist wie ein Marktladen aufgebaut. Es gibt Regale — am Desktop bleibt die Regal-Liste seitlich stehen, auf dem Handy scrollst du durch Pillen-Buttons. Regale ohne Inhalt werden ausgeblendet, du siehst also nur, was bei dir tatsächlich etwas enthält. Im offiziellen Regal sind die Rezepte zusätzlich nach Rubriken sortiert: . Über das Suchfeld findest du Grüneratoren und Rezepte nach Name oder Beschreibung; sortieren kannst du nach . Auf den Karten der Grüneratoren siehst du außerdem Fähigkeits-Hinweise: welche Werkzeuge sie nutzen, ob sie auf ein Wissens-Notebook zugreifen und für welche Region sie gedacht sind. Suche, Sortierung und die gewählte Kategorie werden in der Adresse (URL) gespeichert. Du kannst eine bestimmte Ansicht also einfach als Link weitergeben oder mit dem Zurück-Knopf zur vorherigen Auswahl springen."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Schnell hinkommen",
    "anchor": "#schnell-hinkommen",
    "category": "Grüneratoren",
    "text": "In der Seitenleiste liegt als eigener Eintrag. Ein Klick öffnet eine kurze Auswahl deiner Favoriten und der zuletzt genutzten Grüneratoren — von dort startest du direkt ein Gespräch, ohne den Umweg über den Marktplatz. Der Eintrag Alle ansehen führt in die Agentura."
  },
  {
    "url": "/docs/grueneratoren/agentura",
    "pageTitle": "Agentura",
    "heading": "Tipps für die Nutzung",
    "anchor": "#tipps-für-die-nutzung",
    "category": "Grüneratoren",
    "text": "Öffne einen Grünerator-Agenten direkt aus der Agentura im Chat — die ganze Konfiguration ist dann schon aktiv. Markiere häufig genutzte Grüneratoren als Favorit, damit sie in der Seitenleiste auftauchen. Schau dir vor dem Bauen ähnliche Grüneratoren an — über die „Verwandte\"-Liste auf den Detailseiten findest du Vorbilder. Mehr zum Arbeiten mit Grüneratoren im Gespräch findest du unter KI-Chat."
  },
  {
    "url": "/docs/grueneratoren/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Eigene Grüneratoren erstellen",
    "anchor": "",
    "category": "Grüneratoren",
    "text": "Du kannst dir im Grünerator deine eigenen Grüneratoren bauen — ganz ohne technische Vorkenntnisse. Es gibt zwei Wege: per Beschreibung (die KI erstellt einen Entwurf) oder manuell über das Formular. Eigene Grüneratoren sind noch in der Erprobung. Verhalten und Funktionen können sich ändern, und nicht alles funktioniert schon zuverlässig. Beim Bauen siehst du oben einen entsprechenden Hinweis-Banner. Bitte melde Probleme dem Team. In der Mehrzahl heißen sie Grüneratoren. In der Einzahl sagen wir Grünerator-Agent — „der Grünerator\" ohne Zusatz meint das Produkt als Ganzes."
  },
  {
    "url": "/docs/grueneratoren/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 1: Den Creator öffnen",
    "anchor": "#schritt-1-den-creator-öffnen",
    "category": "Grüneratoren",
    "text": "Öffne die Agentura, scrolle zum Abschnitt Meine Grüneratoren und klicke oben rechts auf Neuer Grünerator-Agent. Alternativ rufst du den Creator direkt unter /agents/new auf."
  },
  {
    "url": "/docs/grueneratoren/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 2: Agent beschreiben (empfohlen)",
    "anchor": "#schritt-2-agent-beschreiben-empfohlen",
    "category": "Grüneratoren",
    "text": "Du landest auf der Seite „Was für einen Grünerator-Agenten möchtest du bauen?\". Beschreibe im Eingabefeld (Platzhalter „Beschreibe deinen neuen Grünerator-Agenten…\") in eigenen Worten, was er können soll – Zweck, Ton und Fähigkeiten. Zum Einstieg kannst du auch eines der Beispiele anklicken: 📰 Pressestelle, 🚲 Recherche-Bot oder 📣 Social Media. Drücke anschließend den Senden-Pfeil (oder Enter). Der Grünerator erstellt daraus einen Entwurf und öffnet direkt den Editor mit vorausgefüllten Feldern. Klicke auf „Lieber manuell anlegen?\", um den Editor mit leerem Formular zu öffnen (entspricht der Adresse /agents/new/manual)."
  },
  {
    "url": "/docs/grueneratoren/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 3: Im Editor anpassen",
    "anchor": "#schritt-3-im-editor-anpassen",
    "category": "Grüneratoren",
    "text": "Der Editor zeigt links das Formular und rechts eine Live-Vorschau. Die Felder sind in Tabs gegliedert: Grundlagen, Werkzeuge und Wissen (bei wiederkehrenden Aufgaben zusätzlich Zeitplan). Pflichtfelder (Tab Grundlagen): Name — der Anzeigename deines Agenten. Daneben wählst du über den Icon-Picker ein Symbol. Beschreibung — ein kurzer Satz, was der Agent macht. Anleitung — die eigentliche Anweisung an die KI (das „System-Prompt\"), z.B. beginnend mit „Du bist ein*e …\". Mindestens 10 Zeichen. Tab Werkzeuge — wähle per Checkbox, was dein Agent können soll. Standardmäßig sind Grünerator-Wissen und Recherche aktiv. Zur Auswahl stehen: Werkzeug | Funktion | -------------------------- | -------------------------------------------------------------------------------------------------- | Grünerator-Wissen | Durchsucht die Grünerator-Wissensdatenbank (Programme, Beschlüsse, Kommunalwiki). | Recherche | Sucht im Web — die Suchtiefe (schnelle Suche bis mehrstufige Recherche) passt sich automatisch an. | Social-Media-Beispiele | Findet passende Beispiel-Posts aus dem Grünerator-Fundus. | Bildgenerierung | Erstellt Bilder aus einer Beschreibung. | Bildbearbeitung | Bearbeitet ein vorhandenes Bild"
  },
  {
    "url": "/docs/grueneratoren/eigene-agentinnen-erstellen",
    "pageTitle": "Eigene Grüneratoren erstellen",
    "heading": "Schritt 4: Speichern und nutzen",
    "anchor": "#schritt-4-speichern-und-nutzen",
    "category": "Grüneratoren",
    "text": "Klicke oben rechts auf Speichern. Der Knopf ist erst aktiv, wenn Name, Beschreibung und Anleitung ausgefüllt sind. Nach dem Speichern erscheint „Gespeichert ✓\" und du landest auf der Bearbeitungsseite deines Agenten. Von dort öffnest du ihn über Im Chat öffnen und kannst sofort mit ihm arbeiten. Spätere Änderungen nimmst du jederzeit über das Stift-Symbol (Bearbeiten) auf der Karte oder Detailseite vor. Mit Abbrechen verwirfst du nicht gespeicherte Änderungen."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Beispiel-Ausgaben",
    "anchor": "#beispiel-ausgaben",
    "category": "Grundlagen",
    "text": "Pressemitteilung (Thema: Erneuerbare Energien in Brandenburg): Brandenburg beschleunigt den Ausbau erneuerbarer Energien – Weg zu einer klimaneutralen Zukunft Brandenburg, 4. April 2026 – Das Land Brandenburg hat heute einen ambitionierten Plan vorgestellt, der den Ausbau von Wind- und Solarenergie bis 2030 auf ein neues Niveau heben soll. Instagram-Post (Thema: Klimaschutz im Alltag): 🌍 Klimaschutz im Alltag – Jeder Schritt zählt! 🌱 💡 Kleine Taten, große Wirkung 🚲 Kurzstrecken per Fahrrad statt Auto – mehr Bewegung, weniger CO₂. ♻️ Abfalltrennung: Plastik, Papier, Bio – alles trennt sich leichter, wenn wir es wollen."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Deutschland",
    "anchor": "#deutschland",
    "category": "Grundlagen",
    "text": "Quelle | Inhalt | Beispiele | ------------------ | --------------------------------------- | --------- | Landesverbände | Pressemitteilungen, Beschlüsse, Anträge | 300 | Bundestagsfraktion | Fachtexte, Positionen | 100 | Social Media | Facebook- und Instagram-Posts | 200 | gruene.de | Website-Inhalte | 100 | Grundsatzprogramm | Programmatische Texte | 60 |"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Download",
    "anchor": "#download",
    "category": "Grundlagen",
    "text": "Zwei Varianten stehen zum Download bereit: Variante | Größe | Beschreibung | ----------- | ------- | ------------------------------------------------------------------ | Adapter | 115 MB | Nur die LoRA-Gewichte. Kann auf das Basismodell aufgesetzt werden. | Merged | 20 GB | Vollständiges Modell mit eingebackenem Adapter. Direkt einsetzbar. | Download über die Together AI API (erfordert TOGETHERAPIKEY): Die Dateien werden als ZSTD-komprimierte Archive (.tar.zst) gespeichert und können mit tar --zstd -xf dateiname.tar.zst entpackt werden."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Erste Ergebnisse",
    "anchor": "#erste-ergebnisse",
    "category": "Grundlagen",
    "text": "Das erste deutsche Modell (gruenerator-de-v1) wurde am 5. April 2026 trainiert."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Kosten-Überblick",
    "anchor": "#kosten-überblick",
    "category": "Grundlagen",
    "text": "Was | Kosten | ----------------------------------- | ------------------------------ | Ein Länder-Adapter (Training) | 2 € | Beide Länder | 4 € | Spezialist*innen-Adapter (Phase 2) | 2 € pro Stück | Inferenz (Nutzung) | Gleicher Preis wie Basismodell | Fine-Tuning mit LoRA ist eine der kosteneffizientesten Methoden, um ein Sprachmodell an die eigenen Bedürfnisse anzupassen — und bei 2 € pro Adapter ist das Experimentieren praktisch risikofrei."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Modell verwenden & herunterladen",
    "anchor": "#modell-verwenden--herunterladen",
    "category": "Grundlagen",
    "text": "Das trainierte Modell ist privat auf Together AI gespeichert und kann direkt per API verwendet oder als Datei heruntergeladen werden."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Nächste Schritte",
    "anchor": "#nächste-schritte",
    "category": "Grundlagen",
    "text": "Österreich-Adapter: Separates Modell für Die Grüne Alternative, trainiert auf österreichischen Parteidokumenten Spezialist*innen-Adapter: Fokussierte Modelle für einzelne Inhaltstypen (Presse, Social Media, Beschlüsse), falls die Qualität es erfordert Integration: Anbindung an den Grünerator über LiteLLM, automatische Adapter-Auswahl nach Sprache und Inhaltstyp"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Österreich",
    "anchor": "#österreich",
    "category": "Grundlagen",
    "text": "Quelle | Inhalt | Beispiele | ---------------- | -------------------------- | --------- | Partei-Programme | Grundsatzprogramm | 60 | gruene.at | News, Themen, Organisation | 160 |"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Schritt 1: Export",
    "anchor": "#schritt-1-export",
    "category": "Grundlagen",
    "text": "Die Dokumente liegen als Vektoren in unserer Qdrant-Datenbank. Das Export-Skript setzt sie aus Chunks wieder zu vollständigen Texten zusammen und speichert Metadaten wie Titel, Inhaltstyp, Erscheinungsdatum und Landesverband."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Schritt 2: Transformation",
    "anchor": "#schritt-2-transformation",
    "category": "Grundlagen",
    "text": "Rohdokumente werden in Chat-Format umgewandelt — jedes Trainingsbeispiel besteht aus: System-Prompt: Definiert die Rolle als Kommunikationsexpert*in der Grünen User-Prompt: Eine Aufgabe wie „Schreibe eine Pressemitteilung zum Thema: Klimaschutzgesetz\" Antwort: Der tatsächliche Dokumenttext Dabei werden mehrere Filter angewendet: Qualität: Zu kurze Texte und Duplikate werden entfernt Aktualität: Bevorzugt werden neuere Dokumente (ab 2022) Balance: Pro Sammlung und Inhaltstyp werden maximal 100 Beispiele verwendet, damit keine Quelle dominiert"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Schritt 3: Training",
    "anchor": "#schritt-3-training",
    "category": "Grundlagen",
    "text": "Die aufbereiteten Daten werden bei Together AI hochgeladen und ein LoRA-Training gestartet. Das Training dauert etwa 10-15 Minuten und kostet 2 €."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Selbst hosten",
    "anchor": "#selbst-hosten",
    "category": "Grundlagen",
    "text": "Das heruntergeladene Modell kann lokal oder auf eigener Infrastruktur betrieben werden — zum Beispiel über LiteLLM, vLLM oder llama.cpp. Details dazu stehen im FINETUNING-GUIDE."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Trainingsdetails",
    "anchor": "#trainingsdetails",
    "category": "Grundlagen",
    "text": "Parameter | Wert | ------------------ | ---------------------------- | Basismodell | GPT-OSS 20B | Methode | LoRA (Rank 64, Alpha 16) | Trainingsbeispiele | 750 (+ 84 Validation) | Epochen | 1 | Trainingsdauer | 12 Minuten | Kosten | 1,74 € | Eval Loss | 5,10 → 3,84 (stetig fallend) |"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Unser Ansatz: Getrennte Modelle für Deutschland und Österreich",
    "anchor": "#unser-ansatz-getrennte-modelle-für-deutschland-und-österreich",
    "category": "Grundlagen",
    "text": "Der Grünerator bedient zwei unterschiedliche Grüne Parteien: Bündnis 90/Die Grünen (Deutschland) Die Grünen – Die Grüne Alternative (Österreich) Das sind nicht regionale Varianten desselben Stils — es sind verschiedene Organisationen mit unterschiedlichen Namen, Strukturen und Positionen. Deshalb trainieren wir separate LoRA-Adapter für jedes Land, die auf demselben Basismodell laufen. Die Sprache der Nutzer*in (Deutsch/Deutschland oder Deutsch/Österreich) bestimmt automatisch, welcher Adapter verwendet wird — ohne Mehrkosten."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Vorteile von LoRA",
    "anchor": "#vorteile-von-lora",
    "category": "Grundlagen",
    "text": "Schnell: Wenige Minuten statt Tagen Günstig: 2 € pro Trainingsrun Sicher: Das Basismodell wird nicht verändert Flexibel: Adapter können bei jeder Anfrage gewechselt werden"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Was ist Fine-Tuning?",
    "anchor": "#was-ist-fine-tuning",
    "category": "Grundlagen",
    "text": "Stellt euch vor, ihr habt einen neuen Mitarbeiter*in eingestellt. Diese Person ist klug, spricht fließend Deutsch und kann gut schreiben — aber sie kennt weder den Kommunikationsstil der Grünen, noch weiß sie, wie eine Pressemitteilung der Partei aufgebaut ist oder welchen Ton ein Instagram-Post von Bündnis 90/Die Grünen treffen sollte. Genau so verhält es sich mit einem allgemeinen Sprachmodell wie GPT-OSS. Es kann hervorragend Texte verfassen, kennt aber nicht die spezifischen Muster grüner Kommunikation: die Rhetorik, den Genderstern, die Balance zwischen Dringlichkeit und Pragmatismus, die typische Struktur einer Presseaussendung. Fine-Tuning ist der Prozess, in dem wir diesem Modell beibringen, wie die Grüne Partei kommuniziert — indem wir es auf tausenden echten Parteidokumenten trainieren: Pressemitteilungen, Beschlüsse, Social-Media-Posts und Grundsatzprogramme."
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Was verwenden wir bewusst nicht?",
    "anchor": "#was-verwenden-wir-bewusst-nicht",
    "category": "Grundlagen",
    "text": "Heinrich-Böll-Stiftung: Akademischer, analytischer Ton — nicht die Stimme der Partei Kommunalwiki: Neutrale Enzyklopädie-Artikel — nicht politische Kommunikation"
  },
  {
    "url": "/docs/grundlagen/finetuning",
    "pageTitle": "Fine-Tuning: Ein eigenes Sprachmodell trainieren",
    "heading": "Wie funktioniert LoRA?",
    "anchor": "#wie-funktioniert-lora",
    "category": "Grundlagen",
    "text": "Klassisches Fine-Tuning würde alle 20 Milliarden Parameter eines Modells neu trainieren. Das ist teuer, langsam und riskant — das Modell könnte dabei seine allgemeinen Fähigkeiten „vergessen\". LoRA (Low-Rank Adaptation) geht einen anderen Weg: Es friert alle originalen Gewichte ein und fügt kleine, trainierbare Matrizen hinzu — weniger als 0,1 % der Parameter. Das Ergebnis ist ein leichtgewichtiger Adapter, der das Verhalten des Modells in Richtung Partei-Kommunikation verschiebt, ohne dass es verlernt, was es bereits kann. Man kann sich das wie eine Brille vorstellen: Das Modell selbst bleibt unverändert, aber durch den Adapter „sieht\" es die Welt durch eine grüne Perspektive."
  },
  {
    "url": "/docs/grundlagen/Kennzeichnungs-Guide",
    "pageTitle": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "heading": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "anchor": "",
    "category": "Grundlagen",
    "text": "Bei der Nutzung des Grünerators stellen sich viele von euch Fragen der Transparenz: Wann muss ich kennzeichnen, dass ein Text von KI erstellt wurde und wann nicht? ---"
  },
  {
    "url": "/docs/grundlagen/Kennzeichnungs-Guide",
    "pageTitle": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "heading": "Bilder und Videos immer kennzeichnen",
    "anchor": "#bilder-und-videos-immer-kennzeichnen",
    "category": "Grundlagen",
    "text": "KI-generierte oder mit KI bearbeitete Bilder und Videos müssen immer gekennzeichnet werden. Bei Bildern fügt der Grünerator die Kennzeichnung standardmäßig hinzu („KI-Generiert mit dem Grünerator\" oder kurz „KI-Generiert\"). Du kannst sie im Bild-Editor zwar abwählen — dann bist du aber selbst dafür verantwortlich, das Bild bei der Veröffentlichung als KI-generiert zu kennzeichnen."
  },
  {
    "url": "/docs/grundlagen/Kennzeichnungs-Guide",
    "pageTitle": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "heading": "Grundsätzlich: Kennzeichnungspflicht bei KI-Texten",
    "anchor": "#grundsätzlich-kennzeichnungspflicht-bei-ki-texten",
    "category": "Grundlagen",
    "text": "Im neuen europäischen AI Act (Artikel 50) steht: Wenn ein KI-System „Text generiert oder manipuliert, der zu dem Zweck veröffentlicht wird, die Öffentlichkeit über Angelegenheiten von öffentlichem Interesse zu informieren“, muss offengelegt werden, dass der Text künstlich erstellt oder verändert wurde. Das betrifft insbesondere unsere politische Kommunikation."
  },
  {
    "url": "/docs/grundlagen/Kennzeichnungs-Guide",
    "pageTitle": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "heading": "Präzise Kennzeichnung",
    "anchor": "#präzise-kennzeichnung",
    "category": "Grundlagen",
    "text": "Wenn Inhalte gekennzeichnet werden, muss die Kennzeichnung immer präzise benennen, wofür der Grünerator eingesetzt wurde. Zum Beispiel: Bei diesem Wahlprogramm wurde die Rechtschreibung mit dem Grünerator, der grünen KI, korrigiert."
  },
  {
    "url": "/docs/grundlagen/Kennzeichnungs-Guide",
    "pageTitle": "Wie kennzeichne ich meine grünerierten Inhalte?",
    "heading": "Wichtige Ausnahme – redaktionelle Verantwortung",
    "anchor": "#wichtige-ausnahme--redaktionelle-verantwortung",
    "category": "Grundlagen",
    "text": "Diese Pflicht entfällt, „wenn die KI-generierten Inhalte einer menschlichen Überprüfung oder redaktionellen Kontrolle unterzogen wurden und eine natürliche oder juristische Person die redaktionelle Verantwortung für die Veröffentlichung der Inhalte trägt.“ Mit anderen Worten: Wenn wir die Texte selbst prüfen, überarbeiten und die Verantwortung übernehmen, ist eine Kennzeichnung nicht notwendig. Da wir dies beim Grünerator ohnehin immer tun, empfehle ich, zumindest bei Social-Media-Texten und Pressemitteilungen darauf zu verzichten. Bei Wahlprogrammen oder längeren Texten empfehle ich, kenntlich zu machen, wie KI genutzt wurde, etwa zur Recherche oder zum Vergleich mit anderen Programmen."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Risiken und Gefahren",
    "anchor": "",
    "category": "Grundlagen",
    "text": "Zugegeben, KI ist praktisch. Aber wir wären nicht bei den GRÜNEN, wenn wir nicht auch darauf achten würden, welche Risiken und Gefahren KI zugrunde liegen. Ich würde folgende Punkte fokussieren:"
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "3. Regulatorische Risiken und verbotene Praktiken laut EU AI Act",
    "anchor": "#3-regulatorische-risiken-und-verbotene-praktiken-laut-eu-ai-act",
    "category": "Grundlagen",
    "text": "Die EU-Gesetzgebung für Künstliche Intelligenz (AI Act) adressiert explizit eine Reihe von Hochrisikobereichen und verbietet bestimmte KI-Praktiken, um die Grundrechte zu schützen und Missbrauch zu verhindern."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Begrenztes Kontextfenster",
    "anchor": "#begrenztes-kontextfenster",
    "category": "Grundlagen",
    "text": "LLMs können sich nur an eine begrenzte Anzahl von Wörtern in einer Konversation \"erinnern\". Wird diese Grenze überschritten, beginnen sie, den Kontext zu vergessen. Wer schon mal länger in einem KI-Chatfenster gehangen hat wird es kennen: Je länger man drin ist, desto komischer werden die Antworten."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Datenschutzbedenken",
    "anchor": "#datenschutzbedenken",
    "category": "Grundlagen",
    "text": "Bei der Nutzung von LLMs besteht das Risiko, dass sensible oder persönliche Informationen, die in die Modelle eingegeben werden, nicht ausreichend geschützt sind."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Fazit",
    "anchor": "#fazit",
    "category": "Grundlagen",
    "text": "Zusammenfassend lässt sich sagen, dass die Gefahren von LLMs von tiefgreifenden technischen Limitierungen bis hin zu weitreichenden gesellschaftlichen und ethischen Problemen reichen, die sorgfältige Regulierung und verantwortungsvolle Anwendung erfordern."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Fehlinformation und Manipulation",
    "anchor": "#fehlinformation-und-manipulation",
    "category": "Grundlagen",
    "text": "Die Fähigkeit von LLMs, menschenähnliche Texte, Bilder oder Videos zu erzeugen (sogenannte \"Deepfakes\"), macht es zunehmend schwierig, maschinengenerierte Inhalte von authentischen zu unterscheiden. Dies birgt erhebliche Risiken für die Integrität des Informationsökosystems und das Vertrauen der Öffentlichkeit, da es zu großflächiger Fehlinformation, Manipulation, Betrug und Identitätsdiebstahl führen kann."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Halluzinationen",
    "anchor": "#halluzinationen",
    "category": "Grundlagen",
    "text": "Ein großes Problem ist die Tendenz von LLMs, \"Fakten zu halluzinieren\", das heißt, sie erfinden plausible, aber unwahre oder nicht durch Belege gestützte Informationen. Dies geschieht, weil LLMs auf statistischen Mustern und Wahrscheinlichkeiten basieren, anstatt die Wahrheit der Ausgabe zu überprüfen."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Kosten und Effizienz",
    "anchor": "#kosten-und-effizienz",
    "category": "Grundlagen",
    "text": "LLMs sind extrem groß und ihr Training erfordert enorme Rechenressourcen und ist sehr kostspielig (z.B. bis zu 4,6 Millionen US-Dollar für einen einzelnen Trainingslauf von GPT-3 175B). Auch die Inferenz (die Zeit, die das Modell für eine Antwort benötigt) ist ein entscheidender Faktor. Eine hohe Latenz kann LLMs für Echtzeitanwendungen, wie Suchmaschinen, ungeeignet machen."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Mangel an gesundem Menschenverstand",
    "anchor": "#mangel-an-gesundem-menschenverstand",
    "category": "Grundlagen",
    "text": "LLMs können sehr plausibel klingen, doch fehlt ihnen oft ein tiefgreifenderes Verständnis des Kontextes. Sie besitzen keinen \"gesunden Menschenverstand\" im menschlichen Sinne. Dies kann zu Fehlern führen, etwa bei logischen Fragen."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Mangelnde Interpretierbarkeit",
    "anchor": "#mangelnde-interpretierbarkeit",
    "category": "Grundlagen",
    "text": "Obwohl LLMs über Argumentationsfähigkeiten verfügen, sind ihre internen Prozesse oft undurchsichtig. Es ist nicht immer leicht nachvollziehbar, wie sie zu bestimmten Ergebnissen kommen. Die Transparenz ist ein wichtiger Aspekt, der durch die EU-Verordnung gefordert wird, um Betreibern ein besseres Verständnis zu ermöglichen."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Schädliche Inhalte und Missbrauchspotenzial",
    "anchor": "#schädliche-inhalte-und-missbrauchspotenzial",
    "category": "Grundlagen",
    "text": "LLMs können zusammenhängende, qualitativ hochwertige und plausible Texte generieren, was sie zu potenziellen Werkzeugen für die Verbreitung von Hassreden, Diskriminierung, Aufstachelung zu Gewalt, falschen Narrativen oder Social-Engineering-Angriffen macht. Es besteht auch ein \"Dual-Use-Potenzial\", bei dem LLMs missbraucht werden könnten, um illegale Informationen bereitzustellen, z.B. zur Waffenproliferation oder Terrorplanung."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Schwierige Leistungsvorhersage bei Skalierung",
    "anchor": "#schwierige-leistungsvorhersage-bei-skalierung",
    "category": "Grundlagen",
    "text": "Es ist nicht immer klar, wie sich die Leistung von LLMs mit zunehmender Größe entwickelt. Es gibt Phänomene wie \"Inverse Scaling\" oder \"U-förmige Phänomene\", bei denen größere Modelle nicht zwangsläufig besser sind oder die Leistung sogar abnimmt. Dies macht die Planung und Investition in größere Modelle komplex und risikoreich."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Systemische Risiken von KI-Modellen mit allgemeinem Verwendungszweck",
    "anchor": "#systemische-risiken-von-ki-modellen-mit-allgemeinem-verwendungszweck",
    "category": "Grundlagen",
    "text": "LLMs, insbesondere große generative KI-Modelle, können systemische Risiken bergen, die weitreichende negative Auswirkungen auf die öffentliche Gesundheit, Sicherheit, die demokratischen Prozesse und die Gesellschaft insgesamt haben können. Dies beinhaltet das Risiko der Verbreitung illegaler, falscher oder diskriminierender Inhalte und die Beeinflussung demokratischer Prozesse. Die EU-Verordnung legt Schwellenwerte für die Rechenleistung fest, ab denen ein Modell als systemisches Risiko eingestuft wird, und fordert Bewertungen und Minderungsmaßnahmen von den Anbietern."
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Verbotene KI-Praktiken (Artikel 5 des AI Act)",
    "anchor": "#verbotene-ki-praktiken-artikel-5-des-ai-act",
    "category": "Grundlagen",
    "text": "#### Manipulative KI-Systeme Verboten sind KI-Systeme, die menschliches Verhalten durch unterschwellige Beeinflussung oder die Ausnutzung von Schwachstellen einer Person oder Gruppe (z.B. Alter, Behinderung, soziale/wirtschaftliche Situation) erheblich nachteilig beeinflussen und dadurch physischen, psychischen oder finanziellen Schaden verursachen können. Im politischen Kontext könnte dies beispielsweise ein KI-System sein, das Wähler manipuliert, indem es auf nicht wahrnehmbare Weise Emotionen oder Vorurteile anspricht. #### Soziale Bewertung (Social Scoring) KI-Systeme, die Menschen oder Gruppen über einen bestimmten Zeitraum anhand ihres sozialen Verhaltens oder ihrer persönlichen Merkmale bewerten oder klassifizieren und dies zu Diskriminierung oder Ausgrenzung führt, sind verboten. Ein kommunalpolitisches Beispiel wäre ein System, das Bürger nach ihrem Engagement in der Gemeinde bewertet und dies dann für den Zugang zu öffentlichen Dienstleistungen verwendet. #### Echtzeit-Biometrische Fernidentifizierung Diese Praxis ist grundsätzlich verboten, da sie massiv in die Privatsphäre eingreift und ein Gefühl ständiger Überwachung erzeugen kann. Es gibt nur eng definierte und stren"
  },
  {
    "url": "/docs/grundlagen/risiken-und-gefahren-von-llms",
    "pageTitle": "Risiken und Gefahren",
    "heading": "Verzerrungen (Bias)",
    "anchor": "#verzerrungen-bias",
    "category": "Grundlagen",
    "text": "LLMs können verzerrte Ergebnisse (Biases) reproduzieren, die aus den Trainingsdaten stammen. Da diese Modelle mit riesigen Mengen an Daten trainiert werden, die menschliche Vorurteile und gesellschaftliche Ungleichheiten widerspiegeln können, können sie diskriminierende Muster fortschreiben und verstärken. Dies kann sich in unterschiedlicher Leistung zwischen demografischen Gruppen (z.B. basierend auf Dialekt, Religion, Geschlecht oder Rasse) zeigen. Im kommunalpolitischen Kontext könnte dies beispielsweise bedeuten, dass KI-Systeme bei der Bewertung von Sozialleistungen unbewusst bestimmte Bevölkerungsgruppen benachteiligen, wenn die Trainingsdaten historische Ungleichheiten widerspiegeln."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "1. Texterstellung: Claude/Gruenerator",
    "anchor": "#1-texterstellung-claudegruenerator",
    "category": "Grundlagen",
    "text": "Claude von Anthropic eignet sich hervorragend für die Erstellung hochwertiger Texte und zeichnet sich durch gute Deutschkenntnisse aus. Speziell für Die Grünen gibt es den Grünerator, der anhand grüner Sprache trainiert wurde und Pressemitteilungen, Social-Media-Beiträge und Anträge erstellt."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "10. Self-Hosting: Llama 3.1 70B",
    "anchor": "#10-self-hosting-llama-31-70b",
    "category": "Grundlagen",
    "text": "Llama 3.1 70B ist ein Open-Source-Sprachmodell von Meta, das du selbst hosten kannst und dabei den besten Kompromiss zwischen RAM-Verbrauch, Geschwindigkeit und Qualität bietet. Das Modell unterstützt 8 Sprachen, hat eine Kontextlänge von 128k Token und kann kostenlos auf deiner eigenen Hardware betrieben werden, um volle Kontrolle über Datenschutz und Anpassungen zu haben."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "2. Allrounder: ChatGPT",
    "anchor": "#2-allrounder-chatgpt",
    "category": "Grundlagen",
    "text": "ChatGPT ist der Alleskönner unter den KI-Tools und bewältigt eine breite Palette von Aufgaben von Textbearbeitung über Problemlösung bis hin zu kreativen Projekten, wobei die besonders intuitive Benutzeroberfläche ideal für den Einstieg ist. Zusätzlich können eigene GPTs für wiederkehrende Aufgaben erstellt und geteilt werden."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "3. Bildgenerierung: ChatGPT",
    "anchor": "#3-bildgenerierung-chatgpt",
    "category": "Grundlagen",
    "text": "ChatGPT verfügt über eine native Bildgenerierung mit GPT-4o, die präzise Textdarstellung in Bildern und detaillierte Prompt-Befolgung ermöglicht. Das Tool kann bis zu 10-20 verschiedene Objekte in einem Bild handhaben und lernt aus dem Chat-Kontext."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "4. Arbeiten mit Dokumenten und Lernen: NotebookLM",
    "anchor": "#4-arbeiten-mit-dokumenten-und-lernen-notebooklm",
    "category": "Grundlagen",
    "text": "NotebookLM von Google transformiert deine Dokumente (PDFs, Google Docs, YouTube-Videos) in einen personalisierten KI-Rechercheassistenten und kann sogar Audio-Zusammenfassungen als Podcast-Diskussion erstellen. Das Tool arbeitet ausschließlich mit deinen hochgeladenen Quellen und nutzt diese nicht für das Training."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "5. KI-Websuche: Perplexity",
    "anchor": "#5-ki-websuche-perplexity",
    "category": "Grundlagen",
    "text": "Perplexity kombiniert Suchmaschinen-Funktionalität mit KI-Intelligenz und liefert dir präzise Antworten mit Quellenangaben. Das Tool ist ideal für Recherchen und das Auffinden aktueller Informationen im Internet."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "6. Coden: Claude Code",
    "anchor": "#6-coden-claude-code",
    "category": "Grundlagen",
    "text": "Claude Code ist speziell für Entwickler konzipiert und arbeitet direkt in deinem Terminal, um ganze Codebasen zu durchsuchen und mehrstufige Workflows in einen einzigen Befehl zu verwandeln. Das Tool kann koordinierte Änderungen über mehrere Dateien hinweg vornehmen und integriert sich nahtlos mit VS Code, JetBrains IDEs und deinen bestehenden Entwicklungstools."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "7. Europäische KI: Mistral",
    "anchor": "#7-europäische-ki-mistral",
    "category": "Grundlagen",
    "text": "Mistral ist eine französische KI-Alternative, die DSGVO-konform arbeitet und keine persönlichen Daten für das Training verwendet. Das Tool kann Texte aus Bildern und PDFs erkennen, arbeitet mit bis zu 1.000 Wörtern pro Sekunde und bietet Zugang zu geprüften Informationen durch die Zusammenarbeit mit der Nachrichtenagentur AFP."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "8. Deutsche KI: Ionos GPT",
    "anchor": "#8-deutsche-ki-ionos-gpt",
    "category": "Grundlagen",
    "text": "Ionos GPT ist eine kostenlose, deutsche KI-Alternative zu ChatGPT, die DSGVO-konform in deutschen Rechenzentren betrieben wird und keine Datenübermittlung in Drittstaaten vornimmt. Das Tool bietet dir spezialisierte Assistenten für Textgenerierung, Bildbearbeitung, Programmierung und Recherche und nutzt ausschließlich Open-Source-Modelle wie Llama und Mistral ohne deine Daten für Training zu verwenden."
  },
  {
    "url": "/docs/grundlagen/welches-ki-tool-wofuer",
    "pageTitle": "Welches KI-Tool wofür",
    "heading": "9. Videoerstellung: Veo 3",
    "anchor": "#9-videoerstellung-veo-3",
    "category": "Grundlagen",
    "text": "Veo 3 erstellt KI-Videos mit perfekt synchronisiertem Audio, einschließlich Soundeffekten, Dialog und Umgebungsgeräuschen aus einfachen Textbeschreibungen oder Bildreferenzen. Das Tool bietet realistische Lippenbewegungen, physikbasierte Videosimulation und kann über Googles Flow-Video-Editor zu cineastischen Clips verarbeitet werden."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "Grundlagen",
    "anchor": "",
    "category": "Grundlagen",
    "text": "Ein großes Sprachmodell, wie zum Beispiel ChatGPT , ist ein KI-Modell, das darauf trainiert ist, menschenähnlichen Text zu verstehen und zu erzeugen. Es ist im Kern eine hochentwickelte Anwendung von Sprachverarbeitung (NLP), maschinellem Lernen und Deep Learning. In vielen Filmen und Serien, insbesondere Kinderfilmen, gibt es die Rolle des alten weisen Mannes oder der alten weisen Frau, die als Mentor oder Mentorin gilt. Diese Leute haben über viele Jahre unfassbar viel gelesen, unfassbar viel Wissen angehäuft. Stellt euch ein LLM grundsätzlich so ähnlich vor, nur eben viel viel schneller trainiert."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "1. Eingabeverarbeitung (Input Embedding & Tokenisierung)",
    "anchor": "#1-eingabeverarbeitung-input-embedding--tokenisierung",
    "category": "Grundlagen",
    "text": "Zuerst wird die Frage in kleinere \"Bausteine\" zerlegt, was man Tokenisierung nennt. Aus dem Satz werden einzelne Wörter wie \"Wie\", \"können\", \"Luftqualität\", \"Stadtgemeinde\" usw gezogen. Jeder dieser Bausteine wird dann in eine Reihe von Zahlen umgewandelt – einen numerischen Vektor. Stell dir vor, dass Wörtern mit ähnlicher Bedeutung auch ähnliche Zahlen zugewiesen werden. So könnte der Zahlencode für \"Luftqualität\" nah am Code für \"Emissionen\" oder \"Feinstaub\" liegen, während \"Kommunen\" auf den lokalen Kontext hinweist."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "2. Kontext erfassen (Encoder)",
    "anchor": "#2-kontext-erfassen-encoder",
    "category": "Grundlagen",
    "text": "Die Sequenz dieser Zahlencodes wird dann von einem Teil des Modells, dem Encoder, verarbeitet. Dieser Encoder \"liest\" die Abfolge der Bausteine und erfasst die Beziehungen zwischen ihnen, um den gesamten Kontext und die Bedeutung Ihrer Frage zu verstehen. Er erkennt also, dass es um die nachhaltige Verbesserung der Luftqualität innerhalb einer Kommune geht."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "3. Antwort-Ideen entwickeln (Decoder)",
    "anchor": "#3-antwort-ideen-entwickeln-decoder",
    "category": "Grundlagen",
    "text": "Die vom Encoder verstandene Information wird an einen anderen Teil des Modells, den Decoder, weitergegeben. Der Decoder beginnt nun, eine Sequenz von Zahlencodes zu generieren, die potenzielle Lösungsansätze für Ihre Frage darstellen. Das könnten Ideen sein wie \"Ausbau des öffentlichen Nahverkehrs\", \"Förderung von Elektromobilität\", \"Erweiterung von Grünflächen\" oder \"Einführung strengerer Emissionsstandards für Unternehmen\"."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "4. Fokus setzen (Aufmerksamkeitsmechanismus)",
    "anchor": "#4-fokus-setzen-aufmerksamkeitsmechanismus",
    "category": "Grundlagen",
    "text": "Während der Decoder diese Lösungsansätze generiert, nutzt er einen Aufmerksamkeitsmechanismus. Das ist wie ein Spotlight, das sich selektiv auf die Teile Ihrer ursprünglichen Frage konzentriert, die für die gerade erzeugte Antwort am relevantesten sind. Wenn das Modell beispielsweise \"Ausbau des öffentlichen Nahverkehrs\" vorschlägt, könnte sich der Fokus auf die Wörter \"Luftqualität\" und \"Kommune\" in Ihrer Frage richten, da dies direkt mit der Lösung in Verbindung steht. Dies hilft dem Modell, maßgeschneiderte Antworten zu geben."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "5. Wahrscheinlichkeiten abwägen (Output Projection)",
    "anchor": "#5-wahrscheinlichkeiten-abwägen-output-projection",
    "category": "Grundlagen",
    "text": "Zuletzt werden die vom Decoder erzeugten Zahlencodes durch weitere Schichten geleitet, die eine Wahrscheinlichkeitsverteilung über mögliche nächste Wörter oder Lösungsvorschläge erzeugen. Das Modell wählt dann das Wort oder die Phrase aus, die am wahrscheinlichsten ist, basierend auf dem, was es gelernt hat. Dieser Prozess wird Wort für Wort wiederholt, bis eine vollständige und kohärente Antwort generiert wurde."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "Der Lernprozess (Training)",
    "anchor": "#der-lernprozess-training",
    "category": "Grundlagen",
    "text": "Damit ein LLM menschenähnlich sprechen kann, muss es \"lernen\". Dieser Lernprozess, das Training, ist entscheidend: Riesige Datenmengen: Modelle wie GPT-4, das lange Zeit die Basis für ChatGPT bildete, wurden mit gigantischen Textmengen trainiert – für GPT-4 waren das 300 Milliarden Wörter. Diese Texte stammen aus dem Internet, aber das Modell weiß nicht, welche spezifischen Dokumente Teil seines Trainings waren. Es lernt daraus Sprachmuster, Grammatik, Fakten und Zusammenhänge, ohne diese explizit als Regeln programmiert bekommen zu haben. Menschliche Aufsicht: Der Lernprozess wird oft durch menschliches Feedback verbessert. Das Modell erhält positives oder negatives Feedback zu seinen Antworten, wodurch es seine Fähigkeiten weiter verfeinert, kohärentere und passendere Texte zu erzeugen. Hyperparameter: Das sind wie die \"Lernregeln\" des Modells. Sie beeinflussen, wie schnell und präzise das Modell lernt, indem sie ihm helfen, den Kontext besser zu erkennen und verschiedene Eingaben und Ausgaben zu verwalten. Das Transformer-Modell ist die spezielle Architektur eines neuronalen Netzwerks, die bei ChatGPT zum Einsatz kommt und besonders gut darin ist, zusammenhängende Textsequenzen "
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "Die Bausteine: Neuronale Netzwerke",
    "anchor": "#die-bausteine-neuronale-netzwerke",
    "category": "Grundlagen",
    "text": "Der wichtigste Bestandteil eines LLM ist ein neuronales Netzwerk. Stellt euch das wie ein riesiges, komplexes Rechenmodell vor, das die Funktionsweise des menschlichen Gehirns nachahmt. Es besteht aus vielen miteinander verbundenen \"Einheiten\", die man als Neuronen bezeichnen könnte. Diese Neuronen sind über \"Verbindungen\" miteinander verknüpft, denen Gewichte zugewiesen sind. Jedes Neuron empfängt Informationen und gibt basierend auf einfachen Regeln eine Ausgabe weiter. Das Netzwerk lernt, indem es diese Gewichte anpasst – so wie wir durch Erfahrung lernen, unsere Reaktionen zu verfeinern."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "Neuere Modelle wie GPT-4 können noch mehr:",
    "anchor": "#neuere-modelle-wie-gpt-4-können-noch-mehr",
    "category": "Grundlagen",
    "text": "Internetverbindung: Sie können sich mit dem Internet verbinden, um auf aktuelle Informationen zuzugreifen und so relevantere und aktuellere Antworten zu geben. Plugins: Sie können mit zusätzlichen Software-Tools, sogenannten Plugins, erweitert werden. Diese Plugins ermöglichen dem Modell, neue Funktionen zu nutzen, wie zum Beispiel Bilder zu generieren, Sprachen zu übersetzen oder sogar Musik zu komponieren. Multimodalität: GPT-4 ist multimodal, was bedeutet, dass es Informationen in verschiedenen Formen verarbeiten und erzeugen kann. Es kann beispielsweise Fragen zu Bildern beantworten oder Bilder aus Textbeschreibungen erstellen."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "Quelle",
    "anchor": "#quelle",
    "category": "Grundlagen",
    "text": "Dieser Grünerator-Guide basiert auf wissenschaftlichen Erkenntnissen aus: Briganti, G. (2024). How ChatGPT works: a mini review. European Archives of Oto-Rhino-Laryngology, 281, 1565–1569."
  },
  {
    "url": "/docs/grundlagen/wie-llms-funktionieren",
    "pageTitle": "Grundlagen",
    "heading": "Wie ein LLM eine Antwort generiert",
    "anchor": "#wie-ein-llm-eine-antwort-generiert",
    "category": "Grundlagen",
    "text": "Nehmen wir an, wir stellen chatgpt diese Frage: „Wie können wir die Luftqualität in unserer Kommune nachhaltig verbessern?\" Wie würde ChatGPT diese Frage beantworten?"
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "GrünOMat einbetten",
    "anchor": "",
    "category": "Integrationen",
    "text": "Dieser Artikel ist über draft: true aus dem Build genommen und nicht aktuell. Zwei Dinge müssen geprüft werden, bevor er wieder freigegeben wird: Die Sammlungstabelle ist unvollständig. Sie listet fünf Sammlungen; tatsächlich akzeptiert das Widget jede Sammlung aus SYSTEMCOLLECTIONS (apps/api/config/systemCollectionsConfig.ts) — die Validierung läuft über isSystemCollectionId(), nicht über eine kurze Auswahlliste. Beim Reaktivieren gehört die Tabelle an reference.json gehängt, nicht neu abgetippt. Die Aussage zu localhost ist vermutlich falsch. Der Artikel behauptet, für lokale Tests brauche es keine Freischaltung, weil 'self' immer erlaubt sei. 'self' in frame-ancestors meint aber die Herkunft der eingebetteten Ressource (gruen-o-mat.eu), nicht die Seite der Entwickler*in. Wer die Schnellstart-Zeile in eine lokale HTML-Datei kopiert, dürfte vom Browser blockiert werden. Das ist nicht verifiziert — es gehört ausprobiert, bevor es jemand befolgt. Der übrige Inhalt wurde gegen apps/gruen-o-mat/public/embed.js geprüft und stimmt (Attribute, Vorgabewerte, window.GruenOMat-API, Shadow-DOM, Lazy-Load, Mobil-Vollbild). Der GrünOMat lässt sich als Chat-Widget auf externen Websites einbinde"
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "Beispiel mit allen Optionen",
    "anchor": "#beispiel-mit-allen-optionen",
    "category": "Integrationen",
    "text": "Das Widget nutzt Shadow DOM — die CSS-Stile deiner Website beeinflussen das Widget nicht und umgekehrt."
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "Domain-Freischaltung",
    "anchor": "#domain-freischaltung",
    "category": "Integrationen",
    "text": "Aus Sicherheitsgründen muss die Domain, auf der das Widget eingebettet wird, freigeschaltet werden. Ohne Freischaltung blockiert der Browser das Laden des Chat-Fensters (iframe). Um deine Domain freischalten zu lassen, schreib eine E-Mail an das Grünerator-Team mit der Domain (z.B. https://mein-kreisverband.de). Für lokale Tests (localhost) ist keine Freischaltung nötig — 'self' ist immer erlaubt."
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "Konfiguration",
    "anchor": "#konfiguration",
    "category": "Integrationen",
    "text": "Das Widget lässt sich über data- Attribute am Script-Tag konfigurieren: Attribut | Standard | Beschreibung | ----------------- | ------------------ | ------------------------------------------------------------------- | data-collection | gruene-de-system | Quellensammlung für den Chat (siehe unten) | data-mode | widget | Darstellung: widget (Button), inline (im Seiteninhalt), modal | data-container | — | CSS-Selektor des Ziel-Elements — Pflicht bei data-mode=\"inline\" | data-position | bottom-right | Position des Buttons: bottom-right oder bottom-left | data-color | #316049 | Farbe des Chat-Buttons und der Titelleiste | data-title | Grün-O-Mat | Titel im Chat-Fenster | Im modal-Modus öffnet sich ein zentrierter Dialog statt des Widget-Fensters. Zusätzlich gibt es eine JavaScript-API, um den Chat programmatisch zu steuern (z. B. von einem eigenen Button aus): window.GruenOMat.open(), .close() und .toggle()."
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "Schnellstart",
    "anchor": "#schnellstart",
    "category": "Integrationen",
    "text": "Füge folgendes Script-Tag am Ende deines ein: Das war's — auf deiner Seite erscheint ein grüner Chat-Button unten rechts, der den GrünOMat mit den Inhalten der Grünen Hamburg öffnet."
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "Technische Details",
    "anchor": "#technische-details",
    "category": "Integrationen",
    "text": "Das Widget lädt den Chat-Iframe erst beim ersten Klick auf den Button (kein Performance-Overhead beim Seitenaufruf) Mobilgeräte: Das Chat-Fenster wird automatisch im Vollbild angezeigt Schließen: Klick auf ✕, Klick auf den Hintergrund, oder Escape-Taste Der Chat-Button verwendet z-index: 2147483646 um über allen anderen Elementen zu liegen"
  },
  {
    "url": "/docs/integrationen/gruen-o-mat-einbetten",
    "pageTitle": "GrünOMat einbetten",
    "heading": "Verfügbare Sammlungen",
    "anchor": "#verfügbare-sammlungen",
    "category": "Integrationen",
    "text": "Collection-ID | Landesverband | --------------------------- | ------------------------ | hamburg-system | Grüne Hamburg | schleswig-holstein-system | Grüne Schleswig-Holstein | thueringen-system | Grüne Thüringen | bayern-system | Grüne Bayern | berlin-system | Grüne Berlin |"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Grünerator in ChatGPT & Co nutzen",
    "anchor": "",
    "category": "Integrationen",
    "text": "Du kannst den Grünerator direkt in ChatGPT, Claude, Mistral Le Chat oder OpenWebUI verwenden — ohne gruenerator.eu öffnen zu müssen. Dein KI-Assistent kann dann grüne Parteiprogramme durchsuchen, Positionen zu Themen finden und dir beim Schreiben politischer Texte helfen. MCP (Model Context Protocol) ist ein offener Standard, über den KI-Chatbots auf externe Datenquellen zugreifen können — hier sorgt es dafür, dass dein Chat-Assistent den Grünerator nutzen kann."
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "ChatGPT",
    "anchor": "#chatgpt",
    "category": "Integrationen",
    "text": "Öffne chatgpt.com und logge dich ein. Klicke oben rechts auf dein Profil → Settings. Wähle in der Sidebar Connectors. Aktiviere unter Advanced den Developer Mode, damit du eigene Verbindungen hinzufügen kannst. Klicke auf Create bzw. Add custom connector. Trage folgende Daten ein: Name: Grünerator URL: https://mcp.gruenerator.eu/mcp Auth: Keine (leer lassen) Speichern — der Grünerator steht nun in normalen Chats und in Deep Research als Datenquelle zur Verfügung. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Claude",
    "anchor": "#claude",
    "category": "Integrationen",
    "text": "Öffne claude.ai und logge dich ein. Klicke oben rechts auf dein Profil → Settings. Gehe in der linken Sidebar auf Integrations. Klicke auf Add integration. Trage folgende Daten ein: Name: Grünerator URL: https://mcp.gruenerator.eu/mcp Auth: Keine (leer lassen) Speichern — fertig! Claude nutzt den Grünerator nun automatisch, wenn es zu deiner Anfrage passt. Du kannst die Verbindung auch manuell im Chat aktivieren, indem du sie in der Tool-Auswahl anhakst. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Mistral Le Chat",
    "anchor": "#mistral-le-chat",
    "category": "Integrationen",
    "text": "Öffne chat.mistral.ai und logge dich ein. Gehe in der linken Sidebar auf Connectors (oder über Profil → Settings → Connectors). Klicke auf Add Connector. Wähle den Tab Custom MCP Connector. Trage folgende Daten ein: Name: Grünerator URL: https://mcp.gruenerator.eu/mcp Auth: Keine (leer lassen) Speichern. Im Chat die Verbindung aktivieren: In der Seitenleiste unter Connectors den Grünerator anhaken, oder im Prompt /Grünerator eingeben, um ihn als Tool zu aktivieren. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "OpenWebUI (für Fortgeschrittene)",
    "anchor": "#openwebui-für-fortgeschrittene",
    "category": "Integrationen",
    "text": "OpenWebUI ist eine selbst gehostete Chat-Oberfläche, die viele verschiedene KI-Modelle unterstützt. Ab Version 0.6 kann der Grünerator direkt eingebunden werden. Öffne die OpenWebUI-Einstellungen → Tools → MCP Servers. Füge einen neuen Server hinzu: Name: Grünerator URL: https://mcp.gruenerator.eu/mcp Speichern und im Chat als Tool aktivieren. ---"
  },
  {
    "url": "/docs/integrationen/ki-chat-einrichten",
    "pageTitle": "Grünerator in ChatGPT & Co nutzen",
    "heading": "Übersicht",
    "anchor": "#übersicht",
    "category": "Integrationen",
    "text": "Plattform | Wo einrichten? | URL | Anmeldung nötig? | ------------------- | -------------------------------------- | -------------------------------- | ---------------- | ChatGPT | Settings → Connectors (Developer Mode) | https://mcp.gruenerator.eu/mcp | Nein | Claude | Settings → Integrations | https://mcp.gruenerator.eu/mcp | Nein | Mistral Le Chat | Settings → Connectors → Custom MCP | https://mcp.gruenerator.eu/mcp | Nein | OpenWebUI | Settings → Tools → MCP Servers | https://mcp.gruenerator.eu/mcp | Nein | ---"
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
    "text": "Ein Konto bei einem der unterstützten KI-Chats (ChatGPT, Claude, Mistral Le Chat oder OpenWebUI) ChatGPT: Ein Plan mit Connector-Unterstützung (Plus, Pro oder Team)"
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
    "text": "Einige Dienste betreibt der Grünerator selbst. Sie stehen unter „Vom Grünerator bereitgestellt\" ganz oben in der Liste, sind ohne Einrichtung sofort nutzbar und brauchen weder Login noch Zugangsschlüssel: Du sprichst sie wie jeden anderen Konnektor per @-Mention an — etwa „Was steht in @gesetze zu § 823 BGB?\". Meistens brauchst du die Mention gar nicht: erkennt der Chat die passende Frage am Wortlaut, zieht er den Dienst von selbst heran. „Wann fahren heute Abend Züge von Kassel Richtung Berlin?\" — Abfahrten, Ankünfte und Störungen an einem Bahnhof. Keine Verbindungssuche mit Umstiegen oder Preisen. „Wie wird das Wetter am Samstag in Münster? Wir haben Infostand.\" — Vorhersage, aktuelles Wetter und Luftqualität. „Was sind heute die wichtigsten Nachrichten?\" — Meldungen der tagesschau, gesamt, nach Ressort oder Bundesland. „Such mir ein Hotel in Leipzig für den 12. bis 14. März.\" — Preisvergleich über trivago, Preise ohne Gewähr. „Was steht in § 823 BGB?\" — Normtext im Volltext, mit Prüfung, ob das Zitat existiert. Politische Fragen zu denselben Themen bleiben davon unberührt: „Was fordern die Grünen zur Bahnreform?\" ist eine Programmfrage und zieht keine Abfahrtstafel. Wenn du eine"
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
    "text": "In der Sektion Verbunden siehst du alle deine Dienste mit Status (Verbunden / Pausiert / Nicht autorisiert). Dort kannst du jeden Konnektor: per Schalter pausieren (bleibt verbunden, wird im Chat aber nicht genutzt), testen (zeigt die verfügbaren Werkzeuge des Servers), oder löschen — gespeicherte Zugangsdaten werden dabei entfernt. Die bereitgestellten Dienste stehen in einer eigenen Sektion darüber und zeigen Verfügbar bzw. Ausgeschaltet. Für sie gibt es Schalter und Test, aber kein Löschen. Zugangsdaten (Tokens) werden verschlüsselt auf EU-Servern gespeichert und ausschließlich für deine eigenen Chat-Anfragen verwendet. Der Zugriff auf einen Dienst erfolgt immer mit deinem Konto und dessen Berechtigungen — andere Nutzer*innen sehen deine Verbindungen nicht."
  },
  {
    "url": "/docs/integrationen/mcp-was-kann-ich-fragen",
    "pageTitle": "Was kann ich den MCP-Server fragen?",
    "heading": "Was kann ich den MCP-Server fragen?",
    "anchor": "",
    "category": "Integrationen",
    "text": "Du hast den Grünerator mit deinem KI-Chat verbunden — aber was kannst du damit eigentlich alles machen? Hier erfährst du, welche Fähigkeiten dir zur Verfügung stehen und wie du sie am besten nutzt. Der Grünerator MCP-Server gibt deinem KI-Assistenten Zugriff auf grüne Parteiprogramme, Beschlüsse, Analysen und Social-Media-Beispiele. Du kannst darin suchen, Inhalte filtern und sogar fertige Texte in verschiedenen Formaten erstellen lassen. ---"
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
    "heading": "Ergebnisse filtern",
    "anchor": "#ergebnisse-filtern",
    "category": "Integrationen",
    "text": "Du kannst die Suchergebnisse nach Kategorien einschränken. Sag der KI einfach, wonach du filtern möchtest: „Zeig mir nur Praxishilfen im KommunalWiki zum Thema Haushalt\" „Europa-Analysen der Böll-Stiftung\" „Nur Fachtexte der Bundestagsfraktion zur Energiewende\""
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
    "heading": "Notizbücher durchsuchen",
    "anchor": "#notizbücher-durchsuchen",
    "category": "Integrationen",
    "text": "Wenn du dich beim MCP-Server mit deinem Grünerator-Konto anmeldest, stehen zusätzlich Notizbuch-Werkzeuge bereit: deine Notebooks auflisten, durchsuchen und ihre Filter abfragen. Ohne Anmeldung tauchen sie gar nicht erst in der Werkzeugliste auf. Die Suche liefert dabei die gefundenen Textstellen, keine fertig formulierte Antwort — die schreibt dein KI-Assistent selbst daraus. Das ist der Unterschied zum Grünerator-Chat, der die Synthese übernimmt. „Liste meine Notebooks auf\" „Was steht in meinem Wahlkampf-Notebook zur Verkehrswende?\" ---"
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
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Wolke einbinden",
    "anchor": "",
    "category": "Konto & Projekte",
    "text": "Die Grüne Wolke ist unser sicherer Cloud-Speicher für alle grünen Organisationen. Mit der richtigen Konfiguration kannst du deine Dateien nahtlos mit dem Grünerator teilen und automatisch Dokumente hochladen lassen. Diese Anleitung zeigt dir, wie du einen öffentlichen Link mit den richtigen Berechtigungen erstellst."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Häufige Probleme und Lösungen",
    "anchor": "#häufige-probleme-und-lösungen",
    "category": "Konto & Projekte",
    "text": "Falls der Grünerator Probleme beim Hochladen hat, überprüfe zunächst die Berechtigungen deines Links. Die häufigste Ursache ist eine fehlende „Kann bearbeiten\"-Berechtigung. Öffne die Grüne Wolke und folge der Anleitung Schritt für Schritt."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 1: Ordner auswählen",
    "anchor": "#schritt-1-ordner-auswählen",
    "category": "Konto & Projekte",
    "text": "Öffne die Grüne Wolke in einem neuen Tab, melde dich an und wähle einen Ordner aus, in dem du deine Grünerator-Dateien speichern möchtest. Du kannst auch einen neuen Ordner erstellen. Ein eigener Ordner wie \"Grünerator\" oder \"Teilen\" hilft dabei, die Dateien organisiert zu halten."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 2: Öffentlichen Link erstellen",
    "anchor": "#schritt-2-öffentlichen-link-erstellen",
    "category": "Konto & Projekte",
    "text": "Wähle den Ordner aus und klicke rechts auf „Teilen\". Klicke dann unten auf „Öffentlichen Link erstellen\", um einen Freigabe-Link zu generieren."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 3: Berechtigungen konfigurieren",
    "anchor": "#schritt-3-berechtigungen-konfigurieren",
    "category": "Konto & Projekte",
    "text": "Nachdem der Link erstellt wurde, stelle sicher, dass unter „Link teilen\" die Berechtigung auf „Kann bearbeiten\" steht. Diese Berechtigung ist zwingend erforderlich, damit der Grünerator Dateien hochladen kann."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Schritt 4: Link kopieren und verwenden",
    "anchor": "#schritt-4-link-kopieren-und-verwenden",
    "category": "Konto & Projekte",
    "text": "Der öffentliche Link wurde erstellt! Im Grünerator führt dich unter Profil → Wolke ein Einrichtungs-Assistent Schritt für Schritt durch die Verbindung: Link einfügen, optional benennen — der Grünerator testet die Verbindung dann automatisch und zeigt dir bei Problemen konkrete Lösungshinweise. Der Link sollte etwa so aussehen: https://wolke.netzbegruenung.de/s/AbCdEfGhIj"
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Warum ist die richtige Konfiguration wichtig?",
    "anchor": "#warum-ist-die-richtige-konfiguration-wichtig",
    "category": "Konto & Projekte",
    "text": "Der Grünerator benötigt spezielle Berechtigungen, um automatisch generierte Dokumente in deinen Cloud-Ordner hochzuladen. Ohne die richtige Konfiguration können deine Dokumente nicht gespeichert werden."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Was du benötigst",
    "anchor": "#was-du-benötigst",
    "category": "Konto & Projekte",
    "text": "Für die Einrichtung brauchst du Zugang zur Grünen Wolke unter wolke.netzbegruenung.de, einen Ordner für deine Grünerator-Dateien und etwa 5 Minuten Zeit."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Weitere Tipps für die Nutzung",
    "anchor": "#weitere-tipps-für-die-nutzung",
    "category": "Konto & Projekte",
    "text": "Organisiere deine Dateien in thematischen Ordnern und nutze aussagekräftige Namen. So behältst du auch bei vielen generierten Dokumenten den Überblick. Die Grüne Wolke bietet zudem Versionierung, sodass du ältere Versionen deiner Dokumente jederzeit wiederherstellen kannst. Erstelle Unterordner für verschiedene Themen wie \"Anträge\", \"Pressemitteilungen\" oder \"Reden\". So findest du deine generierten Inhalte schneller wieder und kannst sie besser verwalten."
  },
  {
    "url": "/docs/konto/gruene-wolke",
    "pageTitle": "Wolke einbinden",
    "heading": "Wichtige Hinweise",
    "anchor": "#wichtige-hinweise",
    "category": "Konto & Projekte",
    "text": "Die Berechtigung „Kann bearbeiten\" ist zwingend erforderlich. Ein eigener Ordner wie „Grünerator\" hilft bei der Organisation. Der Link funktioniert auch ohne Ablaufdatum. Du kannst jederzeit die Berechtigungen ändern oder den Link deaktivieren."
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
    "text": "In einem Gruppen-Projekt gibt es zwei Rollen: Rolle | Was sie darf | ------------ | ------------------------------------------------------------------------- | Mitglied | Inhalte des Projekts sehen und mitarbeiten | Admin | zusätzlich Mitglieder verwalten und die Einstellungen des Projekts ändern | Du kannst Menschen per E-Mail einladen. Wer noch kein Konto hat, wird durch die Anmeldung geführt und landet danach direkt im Projekt. Ein Projekt kann außerdem auffindbar geschaltet werden. Dann können andere es finden und um Aufnahme bitten; die Anfrage geht an die Admins, die sie annehmen oder ablehnen. Ohne diese Einstellung ist ein Projekt nur über eine Einladung erreichbar."
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
    "text": "Beim Anlegen entscheidest du dich für eine der beiden: Eigenes Projekt — nur für dich. Gedacht, um die eigene Arbeit zu sortieren: alles zur Haushaltsdebatte an einem Ort, getrennt von allem zur Verkehrspolitik. Es taucht bei niemand anderem auf und lässt sich auch nicht finden. Gruppen-Projekt — für die Zusammenarbeit. Andere können Mitglied werden, sehen die zugeordneten Inhalte und arbeiten mit. Die Wahl legt dich nicht endgültig fest, aber sie bestimmt, ob überhaupt jemand anders hineinschauen kann — überleg also kurz, bevor du etwas Vertrauliches in ein Gruppen-Projekt legst."
  },
  {
    "url": "/docs/office/boards",
    "pageTitle": "Boards",
    "heading": "Boards",
    "anchor": "",
    "category": "Office",
    "text": "Ein Board ist eine Tafel aus Spalten und Karten — für Aufgabenverteilung, Redaktionsplanung oder den Stand einer Kampagne. Du legst es über an. Was Boards von einer gewöhnlichen Aufgabenliste unterscheidet: Der Grünerator kann darin mitarbeiten. Er beantwortet Fragen in Karten, recherchiert, und kann eine ganze Spalte automatisch befüllen."
  },
  {
    "url": "/docs/office/boards",
    "pageTitle": "Boards",
    "heading": "Auf dem Handy",
    "anchor": "#auf-dem-handy",
    "category": "Office",
    "text": "In der App kannst du Boards ansehen, aber nicht bearbeiten. Zum Verschieben von Karten und zum Einrichten von Grünerator-Spalten brauchst du die Web- oder Desktop-Version."
  },
  {
    "url": "/docs/office/boards",
    "pageTitle": "Boards",
    "heading": "Den Grünerator in einer Karte fragen",
    "anchor": "#den-grünerator-in-einer-karte-fragen",
    "category": "Office",
    "text": "Schreib in einem Kartenkommentar @Grünerator und dahinter deinen Auftrag. Die Antwort erscheint als Kommentar an derselben Karte — der Zusammenhang bleibt also dort, wo die Aufgabe steht. „@Grünerator recherchier den aktuellen Stand beim Radwegeausbau und fass das kurz zusammen.\" Standardmäßig antwortet er als Kommentar. Sagst du ausdrücklich, dass etwas anderes herauskommen soll, erzeugt er stattdessen ein eigenes Dokument und hängt es an die Karte: Was du schreibst | Was entsteht | ----------------------------------- | -------------------------------------------- | „…und mach eine Tabelle daraus\" | eine Tabelle, verknüpft mit der Karte | „…als Präsentation\" | eine Foliensammlung, verknüpft mit der Karte | „…leg daraus Aufgaben an\" | neue Karten im selben Board | „…schreib ein Dokument dazu\" | ein Textdokument, verknüpft mit der Karte | Tabellen, Präsentationen und Aufgabenlisten entstehen nur, wenn du sie ausdrücklich nennst. Das ist Absicht: Wer nur eine Frage stellt, soll eine Antwort bekommen und nicht ungefragt ein neues Dokument. Erzeugte Dokumente erben die Freigabe des Boards. Wer das Board sehen darf, sieht auch das Ergebnis — du musst nichts zusätzlich freigeben."
  },
  {
    "url": "/docs/office/boards",
    "pageTitle": "Boards",
    "heading": "Fertige Aufgaben",
    "anchor": "#fertige-aufgaben",
    "category": "Office",
    "text": "Reicht keine davon, gibst du stattdessen eine eigene Anweisung ein. Bei Recherche-Aufgaben sucht der Grünerator zuerst und formuliert danach — er schreibt nicht aus dem Gedächtnis. Bei zitierten Recherchen bekommst du die Quellen mitgeliefert; prüf sie, bevor etwas nach außen geht."
  },
  {
    "url": "/docs/office/boards",
    "pageTitle": "Boards",
    "heading": "Grünerator-Spalten",
    "anchor": "#grünerator-spalten",
    "category": "Office",
    "text": "Eine Grünerator-Spalte ist eine Spalte, die selbst arbeitet. Du richtest sie einmal ein, und danach durchläuft jede Karte drei Schritte: Quelle → Aufgabe → Ergebnis. Quelle — woher der Inhalt kommt: aus der Karte selbst, von einer Webadresse oder aus einem Social-Media-Beitrag. Aufgabe — was damit geschehen soll. Entweder eine der fertigen Aufgaben (unten) oder eine eigene Anweisung. Ergebnis — was dabei herauskommt: ein Kommentar, ein Dokument, eine Tabelle, eine Präsentation oder eine E-Mail. Das Ganze lässt sich auch nach Zeitplan laufen lassen — etwa jeden Montagmorgen."
  },
  {
    "url": "/docs/office/boards",
    "pageTitle": "Boards",
    "heading": "Spalten und Karten",
    "anchor": "#spalten-und-karten",
    "category": "Office",
    "text": "Spalten sind die Stationen, die eine Aufgabe durchläuft — „Ideen\", „In Arbeit\", „Fertig\". Karten wandern per Ziehen von einer Spalte in die nächste. Jede Karte hat einen Titel, eine Beschreibung, Kommentare und kann Personen zugewiesen werden."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Dokumente",
    "anchor": "",
    "category": "Office",
    "text": "Ein Dokument ist der Ort für Fließtext: Anträge, Pressemitteilungen, Protokolle, Notizen, Einladungen. Du legst es über an oder startest über aus einer Vorlage."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Aus einer Vorlage starten",
    "anchor": "#aus-einer-vorlage-starten",
    "category": "Office",
    "text": "Die Vorlagengalerie enthält die Textsorten, die in der politischen Arbeit immer wieder vorkommen — Antrag, Pressemitteilung, Protokoll, Redaktionsplan, Checkliste, Einladung. Eine Vorlage bringt die übliche Gliederung mit, sodass du nicht bei der Frage anfängst, welche Abschnitte überhaupt hineingehören."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Dateien einlesen",
    "anchor": "#dateien-einlesen",
    "category": "Office",
    "text": "Du kannst bestehende Dateien in ein Dokument einlesen — auch abfotografierte oder gescannte Seiten. Der Text wird dabei erkannt und als bearbeitbarer Inhalt eingefügt, statt nur als Bild zu erscheinen. Wenn du nur den Text aus einem Foto brauchst und kein Dokument daraus machen willst, ist der Scanner der direktere Weg."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Der Grünerator im Dokument",
    "anchor": "#der-grünerator-im-dokument",
    "category": "Office",
    "text": "Die Chat-Seitenleiste arbeitet am offenen Text: „formulier den zweiten Absatz sachlicher\", „mach eine Zusammenfassung an den Anfang\", „kürz das auf 2.000 Zeichen\". Anders als in Tabellen und Präsentationen gibt es hier keine feste Liste von Änderungsarten — es geht um Text, und der lässt sich frei umschreiben. Mehr dazu unter Der Grünerator im Editor. Bei Zahlen, Zitaten und Namen lohnt der zweite Blick, bevor ein Text nach außen geht. Mehr dazu unter Risiken und Gefahren von LLMs."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Frühere Fassungen",
    "anchor": "#frühere-fassungen",
    "category": "Office",
    "text": "Das Dokument merkt sich seinen Verlauf. Über die Versionsgeschichte siehst du frühere Stände und stellst sie bei Bedarf wieder her — nützlich, wenn beim gemeinsamen Überarbeiten ein Absatz verloren gegangen ist."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Gemeinsam arbeiten",
    "anchor": "#gemeinsam-arbeiten",
    "category": "Office",
    "text": "Mehrere Personen können gleichzeitig im selben Dokument schreiben. Die Änderungen der anderen erscheinen live, und du siehst an den farbigen Markierungen, wo gerade jemand arbeitet. Es gibt kein Sperren und kein „Datei ist in Benutzung\" — der Text führt die Beiträge zusammen. Wer hineinkommt, steuerst du über die Freigabe. Wie die Stufen funktionieren, steht unter Office."
  },
  {
    "url": "/docs/office/dokumente",
    "pageTitle": "Dokumente",
    "heading": "Schreiben",
    "anchor": "#schreiben",
    "category": "Office",
    "text": "Der Editor arbeitet mit Blöcken: Jeder Absatz, jede Überschrift, jede Liste ist ein eigener Baustein, den du per Anfasser verschieben kannst. Mit / mitten im Text öffnest du die Auswahl der Blocktypen — Überschrift, Liste, Zitat, Tabelle, Trennlinie."
  },
  {
    "url": "/docs/office/intro",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Office: Dokumente, Tabellen, Folien und Boards",
    "anchor": "",
    "category": "Office",
    "text": "Office ist der Ort für alles, was aus Text, Zahlen und Plänen besteht. Vier Arten von Dokumenten liegen dort nebeneinander: . Du findest sie über den Tab Arbeiten unter der Kachel ."
  },
  {
    "url": "/docs/office/intro",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Alles ist dasselbe Dokument",
    "anchor": "#alles-ist-dasselbe-dokument",
    "category": "Office",
    "text": "Das ist der wichtigste Gedanke hinter Office, und er erspart dir viel Sucherei: ein Board, eine Tabelle, eine Präsentation und ein Textdokument sind technisch dasselbe Ding, nur mit unterschiedlicher Oberfläche. Daraus folgt einiges, das sonst überraschend wäre: Alle vier tauchen in derselben Dokumentliste auf und lassen sich in dieselben Ordner einsortieren. Freigaben funktionieren überall gleich — was du über das Teilen einer Tabelle weißt, gilt genauso für ein Board. Alle vier lassen sich zu zweit oder zu zwanzigst gleichzeitig bearbeiten. Änderungen erscheinen live bei allen anderen. Jedes hat dieselbe Chat-Seitenleiste, über die der Grünerator direkt im Dokument mitarbeitet."
  },
  {
    "url": "/docs/office/intro",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Auf dem Handy",
    "anchor": "#auf-dem-handy",
    "category": "Office",
    "text": "Die Grünerator-App hat einen eigenen Office-Tab. Dokumente lassen sich dort lesen — Tabellen, Folien und Boards siehst du als Ansicht, nicht als Editor. Zum Bearbeiten öffnest du das Dokument im Browser. Der Präsentations-Editor ist inzwischen auch auf dem Handy bedienbar: Folienstreifen quer, Folien-Aktionen per Antippen statt per Mauszeiger, und der Text wird in einem eigenen Feld bearbeitet statt direkt auf der verkleinerten Folie. Für Tabellen bleibt der große Bildschirm die bessere Wahl."
  },
  {
    "url": "/docs/office/intro",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Der Grünerator im Dokument",
    "anchor": "#der-grünerator-im-dokument",
    "category": "Office",
    "text": "In jedem Office-Dokument gibt es eine Chat-Seitenleiste. Was du dort schreibst, wirkt auf das offene Dokument: „mach die Kopfzeile fett\", „füg eine Folie zu den Kosten ein\", „sortier nach Datum\". Wie das genau funktioniert und was dabei zu beachten ist, steht unter Der Grünerator im Editor. Was in den einzelnen Dokumentarten möglich ist, steht in den jeweiligen Kapiteln: Dokumente — Text schreiben, gemeinsam bearbeiten, Versionen Tabellen — Formeln, Filter, Import und Export Präsentationen — Folien, Vortragsmodus, Export Boards — Aufgaben, Karten und automatische Spalten"
  },
  {
    "url": "/docs/office/intro",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Etwas Neues anlegen",
    "anchor": "#etwas-neues-anlegen",
    "category": "Office",
    "text": "Auf der Office-Startseite liegen fünf Kacheln. Vier davon legen sofort etwas Leeres an und öffnen es — es gibt keinen Zwischenschritt, kein Formular: — ein Textdokument — eine Kalkulationstabelle — eine Foliensammlung — ein Kanban-Board Die fünfte, , öffnet stattdessen die Vorlagengalerie. Nimm sie, wenn du nicht bei null anfangen willst: Anträge, Pressemitteilungen und Protokolle bringen ihre Gliederung schon mit. Du musst nicht erst ein leeres Dokument anlegen. „Erstell mir eine Tabelle mit dem Haushaltsentwurf\" oder „Mach eine Präsentation zu unserem Wahlprogramm\" im Chat erzeugt das fertige Dokument direkt — inklusive Inhalt. Bearbeiten kannst du es danach wie jedes andere."
  },
  {
    "url": "/docs/office/intro",
    "pageTitle": "Office: Dokumente, Tabellen, Folien und Boards",
    "heading": "Teilen",
    "anchor": "#teilen",
    "category": "Office",
    "text": "Ein Dokument kennt Stufen von Sichtbarkeit: Sichtbarkeit | Wer kommt hinein | -------------- | ---------------------------------------------------------- | privat | nur du und ausdrücklich eingeladene Personen | angemeldet | alle, die im Grünerator angemeldet sind und den Link haben | öffentlich | alle mit dem Link, auch ohne Anmeldung | Unabhängig davon legst du fest, ob Eingeladene lesen oder bearbeiten dürfen. Beides lässt sich jederzeit ändern und zurücknehmen. Ein öffentlich geteiltes Dokument kann jede Person mit dem Link aufrufen — auch ohne Grünerator-Konto. Prüf vor dem Umschalten, ob im Dokument Namen, Adressen oder interne Absprachen stehen."
  },
  {
    "url": "/docs/office/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Der Grünerator im Editor",
    "anchor": "",
    "category": "Office",
    "text": "Jedes Office-Dokument hat eine Chat-Seitenleiste. Sie sieht aus wie der normale Chat und kann auch dasselbe — recherchieren, nachschlagen, Texte schreiben. Der Unterschied: Sie kennt das geöffnete Dokument und kann es verändern."
  },
  {
    "url": "/docs/office/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Gute Aufträge",
    "anchor": "#gute-aufträge",
    "category": "Office",
    "text": "Sag das Ziel, nicht den Weg. „Sortier nach Datum, neueste zuerst\" ist besser als eine Beschreibung, welche Zellen zu vertauschen sind. Beziehe dich auf Sichtbares. „Die dritte Spalte\", „die Folie mit den Zahlen\", „die Zeilen mit überschrittener Frist\" — der Grünerator sieht dasselbe wie du. Bau in Schritten. Große Umbauten gelingen zuverlässiger als Folge kleiner Aufträge. Pro Auftrag sind in Tabellen bis zu Änderungen möglich, in Präsentationen bis zu — wer mehr in einen Satz packt, bekommt eher ein halbes Ergebnis. Nachfassen ist normal. „Nicht so kräftig\", „nur die ersten zehn Zeilen\", „doch lieber absteigend\" — der Zusammenhang bleibt erhalten."
  },
  {
    "url": "/docs/office/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Was nicht geht",
    "anchor": "#was-nicht-geht",
    "category": "Office",
    "text": "Nicht jede Fähigkeit steht in jeder Dokumentart bereit. Was in Tabellen und Präsentationen möglich ist, steht als Liste in den jeweiligen Kapiteln — Tabellen und Präsentationen. Beide Listen kommen direkt aus dem Programmcode und zeigen auch, was vorübergehend abgeschaltet ist. Er gestaltet nicht frei. Der Grünerator setzt Inhalte und Formatierungen, entwirft aber kein Layout von Grund auf. Er arbeitet immer nur am geöffneten Dokument. „Übertrag das ins andere Board\" funktioniert nicht — dafür wechselst du dorthin und gibst den Auftrag erneut. Gerade bei Zahlen gilt: Der Grünerator kann eine Formel richtig setzen und trotzdem die falsche Spalte gemeint haben. Ein kurzer Blick auf das Ergebnis lohnt sich, bevor die Tabelle in eine Entscheidung einfließt."
  },
  {
    "url": "/docs/office/ki-im-editor",
    "pageTitle": "Der Grünerator im Editor",
    "heading": "Wie eine Änderung abläuft",
    "anchor": "#wie-eine-änderung-abläuft",
    "category": "Office",
    "text": "Du schreibst einen Auftrag in normaler Sprache. Der Grünerator übersetzt ihn in konkrete Änderungen und wendet sie an. Für dich sieht das aus wie ein einziger Schritt, aber es lohnt zu wissen, was dabei passiert: Er sieht sich das Dokument an. Was gerade darin steht, ist die Grundlage — deshalb funktionieren Bezüge wie „die Spalte mit den Kosten\" oder „die Folie mit dem Zitat\". Er recherchiert, falls nötig. „Trag die aktuellen Umfragewerte ein\" heißt: erst nachsehen, dann eintragen. Er ändert das Dokument — direkt, ohne dass du etwas bestätigen musst. Änderungen des Grünerators sind keine Sonderform. Strg + Z (bzw. Cmd + Z ) nimmt sie zurück wie eine eigene Eingabe — und ein Auftrag, der mehrere Änderungen umfasst, wird als ein Schritt zurückgenommen, nicht Zelle für Zelle. Arbeitet ihr zu mehreren am selben Dokument, sehen die anderen die Änderungen live — wie bei deinen eigenen."
  },
  {
    "url": "/docs/office/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Präsentationen",
    "anchor": "",
    "category": "Office",
    "text": "Eine Präsentation ist eine Folge von Folien mit eigenem Vortragsmodus. Du legst sie über an — oder lässt sie dir im Chat aus einem Thema erzeugen."
  },
  {
    "url": "/docs/office/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Aus einem Thema wird ein Foliensatz",
    "anchor": "#aus-einem-thema-wird-ein-foliensatz",
    "category": "Office",
    "text": "Das ist der eigentliche Nutzen — du fängst nicht mit einer leeren Folie an: „Mach mir eine Präsentation über unsere Verkehrspolitik für die Mitgliederversammlung, etwa zehn Folien.\" Der Grünerator recherchiert, gliedert und legt die Folien an — mit Titeln, Inhalten und Notizen für den Vortrag. Danach überarbeitest du einzelne Folien ganz normal weiter. Genauso funktioniert der Anschluss an eine Recherche: Wenn du vorher etwas nachgeschlagen hast, genügt „Mach eine Präsentation daraus\"."
  },
  {
    "url": "/docs/office/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Exportieren",
    "anchor": "#exportieren",
    "category": "Office",
    "text": "Über Download in der Kopfzeile stehen zwei Formate zur Wahl: Als PDF — öffnet die Präsentation in einem neuen Tab in einer druckfertigen Ansicht und dann den Druckdialog. Wähle dort als Ziel „Als PDF speichern\"; Querformat und Hintergrundgrafiken sind bereits gesetzt. Du bekommst eine Seite pro Folie, im selben Design wie im Vortragsmodus. Als PowerPoint (.pptx) — erzeugt eine bearbeitbare Datei für PowerPoint und LibreOffice Impress: Texte, Aufzählungen, Farben, Logo und Sprechernotizen bleiben erhalten. Die Datei verweist auf die Grünen-Hausschriften, kann sie aber nicht mitliefern. Auf einem Rechner ohne diese Schriften ersetzt PowerPoint sie durch eine ähnliche — der Text bleibt vollständig, das Schriftbild weicht ab. Wenn das Aussehen zählt, nimm den PDF-Weg. Wer die Präsentation nur über einen Freigabe-Link geöffnet hat, kann sie als PDF exportieren, aber nicht als .pptx."
  },
  {
    "url": "/docs/office/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Folien aufbauen",
    "anchor": "#folien-aufbauen",
    "category": "Office",
    "text": "Jede Folie hat ein Layout, das bestimmt, wie Titel und Inhalt angeordnet sind — insgesamt gibt es davon, von der Titelfolie über zweispaltige Folien bis zum Zitat und zum Codebeispiel. Dazu kommen pro Folie: Notizen — dein Text zum Vortrag, für das Publikum unsichtbar Hintergrund — eine Farbe, ein Bild oder ein Verlauf Schriftgröße — normalerweise „Auto\": der Text verkleinert sich so weit, dass er auf die Folie passt, statt abgeschnitten zu werden. Wird es dir zu klein oder zu groß, legst du die Größe von XS bis XL selbst fest Schrittweises Einblenden — Aufzählungspunkte erscheinen nacheinander statt auf einmal Übergang — wie die Folie die vorherige ablöst Was für die ganze Präsentation gilt — Standardübergang, Akzentfarbe, Foliennummern, automatisches Weiterschalten — stellst du einmal zentral ein."
  },
  {
    "url": "/docs/office/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Vortragen",
    "anchor": "#vortragen",
    "category": "Office",
    "text": "Im Präsentationsmodus läuft die Präsentation bildschirmfüllend. Du blätterst mit den Pfeiltasten; deine Notizen bleiben dabei für das Publikum unsichtbar."
  },
  {
    "url": "/docs/office/praesentationen",
    "pageTitle": "Präsentationen",
    "heading": "Was der Grünerator an der Präsentation ändern kann",
    "anchor": "#was-der-grünerator-an-der-präsentation-ändern-kann",
    "category": "Office",
    "text": "Schreib in der Chat-Seitenleiste, was passieren soll. Folien sprichst du dabei über ihre Nummer an („Folie 3\") oder über ihren Inhalt („die Folie mit den Zahlen\"). Pro Auftrag führt der Grünerator bis zu Änderungen aus. Wenn du „mach den Titel von Folie 2 kürzer\" sagst, bleibt alles andere an dieser Folie unangetastet — Inhalt, Notizen, Hintergrund. Du musst nie die ganze Folie neu beschreiben, nur weil du eine Kleinigkeit ändern willst. Welche Änderungen möglich sind, stammt direkt aus dem Programmcode. Kommt eine neue Fähigkeit dazu, meldet sich die Doku-Prüfung automatisch, bis sie hier mit einem Beispielsatz beschrieben ist."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Tabellen",
    "anchor": "",
    "category": "Office",
    "text": "Eine Grünerator-Tabelle ist eine vollwertige Kalkulationstabelle: Formeln, Filter, Sortierung, Auswahllisten, bedingte Formatierung. Du legst sie über auf der Office-Startseite an — oder du lässt sie dir im Chat gleich mit Inhalt erzeugen."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Bestehende Dateien importieren",
    "anchor": "#bestehende-dateien-importieren",
    "category": "Office",
    "text": "Über Tabelle importieren kannst du vorhandene Dateien hochladen. Unterstützt sind , bis pro Datei. Die Umwandlung passiert vollständig in deinem Browser — die Datei wird dafür nicht an einen Server geschickt. Aus dem Import entsteht eine neue Grünerator-Tabelle. Die Ursprungsdatei bleibt unberührt."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Eine Tabelle mit Inhalt entstehen lassen",
    "anchor": "#eine-tabelle-mit-inhalt-entstehen-lassen",
    "category": "Office",
    "text": "Der schnellste Weg zu einer gefüllten Tabelle führt über den Chat, nicht über das leere Blatt: „Erstell mir eine Tabelle mit allen Ortsverbänden im Kreis, je einer Spalte für Ansprechperson, E-Mail und Mitgliederzahl.\" Daraus entsteht eine fertige Tabelle, die du danach ganz normal weiterbearbeitest. Genauso funktioniert es im Anschluss an eine Recherche: „Mach mir daraus eine Tabelle\" nimmt die Ergebnisse des vorherigen Schritts als Grundlage."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Exportieren",
    "anchor": "#exportieren",
    "category": "Office",
    "text": "Über das Menü lädst du die Tabelle als .xlsx herunter. Dabei gilt eine Einschränkung, die du kennen solltest: Farben, Schriftschnitte, bedingte Formatierung und Auswahllisten gehen beim Export verloren. Die Zahlen und Formeln kommen vollständig in Excel an, das Aussehen musst du dort neu setzen. Wenn das Aussehen zählt, teile stattdessen die Grünerator-Tabelle selbst per Link — dort bleibt alles erhalten."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Ordnung in großen Tabellen",
    "anchor": "#ordnung-in-großen-tabellen",
    "category": "Office",
    "text": "Filter blenden Zeilen aus, ohne sie zu löschen — praktisch, um nur einen Ortsverband anzusehen. Sortieren bringt einen Bereich in Reihenfolge, etwa nach Datum oder Betrag. Auswahllisten legen fest, was in einer Spalte stehen darf. Statt frei getippter Status-Wörter gibt es dann ein Klappmenü mit „offen\", „in Arbeit\", „erledigt\" — das hält die Spalte auswertbar. Bedingte Formatierung färbt Zellen automatisch nach einer Regel. Die Farbe folgt dem Wert und aktualisiert sich mit, wenn sich die Zahl ändert. Kommentare und Notizen hängen an einzelnen Zellen, für Rückfragen an Mitschreibende."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Rechnen",
    "anchor": "#rechnen",
    "category": "Office",
    "text": "Formeln funktionieren wie gewohnt — =SUMME(B2:B20), =MITTELWERT(C:C) — und lassen sich auch diktieren: „Rechne in D2 die Summe der Spalte B\". Wichtig ist der Unterschied zwischen Wert und Darstellung: Eine Zahl als Euro-Betrag zu formatieren ändert nur, wie sie aussieht. Der gespeicherte Wert bleibt gleich, und Rechnungen darauf stimmen weiterhin. Tabellen wandeln „01067\" gern in die Zahl 1067 um und „2-2\" in ein Datum. Sag beim Eintragen dazu, dass es Text bleiben soll: „Trag die Postleitzahlen als Text ein.\" Dann bleiben führende Nullen erhalten."
  },
  {
    "url": "/docs/office/tabellen",
    "pageTitle": "Tabellen",
    "heading": "Was der Grünerator in der Tabelle ändern kann",
    "anchor": "#was-der-grünerator-in-der-tabelle-ändern-kann",
    "category": "Office",
    "text": "Schreib in der Chat-Seitenleiste, was passieren soll. Du musst keine Fachbegriffe treffen — die Beispielsätze unten zeigen die Formulierungen, die zuverlässig funktionieren. Pro Auftrag führt der Grünerator bis zu Änderungen aus; größere Umbauten teilst du besser auf. Änderungen des Grünerators landen im normalen Rückgängig-Verlauf. Ein Strg + Z (bzw. Cmd + Z ) nimmt sie zurück wie eine eigene Eingabe. Welche Änderungen möglich sind, stammt direkt aus dem Programmcode. Kommt eine neue Fähigkeit dazu, meldet sich die Doku-Prüfung automatisch, bis sie hier mit einem Beispielsatz beschrieben ist — und was abgeschaltet wurde, verschwindet von selbst aus der Liste."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Barrierefreiheit",
    "anchor": "",
    "category": "Über den Grünerator",
    "text": "Diese Seite sagt, wie barrierefrei der Grünerator heute ist — einschließlich der Stellen, an denen er es noch nicht ist. Eine geschönte Liste hilft niemandem: Wer auf eine Barriere stößt, die hier nicht steht, verliert Zeit mit der Frage, ob es an ihm liegt. Stand: 2. August 2026."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Der aktuelle Stand: teilweise konform",
    "anchor": "#der-aktuelle-stand-teilweise-konform",
    "category": "Über den Grünerator",
    "text": "Behoben und nachgemessen sind unter anderem: Die eingeklappte Hauptnavigation. Sie war mit Screenreader unbenutzbar — die Beschriftungen der Knöpfe waren nicht nur unsichtbar, sondern vollständig aus der Vorlesereihenfolge entfernt. Das war mit Abstand die schwerste Barriere. Der Sprung-Link „Zum Inhalt springen\" ist jetzt für alle standardmäßig an. Vorher musste man ihn in den Einstellungen erst finden und einschalten — ein Hilfsmittel, das man suchen muss, ist keines. Die Tastaturfalle im Untertitel-Werkzeug. Die Tabulatortaste kam aus der Segmentliste nicht mehr heraus. Jetzt wechseln die Pfeiltasten das Segment, und Tab bleibt Tab. Aufgabenkarten auf Boards haben einen echten Ziehgriff, der per Tastatur bedienbar ist. Ziehen mit der Maus funktioniert weiter auf der ganzen Karte. Weißer Text auf den Markenfarben erreichte den geforderten Kontrast nicht. Das betraf den Marken-Button, den Sprung-Link und alle Abzeichen in Eukalyptus-Grün. Graue Textstufen erreichen jetzt in hellem wie dunklem Modus die geforderten 4,5:1. Rund 300 Bedienelemente der Mobil-App hatten keinen vorlesbaren Namen — mit Screenreader hörte man nur „Schaltfläche\", ohne zu erfahren, welche. Alle haben jetzt "
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Eine Barriere melden",
    "anchor": "#eine-barriere-melden",
    "category": "Über den Grünerator",
    "text": "Wenn dir etwas begegnet, das dich blockiert — auch wenn es hier schon steht: 📧 info@moritz-waechter.de Hilfreich ist: welche Seite, was du tun wolltest, und womit du arbeitest (Browser, Screenreader, Vergrößerung). Wir antworten innerhalb von zwei Wochen. Wenn eine Barriere nicht schnell zu beheben ist, sagen wir, wie wir sie umgehen können, solange sie besteht."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Einstellungen, die du selbst setzen kannst",
    "anchor": "#einstellungen-die-du-selbst-setzen-kannst",
    "category": "Über den Grünerator",
    "text": "Unter Einstellungen → Barrierefreiheit: Einstellung | Wirkung | --- | --- | Animationen reduzieren | Bewegung und Übergänge werden abgeschaltet. | Transparenz und Unschärfe reduzieren | Durchscheinende Flächen werden deckend. | Sprung-Link zum Inhalt anzeigen | Standardmäßig an. Ausschalten blendet ihn aus. | Hellen und dunklen Modus stellst du unter Einstellungen → Darstellung ein; der Grünerator folgt sonst der Einstellung deines Systems."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Rechtlicher Status dieser Seite",
    "anchor": "#rechtlicher-status-dieser-seite",
    "category": "Über den Grünerator",
    "text": "Diese Seite ist eine freiwillige Selbstauskunft, keine Erklärung zur Barrierefreiheit im Rechtssinn. Ob der Grünerator unter das deutsche Barrierefreiheitsstärkungsgesetz (BFSG) oder das österreichische Barrierefreiheitsgesetz (BaFG) fällt, ist noch nicht abschließend geklärt. Sobald das feststeht, wird diese Seite entsprechend umgestellt — mit den Bestandteilen, die dann verbindlich dazugehören. Wir sagen das ausdrücklich, weil eine falsche Konformitätsaussage schlechter wäre als keine."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Screenreader",
    "anchor": "#screenreader",
    "category": "Über den Grünerator",
    "text": "Wir haben die Oberfläche gegen ihren berechneten Accessibility-Tree geprüft, aber noch keinen vollständigen Durchlauf mit NVDA, JAWS oder VoiceOver gemacht. Automatische Prüfwerkzeuge finden erfahrungsgemäß nur 30 bis 40 Prozent der Barrieren; alles, was von Formulierung, Reihenfolge und Verständlichkeit abhängt, sehen sie nicht. Wir sagen deshalb ausdrücklich nicht zu, dass der Grünerator mit Screenreader gut bedienbar ist."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Tastaturbedienung",
    "anchor": "#tastaturbedienung",
    "category": "Über den Grünerator",
    "text": "Der Grünerator ist mit der Tastatur bedienbar. Mit Tab wanderst du vorwärts durch die Bedienelemente, mit Umschalt+Tab zurück, Enter und Leertaste lösen aus, Escape schließt Dialoge. Der erste Tabulatorsprung auf jeder Seite trifft „Zum Inhalt springen\" — damit überspringst du die Navigation. In Listen mit vielen gleichartigen Einträgen — etwa den Segmenten im Untertitel-Werkzeug — wechseln die Pfeiltasten innerhalb der Liste; Tab führt aus der Liste heraus."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Was noch nicht erfüllt ist",
    "anchor": "#was-noch-nicht-erfüllt-ist",
    "category": "Über den Grünerator",
    "text": "Statusmeldungen werden kaum angesagt. Wenn eine Chat-Antwort beginnt oder endet, ein Werkzeug arbeitet, ein Upload fertig wird oder ein Formular einen Fehler meldet, erfährt ein Screenreader das in den meisten Fällen nicht. Das ist derzeit die größte offene Lücke. Videos haben keine Untertitelspur. Der Grünerator kann Untertitel erzeugen, verlangt sie aber bei eingebetteten Videos nicht. Einzelne Farbpaare liegen weiter unter dem geforderten Wert — bekannt ist ein Blau-auf-Blau-Paar im Bereich Projekte. Die Seitenstruktur ist uneinheitlich. Nicht jede Seite kennzeichnet ihren Hauptbereich und ihre Navigationsleisten so, dass ein Screenreader direkt dorthin springen kann. Die Mobil-App ist nicht auf einem Gerät geprüft. Die Namen der Bedienelemente sind gesetzt, aber Kontrast, Reihenfolge beim Durchtippen und die tatsächlichen Ansagen von VoiceOver und TalkBack sind ungeprüft. Nicht gemessen wurden bisher: die veröffentlichten Kandidat:innen-Seiten, die Desktop-App und diese Dokumentationsseite selbst."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Was wir anstreben",
    "anchor": "#was-wir-anstreben",
    "category": "Über den Grünerator",
    "text": "Zielstandard ist WCAG 2.2, Konformitätsstufe AA, im Rahmen der europäischen Norm EN 301 549. Diese Norm haben wir gewählt, weil sie als einzige auch die Mobil-App abdeckt — WCAG allein gilt für Webseiten."
  },
  {
    "url": "/docs/ueber-den-gruenerator/barrierefreiheit",
    "pageTitle": "Barrierefreiheit",
    "heading": "Wie geprüft wurde",
    "anchor": "#wie-geprüft-wurde",
    "category": "Über den Grünerator",
    "text": "Selbstbewertung, kein externer Test. Konkret: axe-core über 20 Seiten der Web-Oberfläche, in hellem und dunklem Modus, zuletzt am 2. August 2026. ESLint-Regelsätze (jsx-a11y für das Web, react-native-a11y für die Mobil-App) laufen bei jeder Änderung mit. Komponententests mit axe an den Stellen, an denen ARIA von Hand gesetzt wird. Ein BITV-Test durch eine unabhängige Prüfstelle hat nicht stattgefunden."
  },
  {
    "url": "/docs/ueber-den-gruenerator/gruenerator-pro-eu",
    "pageTitle": "Grünerator Pro-EU",
    "heading": "Politische Kommunikation gehört in europäische Hände",
    "anchor": "#politische-kommunikation-gehört-in-europäische-hände",
    "category": "Über den Grünerator",
    "text": "Wenn Parteien, Abgeordnete und Ehrenamtliche KI-Werkzeuge nutzen, fließen politische Inhalte durch fremde Infrastruktur – Kampagnentexte, Pressemitteilungen, interne Strategien. Bei den meisten KI-Tools landen diese Daten auf US-Servern, verarbeitet von Unternehmen, die weder europäischem Recht noch demokratischer Kontrolle unterliegen. Der Grünerator ist die souveräne Alternative: 100% europäische Infrastruktur, 100% europäische Anbieter, 100% europäische Ausgaben. Deine politische Arbeit verlässt niemals die EU – egal ob Text, Bild, Sprache oder Suche."
  },
  {
    "url": "/docs/ueber-den-gruenerator/gruenerator-pro-eu",
    "pageTitle": "Grünerator Pro-EU",
    "heading": "Unsere europäischen Partner",
    "anchor": "#unsere-europäischen-partner",
    "category": "Über den Grünerator",
    "text": "Mistral AI (Frankreich) — Standardmodell Mistral Medium 3.5 (mistral-medium-2604), Werkzeug-Planung mit Mistral Small, Bildverstehen mit Pixtral Large, Suche und Notebooks mit mistral-embed, Transkriptions-Fallback Voxtral Black Forest Labs (Freiburg, Deutschland) — Bilderzeugung und -bearbeitung mit FLUX 2 Pro (flux-2-pro), ausschließlich über den EU-Endpunkt api.eu.bfl.ai Regolo / Seeweb (Italien) — Open-Source-Modelle (Gemma 4, GPT-OSS 120B, Mistral Small 4), Bildmodell Qwen-Image und Transkription mit Whisper Large v3 — Zero Data Retention, 100 % erneuerbare Energie netzbegrünung e.V. / verdigado eG (Deutschland / Finnland) — Infrastruktur, Datenbank, selbst gehostete Open-Source-Modelle (GPT-OSS, Gemma 4) SearXNG (selbstgehostet, Deutschland) — Suche Hetzner (Deutschland) — Hosting, an deutschen Standorten mit 100 % Wasserkraft Wer europäische Werte vertritt, sollte europäische Werkzeuge nutzen. Der Grünerator zeigt, dass das ohne Qualitätsverlust möglich ist. Wie nachhaltig diese Partner arbeiten, zeigt Wie nachhaltig ist der Grünerator?. Details zu allen Anbietern findest du in unserer Datenschutzerklärung."
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "pageTitle": "Grünerator - die Grüne KI",
    "heading": "Grünerator - die Grüne KI",
    "anchor": "",
    "category": "Über den Grünerator",
    "text": "Der Grünerator ist ein speziell für Bündnis 90/Die Grünen entwickeltes KI-Tool. Er erstellt Texte wie Pressemitteilungen, Social-Media-Beiträge, Anträge für kommunale Parlamente und viele weitere. Außerdem kann er Sharepics \"grünerieren\" und beim Erstellen von Untertiteln helfen."
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "pageTitle": "Grünerator - die Grüne KI",
    "heading": "Datenschutz per Design",
    "anchor": "#datenschutz-per-design",
    "category": "Über den Grünerator",
    "text": "Anders als andere Seiten trackt der Grünerator nicht und kann völlig anonym verwendet werden. Er verwendet ausschließlich EU-Server zur Verarbeitung der KI-Eingaben und bietet mit selbst gehosteten Open-Source-Modellen zusätzliche Datensouveränität. Der Grünerator setzt dabei bewusst auf europäische Technologieanbieter wie Mistral AI (Frankreich) und Black Forest Labs (Deutschland), um die digitale Souveränität Europas zu stärken."
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "pageTitle": "Grünerator - die Grüne KI",
    "heading": "Denkt und spricht Grün",
    "anchor": "#denkt-und-spricht-grün",
    "category": "Über den Grünerator",
    "text": "Der Grünerator wurde anhand grüner Sprache antrainiert. Wenn er einen Beitrag für Instagram oder eine Pressemitteilung erstellt, klingt dieser grün und fühlt sich grün an."
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "pageTitle": "Grünerator - die Grüne KI",
    "heading": "Einfache UI & modernste Technik",
    "anchor": "#einfache-ui--modernste-technik",
    "category": "Über den Grünerator",
    "text": "Der Grünerator verwendet eine stark vereinfachte Benutzeroberfläche, die fast jede:r auf Anhieb versteht. Er wurde so designt, dass er von allen Ehrenamtlichen aller Altersklassen verwendet werden kann. Die UI orientiert sich stark an Seiten, die die Nutzer:innen kennen und lieben. Er nutzt modernste KI-Modelle – du kannst zwischen mehreren KI-Modellen wählen, vom europäischen Mistral AI bis zu vollständig selbst gehosteten Open-Source-Modellen. Standardmäßig wählt der Grünerator automatisch das passende Modell für deine Aufgabe."
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "pageTitle": "Grünerator - die Grüne KI",
    "heading": "Mit Herz für Open-Source",
    "anchor": "#mit-herz-für-open-source",
    "category": "Über den Grünerator",
    "text": "Der Grünerator wurde auf Basis von Open-Source-Software entwickelt und liegt auf den Servern der Netzbegrünung. Die netzbegrünung ist ein Verein für grüne Netzkultur e.V., der sich seit 2006 für die Förderung der Demokratie im digitalen Raum und eine nachhaltige digitale Infrastruktur einsetzt. Mit über 500 Mitgliedern aus Deutschland und Österreich entwickelt die netzbegrünung innovative digitale Lösungen und vermittelt Fachwissen zu digitalpolitischen Inhalten. Direkt zum Grünerator: gruenerator.eu"
  },
  {
    "url": "/docs/ueber-den-gruenerator/intro",
    "pageTitle": "Grünerator - die Grüne KI",
    "heading": "Plus für Barrierefreiheit",
    "anchor": "#plus-für-barrierefreiheit",
    "category": "Über den Grünerator",
    "text": "Der Grünerator hilft beim Erstellen von Untertiteln für Instagram Reels & TikToks und kreiert Alt-Texte für Sharepics. Beides ist essenziell für mehr Barrierefreiheit im Netz, aber auch viel Aufwand, den viele Ehrenamtliche kaum schaffen. Mit dem Reel-Grünerator und dem Grünerator für Alt-Texte nimmt der Grünerator diese Aufgaben fast vollständig ab."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Wie nachhaltig ist der Grünerator?",
    "anchor": "",
    "category": "Über den Grünerator",
    "text": "Künstliche Intelligenz kostet Strom, Wasser und Hardware — das lässt sich nicht wegdiskutieren. Der Grünerator ist deshalb so gebaut, dass er möglichst wenig davon braucht und den Rest aus möglichst sauberen Quellen bezieht. Drei Hebel machen den Unterschied: Grünes Hosting — die Server laufen mit erneuerbarer Energie. Sparsame Modelle — kleine und mittlere Modelle statt Frontier-Giganten. Intelligentes Routing — jede Anfrage bekommt nur so viel Rechenleistung, wie sie wirklich braucht."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Black Forest Labs (Freiburg) — Bilder aus der EU",
    "anchor": "#black-forest-labs-freiburg--bilder-aus-der-eu",
    "category": "Über den Grünerator",
    "text": "Black Forest Labs aus Freiburg entwickelt die FLUX-Bildmodelle. Der Grünerator nutzt ausschließlich den EU-Endpunkt (api.eu.bfl.ai) mit flux-2-pro — die Bilderzeugung läuft damit im europäischen Strommix, der deutlich CO₂-ärmer ist als der US-amerikanische, wo die meisten Bild-KIs rechnen."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Erzeugte Bilder",
    "anchor": "#erzeugte-bilder",
    "category": "Über den Grünerator",
    "text": "Ein einzelnes Bild wiegt schwerer als alles andere in der Übersicht: Ein Sharepic mit Flux Pro entspricht rund 25 erzeugten Pressemitteilungen. Deshalb zeigt die Übersicht den Bildanteil getrennt an — eine Summe allein würde nahelegen, dass Chatten das Problem ist. Auch hier meldet kein Anbieter Messwerte, und GreenPT betreibt kein Bildmodell, mit dem wir kalibrieren könnten. Die Werte stammen aus einer veröffentlichten Messreihe: Iyengar et al. (2025) vermessen gängige Diffusionsmodelle auf einer A100 über das gesamte Raster aus Auflösung, Schritten, Rechengenauigkeit und Guidance. Genau das macht die Arbeit brauchbar — wir können die Zelle nehmen, die zu unserer Nutzung passt, statt eine Schlagzeile zu zitieren. Bei 1024×1024, 50 Schritten, fp16, mit CFG: Modell | Energie je Bild (nur GPU) | ----------------------------- | ------------------------- | Qwen-Image (läuft bei Regolo) | 3,58 Wh | FLUX.1 [dev] | 4,28 Wh | Zwei Korrekturen sind nötig, bevor man das übernehmen darf. Erstens misst die Arbeit ausschließlich die GPU und zieht deren Leerlauf ab. In einem echten Rechenzentrum zahlt man beides: den Leerlauf ohnehin, dazu CPU, Arbeitsspeicher, Netzwerk, Lüfter und Verluste im N"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "GreenPT — grüne Entwicklung",
    "anchor": "#greenpt--grüne-entwicklung",
    "category": "Über den Grünerator",
    "text": "GreenPT rechnet ausschließlich in EU-Rechenzentren mit 100 % erneuerbarer Energie — in Paris sowie in Helsinki (je zur Hälfte Wasser- und Windkraft) — und nennt konkrete Effizienzwerte: PUE 1,25 (Branchenschnitt: 1,55) und ein Wasserverbrauch (WUE) von 0,25 statt branchenüblicher 1,8. Der Grünerator nutzt GreenPT als Modell-Lane in der Entwicklungsumgebung (gemma4) — auch das Testen neuer Funktionen läuft damit grün."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Grünes Hosting: Wasserkraft statt Kohlestrom",
    "anchor": "#grünes-hosting-wasserkraft-statt-kohlestrom",
    "category": "Über den Grünerator",
    "text": "Der Grünerator selbst — Web-Oberfläche, Datenbanken, Suche — läuft bei Hetzner in Deutschland. Hetzner betreibt seine deutschen Standorte nach eigenen Angaben mit 100 % Wasserkraft, ist EMAS- und ISO-14001-zertifiziert und erreicht mit einem durchschnittlichen PUE-Wert von 1,13 eine überdurchschnittliche Energieeffizienz (je näher an 1,0, desto weniger Strom geht für Kühlung und Infrastruktur verloren). Gegenüber dem deutschen Durchschnitts-Strommix spart das laut Hetzner rund 77.000 Tonnen CO₂ pro Jahr. Auch die selbst gehosteten Open-Source-Modelle (GPT-OSS und Gemma 4), die netzbegrünung e.V. und die verdigado eG für den Grünerator betreiben, laufen auf dieser Wasserkraft-Infrastruktur."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Intelligentes Routing: nur so viel KI wie nötig",
    "anchor": "#intelligentes-routing-nur-so-viel-ki-wie-nötig",
    "category": "Über den Grünerator",
    "text": "Der Grünerator schickt nicht jede Anfrage an das größte verfügbare Modell. Stattdessen entscheidet ein kompaktes Einordnungs-Modell (Mistral Small 4 bei Regolo) zuerst, was überhaupt gebraucht wird: eine einfache Antwort, eine Recherche, ein Dokument, ein Bild. Auch innerhalb einer Antwort ist die Arbeit geteilt: Ein kleines, schnelles Modell übernimmt das Planen und Aufrufen von Werkzeugen (Suche, Notebooks, Dokumente), und ein kompaktes 31-Milliarden-Modell schreibt den Text. Das große Standardmodell kommt nur dort zum Einsatz, wo seine Qualität wirklich gebraucht wird. So bleibt der Energieverbrauch pro Anfrage niedrig, ohne dass die Qualität leidet."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Mistral AI (Frankreich) — Transparenz-Vorreiter",
    "anchor": "#mistral-ai-frankreich--transparenz-vorreiter",
    "category": "Über den Grünerator",
    "text": "Mistral AI vermarktet sich nicht als Öko-Anbieter, hat aber als erstes KI-Unternehmen überhaupt eine vollständige, unabhängig geprüfte Lebenszyklus-Analyse eines eigenen Modells veröffentlicht — erstellt mit der französischen Umweltagentur ADEME und Carbone 4, peer-reviewed nach ISO 14040/44. Die Zahlen machen KI-Umweltkosten erstmals konkret vergleichbar: Eine typische Antwort (400 Token) verursacht etwa 1,14 g CO₂e und 45 ml Wasser. Mistral setzt sich zudem für einen verbindlichen globalen Umweltstandard für KI ein. Dazu kommt der französische Strommix, der zu den CO₂-ärmsten Europas gehört. Beim Grünerator liefert Mistral das Standardmodell (mistral-medium-2604), die Werkzeug-Planung, die Embeddings für Suche und Notebooks sowie den Transkriptions-Fallback Voxtral."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Modelle ohne Messwert: Obergrenze statt Schätzung",
    "anchor": "#modelle-ohne-messwert-obergrenze-statt-schätzung",
    "category": "Über den Grünerator",
    "text": "Für einige Lanes betreibt GreenPT kein Gegenstück — Mistral Small 4 (119 Mrd.), Qwen 3.5 (122 Mrd.) und Pixtral Large. Sie einfach wegzulassen wäre die bequemste Lösung und die falscheste: Bei realer Nutzung läuft ein Großteil des Volumens genau dort. Über die Modellgröße lässt sich das nicht schätzen — die Messreihe widerlegt den Zusammenhang direkt: GPT-OSS mit 120 Mrd. Parametern verbraucht je Token weniger als ein Sechstel von Mistral Medium mit 128 Mrd. Wir haben deshalb einen zweiten Weg geprüft: Antwortgeschwindigkeit als Energie-Proxy. Auf identischer Regolo-Hardware sollte ein Modell, das doppelt so lange für ein Token braucht, ungefähr doppelt so viel ziehen. Als Kontrolle haben wir den Proxy an zwei Modellen getestet, deren Energieverbrauch wir kennen: | Verhältnis GPT-OSS 120B zu Gemma 4 | --------------------------- | ---------------------------------- | laut Geschwindigkeits-Proxy | 0,43× | laut Messung | 1,12× | Der Proxy lag um 62 % daneben — und zwar in der schmeichelhaften Richtung. Geschwindigkeit sagt vor allem, über wie viele GPUs ein Modell verteilt ist, nicht wie viel es zieht. Die daraus abgeleiteten Zahlen haben wir verworfen. Was bleibt, ist die gemessene "
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Quellen",
    "anchor": "#quellen",
    "category": "Über den Grünerator",
    "text": "Alle Zahlen dieser Seite sind nachprüfbar. Unsere Anbieter Scaleway Impact Report 2025 — Scope 1/2/3, PUE je Rechenzentrum, WUE Hetzner: Nachhaltigkeit — PUE 1,10–1,16, Wasserkraft seit 2008, EMAS DHH Group Sustainability Report 2024 — Seeweb (Regolo), Stromverbrauch und PUE GreenPT: Sustainability — Methode der CO₂-Berechnung, stündliche Netzdaten von Nodera GreenPT: Partner — Infrastruktur läuft bei Scaleway in Paris Regolo: Sustainable AI Mistral AI: Ökobilanz mit ADEME und Carbone 4 Strommix Umweltbundesamt: CO₂-Emissionen pro Kilowattstunde Strom — Deutschland, verbrauchsbasiert RTE: Bilan électrique — Frankreich Ember: Yearly Electricity Data — Italien und Ländervergleich Methode und Vergleichszahlen Jegham et al., „How Hungry is AI?\" (arXiv:2505.09598) — Grundlage des ChatGPT-Vergleichs Iyengar et al., „Energy Scaling Laws for Diffusion Models\" (arXiv:2511.17031) — Grundlage der Bildwerte; Tabelle 3 (FLUX.1) und Tabelle 6 (Qwen-Image) Scope3: Sustainable AI — Image Generation — unabhängige Gegenprobe für Bilder Uptime Institute Global Data Center Survey — weltweiter PUE-Durchschnitt 1,56 GHG Protocol Scope 2 Guidance — standortbasiert vs. marktbasiert Unsere eigene Messreihe"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Regolo (Seeweb, Italien) — 100 % erneuerbar",
    "anchor": "#regolo-seeweb-italien--100--erneuerbar",
    "category": "Über den Grünerator",
    "text": "Regolo betreibt seine GPU-Server nach eigenen Angaben mit 100 % erneuerbarer Energie, verzichtet auf Wasserkühlung und führt Hardware im Kreislauf (wiederverwenden, aufarbeiten, recyceln). Das Unternehmen ist ISO-14001-zertifiziert, Qualified Supporter der Green Web Foundation und arbeitet nach dem europäischen DNSH-Prinzip („Do No Significant Harm\", EU-Taxonomie) — alles in europäischen Rechenzentren, mit Zero Data Retention. Beim Grünerator übernimmt Regolo die Anfragen-Einordnung (mistral-small-4-119b), das Schreiben von Antworten (gemma4-31b), Transkription (faster-whisper-large-v3) und dient als Überlauf für die selbst gehosteten Modelle."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Sparsame Modelle statt Größenwahn",
    "anchor": "#sparsame-modelle-statt-größenwahn",
    "category": "Über den Grünerator",
    "text": "Die größten kommerziellen KI-Modelle brauchen für jede einzelne Antwort ein Vielfaches der Energie eines kompakten Modells. Der Grünerator setzt deshalb bewusst auf kleine und mittlere Modelle — vom 31-Milliarden-Parameter-Modell Gemma 4 bis zum mittelgroßen Mistral Medium. Das sind die Modelle, die tatsächlich im Einsatz sind: Aufgabe | Modell | Läuft bei | ------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------- | Chat & Texte (Standard) | Mistral Medium 3.5 (mistral-medium-2604) | Mistral AI 🇫🇷 | Kreativtexte, Antworten schreiben | Gemma 4 — 31 Mrd. Parameter (gemma4-31b) | verdigado 🇩🇪 / Regolo 🇮🇹 | Schnelle Antworten | GPT-OSS 120B (gpt-oss-120b) | verdigado 🇩🇪 / Regolo 🇮🇹 | Anfragen einordnen, Zwischenschritte | Mistral Small 4 (mistral-small-4-119b) | Regolo 🇮🇹 | Werkzeuge planen und aufrufen | Mistral Small (mistral-small-latest) | Mistral AI 🇫🇷 | Bilder verstehen | Gemma 4 (gemma4-31b), Pixtral Large | Regolo 🇮🇹 / Mistral AI 🇫🇷 | Bilder erzeugen & bearbeiten | FLUX 2 Pro (flux-2-pro), Qwen-Image | Black Forest Labs 🇩🇪 (EU-Endpunkt) / Regolo 🇮🇹 | Untertitel & "
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Warum Ökostrom die Zahl nicht auf null bringt",
    "anchor": "#warum-ökostrom-die-zahl-nicht-auf-null-bringt",
    "category": "Über den Grünerator",
    "text": "Alle drei Anbieter beziehen nach eigenen Angaben erneuerbare Energie — Seeweb ausschließlich, Hetzner seit 2008 Wasserkraft, Scaleway zu 100 %. Trotzdem steht in unserer Rechnung der jeweilige Netzmix. Das ist keine Nachlässigkeit, sondern der Punkt. Scaleway macht es selbst genau so. Der Impact Report weist den Ökostrom ausdrücklich als Guarantee of Origin aus, also als Herkunftsnachweise — und rechnet die Emissionen trotzdem standortbasiert. Ein Anbieter, der sich mit einem Federstrich auf nahe null hätte rechnen können, tut es nicht. Dem folgen wir. Bei Regolo kommt hinzu, dass es gar keine Zahl gäbe, die man einsetzen könnte: Der Nachhaltigkeitsbericht der DHH-Gruppe 2024 nennt für Seeweb zwar 7,3 GWh Stromverbrauch und null Prozent fossilen Anteil, hält aber fest, dass die Gruppengesellschaften ihre Treibhausgasemissionen derzeit nicht messen („the Group companies do not currently measure greenhouse gas emissions\"). Bei Hetzner ist es dasselbe Bild — die Nachhaltigkeitsseite nennt PUE und Wasserkraft, aber keine Scope-2-Bilanz. Wo Berichte konkret werden, rechnen wir es an: Seewebs PUE unter 1,20 und Hetzners 1,13 senken beide Werte gegenüber unserem Referenzwert. Sobald einer"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was dein eigener Verbrauch kostet",
    "anchor": "#was-dein-eigener-verbrauch-kostet",
    "category": "Über den Grünerator",
    "text": "Unter Einstellungen → Nutzung siehst du Energie- und CO₂-Verbrauch deiner eigenen Anfragen. Diese Zahl ist teils gemessen, teils hochgerechnet — hier steht, wie sie zustande kommt."
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was die ganze Plattform verbraucht",
    "anchor": "#was-die-ganze-plattform-verbraucht",
    "category": "Über den Grünerator",
    "text": "Neben deinem eigenen Verbrauch veröffentlichen wir die Summe über alle Nutzer:innen. Drei Entscheidungen dahinter sind erklärungsbedürftig, weil sie die Zahlen kleiner oder unschärfer machen, als sie sein könnten. Es ist eine Spanne, keine Zahl. Wo ein Modell vermessen ist, fallen beide Enden zusammen. Wo wir nur eine Obergrenze haben, zeigt die Spanne das obere und das untere Ende derselben gemessenen Bandbreite. Ihre Breite ist damit ein direktes Maß dafür, wie viel wir noch nicht wissen — und sie wird schmaler, sobald eine Lane vermessen wird, nicht durch besseres Formulieren. Tage mit sehr wenigen Aktiven fallen ganz heraus. Unterschreitet ein Tag fünf verschiedene Nutzer:innen, wird er nicht nur aus dem Verlauf ausgeblendet, sondern auch aus allen Summen entfernt. Nur auszublenden würde nichts nützen: Wer zwei Zeiträume abfragt, die sich um einen Tag unterscheiden, könnte ihn durch Subtraktion zurückrechnen. Die Zahl der zurückgehaltenen Tage steht mit dabei, damit eine Lücke als Lücke erkennbar ist und nicht als Ruhetag. Die Konstanten stehen dabei. Zu jedem Anbieter veröffentlichen wir den angesetzten Netzmix und den PUE-Wert neben seinem Anteil. Ein Fußabdruck, den niemand "
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was die Zahl nicht enthält",
    "anchor": "#was-die-zahl-nicht-enthält",
    "category": "Über den Grünerator",
    "text": "Keine Herstellung, kein Training. Wir zählen den Strom der Anfrage selbst. Der CO₂-Rucksack aus GPU-Produktion und Modelltraining fehlt. Keine Transkription, keine Recherche. Dafür liefert kein Anbieter Messwerte. Bei GreenPT, das als einziges überhaupt misst, haben wir alle in Frage kommenden Endpunkte geprüft: Transkription (/v1/listen) und beide Suchendpunkte antworten ohne impact-Feld, und einen Endpunkt für den Konto-Gesamtverbrauch gibt es nicht. Gemessen wird dort ausschließlich Inferenz auf /v1/chat/completions und /v1/embeddings. Beide Schritte werden deshalb gezählt, aber nicht bewertet — die Übersicht weist sie getrennt aus, damit die Aktivität nicht so aussieht, als wäre sie kostenlos. Kein Grundverbrauch der eigenen Infrastruktur. Datenbanken, Cache, Vektorsuche und die API-Container laufen rund um die Uhr, unabhängig davon, ob jemand etwas erzeugt. Sie stecken in keiner dieser Zahlen. Wie groß der fehlende Teil ist, zeigt Scaleways eigene Bilanz besonders klar: Dem Betriebsstrom (Scope 2) mit 3.155 t CO₂e stehen 13.387 t allein für die Server gegenüber — die Hardware-Herstellung wiegt dort das 4,2-fache des Stroms, den sie verbraucht. Mistrals unabhängig geprüfte Ökob"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Was dieselbe Arbeit mit ChatGPT gekostet hätte",
    "anchor": "#was-dieselbe-arbeit-mit-chatgpt-gekostet-hätte",
    "category": "Über den Grünerator",
    "text": "Die Nutzungs-Übersicht stellt deinem Verbrauch eine Vergleichszahl gegenüber. Sie beruht auf Jegham et al. (2025) — der einzigen veröffentlichten Rechnung zu GPT-4o mit derselben Systemgrenze wie unserer: nur Betriebsstrom, kein Training, keine Hardware-Herstellung, PUE eingerechnet, standortbasierter Emissionsfaktor. Alles andere wäre ein Vergleich von Äpfeln mit Birnen. Für eine Kurzanfrage (100 Token rein, 300 raus) nennt die Arbeit 0,42 Wh und damit rund 147 mg CO₂e. Unsere Modelle in derselben Konfiguration: Modell und Standort | Energie | CO₂ | --------------------------- | ------- | ------ | Gemma 4 bei Regolo | 0,21 Wh | 56 mg | GPT-OSS 120B bei Regolo | 0,24 Wh | 66 mg | Gemma 4 bei verdigado | 0,20 Wh | 71 mg | Mistral Medium bei Scaleway | 1,37 Wh | 30 mg | GPT-4o (Jegham et al.) | 0,42 Wh | 147 mg | Daraus ergibt sich die Spanne, die die Übersicht zeigt: rund 2- bis 5-mal weniger CO₂ je vergleichbarer Anfrage. Der Vergleich gilt nur für Text. Für erzeugte Bilder gibt es keine OpenAI-Zahl mit vergleichbar sauber benannter Systemgrenze; eine Herstellerschätzung gegen eine grenzkorrigierte Messung zu stellen würde die Sorgfalt entwerten, um die es hier geht. Bilder bleiben"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Wie wir Emissionen berechnen",
    "anchor": "#wie-wir-emissionen-berechnen",
    "category": "Über den Grünerator",
    "text": "Emissionen sind Energie mal Kohlenstoffintensität des Stroms. Wir rechnen standortbasiert, also mit dem realen Strommix am jeweiligen Rechenzentrumsstandort — nicht mit unseren Ökostromverträgen. Das ist bewusst die strengere Variante, und wir folgen damit GreenPT selbst: Der Anbieter wirbt mit 100 % erneuerbarer Energie und rechnet seine Emissionen trotzdem nicht auf null, sondern nutzt stündliche Netzdaten je Standort. Ein Ökostromvertrag ändert nichts daran, welcher Strom im selben Moment physisch durch die Leitung fließt. Die grüne Beschaffung bleibt richtig und wirksam — sie ist nur kein Rabatt auf die Bilanz. Wir rechnen mit diesen Werten (Jahresmittel 2024, nur Verbrennungsemissionen): Standort | g CO₂/kWh | Quelle | ----------------------------------- | --------- | ------------------------------------------------ | Scaleway (Paris) | 24 | Scaleway Impact Report 2025, eigene Scope-2-Zahl | Frankreich (Mistral) | 22 | RTE, Bilan électrique 2024 | Italien (Regolo/Seeweb) | 270 | Ember, Yearly Electricity Data | Deutschland (verdigado auf Hetzner) | 363 | Umweltbundesamt | Bei Scaleway müssen wir nicht auf den Landesdurchschnitt ausweichen: Der Impact Report weist Scope 2 stand"
  },
  {
    "url": "/docs/ueber-den-gruenerator/nachhaltigkeit",
    "pageTitle": "Wie nachhaltig ist der Grünerator?",
    "heading": "Woher die Messwerte kommen",
    "anchor": "#woher-die-messwerte-kommen",
    "category": "Über den Grünerator",
    "text": "Von unseren Anbietern liefert nur GreenPT die Umweltkosten einer Anfrage mit: Jede Antwort trägt ein impact-Objekt mit Energieverbrauch und Emissionen. Diese Werte übernehmen wir unverändert. Für alle anderen rechnen wir hoch — mit Werten, die an genau denselben Modellen gemessen wurden. GreenPT betreibt Gemma 4, GPT-OSS 120B und Mistral Medium 3.5 ebenfalls, also verrät eine Messung dort, was dasselbe Modell bei Regolo oder verdigado kostet. Gemessen am 31.07.2026 über 35 Läufe mit unterschiedlich langen Antworten: Modell | Energie je erzeugtem Token | typische Antwort (400 Token) | ----------------------------- | -------------------------- | ---------------------------- | Mistral Small 3.2 (24 Mrd.) | 0,70 mWh | 0,28 Wh | Gemma 4 (31 Mrd.) | 0,72 mWh | 0,29 Wh | GPT-OSS 120B | 0,81 mWh | 0,34 Wh | Mistral Medium 3.5 (128 Mrd.) | 4,52 mWh | 1,84 Wh | Qwen 3.5 (397 Mrd.) | 7,47 mWh | 3,08 Wh | Das ist die harte Zahl unter dem, was weiter oben über sparsame Modelle steht: Mistral Medium braucht das 6,3-fache von Gemma 4, das größte gemessene Modell das 10,3-fache. Genau deshalb schreibt bei uns ein kompaktes Modell die Antworten. Nebenbei zeigt die Messung, dass der Prompt fast nich"
  },
  {
    "url": "/docs/ueber-den-gruenerator/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Deine Daten im Grünerator",
    "anchor": "",
    "category": "Über den Grünerator",
    "text": "Landesverbände und Abgeordnetenbüros können ein Grünerator Notebook erwerben und eigene Daten in den Grünerator einpflegen. Damit ermöglicht ihr, dass Basismitglieder und Kommunalos den Grünerator dauerhaft kostenfrei nutzen können. Zur Einführung in Funktionen, Datenschutz und Open‑Source‑Grundlagen siehe die Einführung."
  },
  {
    "url": "/docs/ueber-den-gruenerator/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Ablauf & Kontakt",
    "anchor": "#ablauf--kontakt",
    "category": "Über den Grünerator",
    "text": "Größe bestimmen und Preis zuordnen (LV). Kontakt aufnehmen per E‑Mail an info@moritz-waechter.de und Notebook anfragen. Eigene Daten einpflegen und interne Bekanntmachung – ab dann profitieren alle Ehrenamtlichen unmittelbar."
  },
  {
    "url": "/docs/ueber-den-gruenerator/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Preise für Landesverbände (pro Notebook / Jahr)",
    "anchor": "#preise-für-landesverbände-pro-notebook--jahr",
    "category": "Über den Grünerator",
    "text": "Groß (≥ 20.000): 7.000 € Baden‑Württemberg, Bayern, Nordrhein‑Westfalen Mittel (10.000–19.999): 3.500 € Berlin, Hessen, Niedersachsen Klein (5.000–9.999): 1.500 € Hamburg, Rheinland‑Pfalz, Schleswig‑Holstein Sehr klein (< 5.000): 750 € Bremen, Saarland Ostdeutsche Landesverbände: kostenfrei Brandenburg, Mecklenburg‑Vorpommern, Sachsen, Sachsen‑Anhalt, Thüringen"
  },
  {
    "url": "/docs/ueber-den-gruenerator/notebook",
    "pageTitle": "Deine Daten im Grünerator",
    "heading": "Warum ein Notebook erwerben?",
    "anchor": "#warum-ein-notebook-erwerben",
    "category": "Über den Grünerator",
    "text": "Eigene Daten im Grünerator: Eure Inhalte, Positionen und Beschlüsse fließen direkt in die KI‑gestützten Antworten ein. Sicherer, dauerhafter, kostenfreier Zugang für Basismitglieder. Priorisierte Weiterentwicklung zugunsten der kommunalen Arbeit und Ehrenamtlichen."
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Worauf der Grünerator aufbaut",
    "anchor": "",
    "category": "Über den Grünerator",
    "text": "Der Grünerator steht auf den Schultern vieler freier Open-Source-Projekte – Software, die offen entwickelt wird und die alle nutzen, einsehen und weiterentwickeln dürfen. Das passt zu unserer Haltung: Politische Werkzeuge sollten transparent und überprüfbar sein, nicht in einer Blackbox verschwinden. Hier findest du die wichtigsten Bausteine, was sie im Grünerator tun und was technisch dahintersteckt."
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Boards: Kibo UI & dnd-kit",
    "anchor": "#boards-kibo-ui--dnd-kit",
    "category": "Über den Grünerator",
    "text": "Die verschiedenen Board-Ansichten – Kanban, Tabelle, Kalender, Zeitstrahl und Liste – stammen von Kibo UI. Das ist eine quelloffene Sammlung fertiger, anpassbarer React-Komponenten (im Stil von shadcn/ui), die direkt in den Grünerator übernommen und an unser Design angepasst werden. Das eigentliche Verschieben der Karten übernimmt darunter dnd-kit, eine schlanke Bibliothek für flüssiges und barrierefreies Drag-and-drop. Zusammen sorgen sie dafür, dass du Aufgaben einfach mit der Maus von einer Spalte in die nächste ziehst, neu sortierst und an der passenden Stelle ablegst. Kibo UI: GitHub dnd-kit: GitHub · NPM"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Das Fundament",
    "anchor": "#das-fundament",
    "category": "Über den Grünerator",
    "text": "Unter all diesen Funktionen liegt ein Fundament aus bewährten Open-Source-Bausteinen: React ist die Grundlage der gesamten Benutzeroberfläche – im Web wie in der App. Die von Meta entwickelte Bibliothek setzt aus einzelnen Komponenten zusammen, was du auf dem Bildschirm siehst, und aktualisiert Inhalte automatisch, sobald sich etwas ändert. GitHub · NPM Tauri verwandelt den Grünerator in eine echte Desktop-App für Windows und Mac. Anders als ältere Lösungen ist Tauri in der Programmiersprache Rust geschrieben und nutzt den im Betriebssystem vorhandenen Browser – dadurch werden die Programme deutlich kleiner und sparsamer. Es kümmert sich außerdem um Dinge wie automatische Updates und Benachrichtigungen. GitHub · NPM Expo & React Native sind die Grundlage der mobilen App für iPhone und Android. React Native erlaubt es, die App einmal zu schreiben und auf beiden Systemen als echte App laufen zu lassen; Expo liefert dazu die Werkzeuge und den Zugriff auf Funktionen wie Kamera, Mikrofon und Mitteilungen. Expo: GitHub · NPM React Native: GitHub · NPM Express ist der Server, der im Hintergrund alle Anfragen entgegennimmt. Das schlanke Standard-Framework für Node.js leitet jede Anfrage an"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Dokumente: BlockNote",
    "anchor": "#dokumente-blocknote",
    "category": "Über den Grünerator",
    "text": "BlockNote ist der Editor hinter den Dokumenten im Grünerator. Er funktioniert wie ein modernes Schreibprogramm im Stil von Notion: Du baust deinen Text aus einzelnen Bausteinen – sogenannten Blöcken – wie Überschriften, Listen und Bildern auf und formatierst alles direkt beim Schreiben. Technisch setzt BlockNote auf der etablierten Editor-Grundlage ProseMirror auf, ergänzt sie aber um dieses blockbasierte Konzept und eine fertige Oberfläche. So kannst du Dokumente außerdem mit einem Klick als PDF-, Word- oder OpenDocument-Datei herunterladen. BlockNote: GitHub · NPM ProseMirror: GitHub · NPM"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "KI-Chat: assistant-ui",
    "anchor": "#ki-chat-assistant-ui",
    "category": "Über den Grünerator",
    "text": "assistant-ui ist die Grundlage des KI-Chats im Grünerator. Es ist eine quelloffene React-Bibliothek, die genau die Chat-Oberfläche bereitstellt, die du von ChatGPT kennst – mit Nachrichtenverläufen, Antworten, die Wort für Wort erscheinen, und der Einbindung von Werkzeugen wie der Web-Recherche. Technisch ist assistant-ui bewusst „kopflos\" (headless) gehalten: Es liefert das Verhalten und die Bausteine eines Chats, das Aussehen gestaltet der Grünerator komplett selbst – damit sich der Chat grün anfühlt und nahtlos in die Oberfläche einfügt. GitHub · NPM"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Recherche & Dateiablage: Qdrant",
    "anchor": "#recherche--dateiablage-qdrant",
    "category": "Über den Grünerator",
    "text": "Qdrant ist das Herzstück der Recherche und der Dateiablage. Es ist eine quelloffene „Vektor-Suchmaschine\": Anders als eine klassische Stichwortsuche findet Qdrant Inhalte nach ihrer Bedeutung. Dafür werden Texte in Zahlenreihen übersetzt, die ihren Sinn abbilden – Qdrant findet dann die Stellen, die inhaltlich am besten passen, auch wenn du andere Worte benutzt als im Originaltext. So findet der Grünerator in deinen hochgeladenen Dateien und recherchierten Quellen die richtigen Passagen wieder und kann sie in seinen Antworten korrekt zitieren. Qdrant: GitHub Ergänzend dazu durchforstet Crawlee für deine Recherche das Web: Es ruft Webseiten auf, liest ihre Inhalte aus und bereitet sie für die Suche auf. So fließen auch aktuelle Quellen aus dem Internet in deine Recherche ein. Crawlee: GitHub · NPM"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Untertitel: FFmpeg",
    "anchor": "#untertitel-ffmpeg",
    "category": "Über den Grünerator",
    "text": "FFmpeg ist das Allzweckwerkzeug für Video und Ton, das im Hintergrund der Untertitel-Funktion arbeitet. Es gilt seit Jahrzehnten als der Industriestandard für die Verarbeitung von Medien und steckt in unzähligen Programmen weltweit. Im Grünerator wandelt es deine Videos um, löst die Tonspur für die Transkription heraus und brennt die fertigen Untertitel fest ins Bild ein. Ohne FFmpeg gäbe es kein fertig untertiteltes Reel zum Herunterladen. GitHub"
  },
  {
    "url": "/docs/ueber-den-gruenerator/open-source",
    "pageTitle": "Worauf der Grünerator aufbaut",
    "heading": "Zusammenarbeit in Echtzeit: Yjs & Hocuspocus",
    "anchor": "#zusammenarbeit-in-echtzeit-yjs--hocuspocus",
    "category": "Über den Grünerator",
    "text": "Yjs und Hocuspocus arbeiten zusammen, damit mehrere Menschen gleichzeitig am selben Dokument oder Board arbeiten können. Yjs ist ein sogenanntes CRDT-Framework: eine Technik, die parallele Änderungen mehrerer Personen automatisch und ohne Konflikte zusammenführt – dieselbe Idee, die auch hinter Google Docs steckt. Hocuspocus ist der passende Server dazu (ursprünglich für den Editor Tiptap entwickelt): Er verbindet alle Beteiligten über eine dauerhafte Echtzeit-Verbindung und sichert den gemeinsamen Stand laufend in der Datenbank, damit keine Eingabe verloren geht. Yjs: GitHub · NPM Hocuspocus: GitHub · NPM"
  },
  {
    "url": "/docs/ueber-den-gruenerator/tools",
    "pageTitle": "Welche Werkzeuge gibt es?",
    "heading": "Welche Werkzeuge gibt es?",
    "anchor": "",
    "category": "Über den Grünerator",
    "text": "Der Grünerator ist kein einzelnes Programm, sondern eine Sammlung von Werkzeugen. Diese Seite zeigt, welche es gibt und wofür man sie nimmt — damit du nicht suchen musst, wo du etwas findest."
  },
  {
    "url": "/docs/ueber-den-gruenerator/tools",
    "pageTitle": "Welche Werkzeuge gibt es?",
    "heading": "Die Oberfläche hat zwei Tabs",
    "anchor": "#die-oberfläche-hat-zwei-tabs",
    "category": "Über den Grünerator",
    "text": "Oben in der Mitte sitzen zwei Umschalter, und dahinter steckt die wichtigste Entscheidung: Chat ist die Startseite. Hier schreibst du in normalem Deutsch, was du brauchst, und der Grünerator wählt selbst, was er dafür tut — nachschlagen, recherchieren, rechnen, etwas erstellen. Für die meisten Aufgaben ist das der schnellste Weg, und du musst kein Werkzeug kennen. Was dort alles möglich ist, steht unter Was kann ich fragen?. Arbeiten ist die Werkzeugkiste. Hierher gehst du, wenn du gezielt etwas öffnen willst — ein bestimmtes Board, die Bildbearbeitung, deine Notebooks. Viele Werkzeuge auf dieser Seite lassen sich auch aus dem Chat heraus auslösen. „Mach mir daraus ein Sharepic\" oder „Erstell eine Tabelle mit den Zahlen\" führt ans selbe Ziel, ohne dass du den Bereich wechselst."
  },
  {
    "url": "/docs/ueber-den-gruenerator/tools",
    "pageTitle": "Welche Werkzeuge gibt es?",
    "heading": "Drei Bereiche, dann die Einzelwerkzeuge",
    "anchor": "#drei-bereiche-dann-die-einzelwerkzeuge",
    "category": "Über den Grünerator",
    "text": "Der Arbeiten-Tab gliedert sich in drei große Bereiche — für Text und Zahlen, für Bilder und Videos, für Recherche. Jeder öffnet eine eigene Seite mit den zugehörigen Werkzeugen. Daneben liegen die Werkzeuge zum Organisieren und ein Menü mit dem Rest. Insgesamt sind es Werkzeuge:"
  },
  {
    "url": "/docs/ueber-den-gruenerator/tools",
    "pageTitle": "Welche Werkzeuge gibt es?",
    "heading": "Wenn du etwas nicht findest",
    "anchor": "#wenn-du-etwas-nicht-findest",
    "category": "Über den Grünerator",
    "text": "Such nach dem Namen. Die Suche im Grünerator kennt auch die gängigen Bezeichnungen — „Untertitel\" findet die Reels, „OCR\" den Scanner. Manches gibt es nur im Web. Einige Werkzeuge brauchen eine große Oberfläche. In der App siehst du die Inhalte dann, kannst sie aber nicht überall bearbeiten. Bei jedem Werkzeug oben steht, wo es läuft. Namen, Beschreibungen und Pfade stammen direkt aus dem Programmcode des Grünerators. Kommt ein Werkzeug dazu oder wird eines umbenannt, meldet sich die Doku-Prüfung automatisch, bis die Seite nachgezogen ist — sie kann also nicht stillschweigend veralten."
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
    "text": "Du möchtest Pressemitteilungen schneller erstellen oder Deine Social-Media-Präsenz stärken? Der Grünerator macht's möglich. Im Webinar zeige ich Dir, wie Du das KI-Tool optimal einsetzt, um Deine Arbeit vor Ort zu unterstützen. Der Grünerator ist ein speziell für die Grünen entwickeltes KI-Tool, das grüne Inhalte nach Wahl erstellen kann. Das Tool ist einfach und selbsterklärend. Du gibst Deine Stichworte in die vorgegebenen Felder ein – der Grünerator erstellt unter Berücksichtigung grüner Sprache und Werte Grünen Content. Das Ergebnis ist ein Vorschlag, den Du weiterbearbeiten kannst. Egal ob für die tägliche Fraktionsarbeit, Wahlkampf oder Social Media – der Grünerator ist Dein digitaler Partner. Das lernst Du im Webinar: Erste Hands-on Übungen: Gemeinsam erstellen wir Pressemitteilungen und Social Media Posts Workflow-Optimierung: Wir lernen zusammen, wie du den Grünerator in deine Workflows einbaust Praktische Tipps und Tricks: Wie Du die KI optimal für Deine kommunalpolitische Arbeit nutzt Über den Referenten Moritz Wächter ist der Entwickler des Grünerators. Er ist Kreisvorsitzender der Grünen im Rhein-Sieg-Kreis und seit zehn Jahren ehrenamtlich auf kommunaler Ebene unterwe"
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
    "text": "Liebe Grüne, wir laden euch herzlich zu unserem kostenlosen Online-Webinar \"KI-Basics: Künstliche Intelligenz für ehrenamtliche Politik\" ein. Webinar-Details Thema: KI-Basics - Künstliche Intelligenz für ehrenamtliche Politik Dauer: 90 Minuten Level: Anfänger (keine Vorkenntnisse erforderlich) Format: Interaktives Online-Webinar mit praktischen Übungen Kosten: Kostenlos Darum geht es Ehrenamtliche Arbeit ist ganz schön zeitaufwendig. Manchmal wünschen wir uns ein paar helfende Hände, die uns bei den ausführenden Tätigkeiten unterstützen. Dafür gibt es jetzt Künstliche Intelligenz. Sie kann uns die Arbeit im Ortsverband oder in der Fraktion erleichtern. Doch ist mit Blick auf Datenschutz, Falschinformationen und Klimaverträglichkeit Vorsicht geboten. Im Webinar zeige ich dir, wie ChatGPT und Co funktionieren und welche Tools dich am besten in der Arbeit vor Ort unterstützen. Das lernst Du im Webinar Wie KI wie ChatGPT Texte und Bilder erstellen kann Welche Tools du am besten für kommunalpolitische Arbeit nutzen kannst Praktische Tipps und Tricks: Wie Du die KI optimal für Deine kommunalpolitische Arbeit nutzt Für wen ist dieses Webinar geeignet? Grüne in Ortsverbänden und Fraktionen"
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Eigenes Notebook erstellen",
    "anchor": "",
    "category": "Wissen",
    "text": "Ein Notebook bündelt Dokumente zu einem Thema und macht ihren Inhalt im Grünerator durchsuchbar — etwa für Anträge, Beschlüsse, Programme oder Pressemitteilungen. Diese Anleitung führt dich Schritt für Schritt durch die Erstellung deines ersten eigenen Notebooks."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Auf „Von der Basis\" listen",
    "anchor": "#auf-von-der-basis-listen",
    "category": "Wissen",
    "text": "Im Modus „Mit Anmeldung\" kannst du zusätzlich den Schalter „Auf ‚Von der Basis' listen\" aktivieren. Dann erscheint dein Notebook auf der allgemeinen Notebooks-Seite im Abschnitt „Von der Basis\" zum Entdecken. Sobald du den Schalter aktivierst, musst du eine der beiden Aussagen bestätigen: „Ich besitze die Daten\" — … oder habe die Rechte zur Veröffentlichung; z.&nbsp;B. eigene Texte, Beschlüsse deines Verbands, Material, das du selbst veröffentlichen darfst. „Daten sind öffentlich verfügbar\" — z.&nbsp;B. offizielle Dokumente, Pressemitteilungen, frei zugängliche Veröffentlichungen. Ohne diese Bestätigung lässt sich das Notebook nicht listen. Hintergrund: Damit stellen wir sicher, dass nur Inhalte mit klarer Rechtelage veröffentlicht werden. Wenn du dir bei den Rechten unsicher bist, lass das Notebook privat — du kannst die Sichtbarkeit jederzeit später ändern."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Dein Notebook nach der Erstellung",
    "anchor": "#dein-notebook-nach-der-erstellung",
    "category": "Wissen",
    "text": "Im Abschnitt „Eigene\" erscheint jedes deiner Notebooks als Karte. Ein Klick auf die Karte öffnet die Notebook-Detailseite, von der aus du chatten und durchsuchen kannst. Über das Drei-Punkte-Menü der Karte erreichst du weitere Aktionen: Bearbeiten — öffnet wieder den Editor (Quellen, Details, Labels, Wolke, Docs). Auf der Bearbeiten-Seite kannst du Name und Beschreibung auch direkt im Kopfbereich ändern und alle Quellen per „Alle Quellen aktualisieren\" neu synchronisieren. Teilen — Untermenü mit „Link kopieren\" (kopiert die URL des Notebooks) und — falls du in Gruppen bist — Optionen zum direkten Teilen mit einer Gruppe. Die volle Sichtbarkeits- und Veröffentlichungssteuerung liegt dagegen im „Teilen\"-Button auf der Bearbeiten-Seite (siehe Notebook teilen). Löschen — entfernt das Notebook unwiderruflich. Wichtig: Die enthaltenen Dokumente bleiben in deiner persönlichen Bibliothek erhalten und können in andere Notebooks aufgenommen werden."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Dein Notebook teilen und veröffentlichen",
    "anchor": "#dein-notebook-teilen-und-veröffentlichen",
    "category": "Wissen",
    "text": "Sichtbarkeit und Veröffentlichung sind aus der Erstellung herausgelöst. Der Einstieg ist der „Teilen\"-Button: Öffne dein Notebook über Bearbeiten, dann findest du oben rechts — neben „Alle Quellen aktualisieren\" — den Button „Teilen\". Er ist nur für die Eigentümer*in sichtbar und öffnet den Dialog „Notebook teilen\", in dem du die gesamte Sichtbarkeit steuerst. (Das „Teilen\"-Untermenü im Drei-Punkte-Menü der Notebook-Übersicht ist davon getrennt: Es bietet nur „Link kopieren\" und das direkte Teilen mit einer Gruppe, aber nicht die Sichtbarkeits- und Veröffentlichungseinstellungen.) Im Dialog „Notebook teilen\" stellst du die Sichtbarkeit ein: „Privat — nur ich\" — Standard. Nur du siehst das Notebook. „Mit Gruppen geteilt\" — sichtbar für ausgewählte Gruppen. Du fügst Gruppen hinzu und legst unter „Wer darf bearbeiten?\" fest, wer Änderungen vornehmen darf (nur ich / Gruppen-Admins / alle Mitglieder). „Mit Anmeldung — alle eingeloggten Nutzer*innen\" — sichtbar für alle eingeloggten Nutzer*innen aus deinem Land."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Häufige Fragen",
    "anchor": "#häufige-fragen",
    "category": "Wissen",
    "text": "Wo schalte ich ein Notebook öffentlich? Nicht mehr in der Erstellung. Öffne das Notebook über Bearbeiten und klicke oben rechts auf „Teilen\". Wähle im Dialog die Sichtbarkeit „Mit Anmeldung\" und aktiviere „Auf ‚Von der Basis' listen\", um es auf der Notebooks-Seite sichtbar zu machen. Was passiert mit Dokumenten, wenn ich ein Notebook lösche? Die Dokumente bleiben in deiner persönlichen Dokumenten-Bibliothek erhalten — nur die Sammlung wird gelöscht. Kann ich dasselbe Dokument in mehrere Notebooks aufnehmen? Ja. Beim Bearbeiten eines Notebooks kannst du beliebige Dokumente aus deiner Bibliothek auswählen. Wie lange dauert die Indexierung? Bei Text-PDFs und reinen Textdateien meist nur Sekunden. Eingescannte PDFs (mit OCR) und sehr große Dateien können einige Minuten brauchen. Das Notebook ist trotzdem sofort nutzbar — neue Dokumente erscheinen in den Antworten, sobald die Indexierung abgeschlossen ist. Mein Dokument wird nicht akzeptiert. Prüfe die Dateiendung (PDF, DOCX, DOC, TXT, MD, ODT, RTF) und die Dateigröße (max. 50 MB). Andere Formate musst du vorher konvertieren."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Schritt 1: Zur Notebook-Übersicht",
    "anchor": "#schritt-1-zur-notebook-übersicht",
    "category": "Wissen",
    "text": "Öffne in der Navigation Notebooks (/notebooks). Auf dieser Seite sind alle Notebooks an einem Ort gebündelt; deine eigenen findest du im Abschnitt „Eigene\". Beim ersten Mal ist er leer und zeigt nur die Karte zum Erstellen. Klicke neben der Überschrift „Eigene\" auf „Notebook erstellen\" (oder auf die Erstellen-Karte), um den Editor zu öffnen."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Schritt 2: Quellen wählen",
    "anchor": "#schritt-2-quellen-wählen",
    "category": "Wissen",
    "text": "Im ersten Schritt des Editors („Quellen — Woher kommen deine Dokumente?\") stehen vier Kacheln zur Auswahl: Dateien hochladen — Dateien aus dem Dateibrowser auswählen (Mehrfachauswahl möglich) oder per Drag &amp; Drop auf das Fenster ziehen. Aus der Wolke verbinden — einen Ordner aus der Grünen Wolke als Quelle nutzen (siehe Schritt 3). Aus Docs importieren — eigene Docs als Quelle einbinden (siehe Schritt 3). Von einer Website — Beiträge und Seiten einer WordPress-Website importieren (siehe Schritt 3). Beim Hochladen werden die gewählten Dateien zunächst als Vorschau „Bereit zum Hochladen\" gesammelt. Dort kannst du einzelne Dateien wieder entfernen und startest den Upload dann mit „Hochladen\". Überschüssige Uploads jenseits der 1.000 werden mit einem Hinweis abgelehnt. Der Assistent filtert nicht nach Format. Die Auswahlliste des Dateidialogs schlägt zwar die unterstützten Endungen vor, aber per Drag & Drop landet jede Datei im Upload — auch eine, die später nicht gelesen werden kann. Solche Dateien scheitern erst bei der Verarbeitung im Hintergrund, und das siehst du in der Dokumentenliste derzeit nicht: Der Ladehinweis verschwindet einfach, ohne Fehlermeldung. Wenn ein Dokument s"
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Schritt 3: Name, Beschreibung und Labels",
    "anchor": "#schritt-3-name-beschreibung-und-labels",
    "category": "Wissen",
    "text": "Im zweiten Schritt („Details — Wie soll dein Notebook heißen?\") passt du den vorgeschlagenen Namen an (max. 100 Zeichen). Darunter kannst du eine optionale Beschreibung hinzufügen (max. 500 Zeichen) — sie hilft dir und anderen, später schnell zu erkennen, worum es im Notebook geht. Über das Label-Feld vergibst du bis zu 10 Labels (max. 30 Zeichen pro Label). Labels sind freie Schlagworte und helfen beim Sortieren und Filtern in der Notebook-Übersicht."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Schritt 4: Überprüfen und erstellen",
    "anchor": "#schritt-4-überprüfen-und-erstellen",
    "category": "Wissen",
    "text": "Im dritten Schritt („Überprüfen — Alles bereit zum Erstellen?\") siehst du eine Zusammenfassung: Name, Beschreibung, die Anzahl der Dokumente (eigene, aus der Wolke, aus Docs) und deine Labels. Klicke unten rechts auf „Notebook erstellen\". Der Button bleibt deaktiviert, solange noch kein Name eingetragen oder kein Dokument hochgeladen ist. Nach dem Speichern landest du wieder in der Notebook-Übersicht und siehst eine Erfolgsmeldung. Beim Erstellen ist dein Notebook privat. Ob und für wen es sichtbar wird, legst du danach im „Teilen\"-Menü fest — siehe unten."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Schritt-für-Schritt",
    "anchor": "#schritt-für-schritt",
    "category": "Wissen",
    "text": "Der Editor führt dich durch drei Schritte: Quellen → Details → Überprüfen. Das Veröffentlichen ist bewusst kein Teil der Erstellung — es passiert später über das „Teilen\"-Menü (siehe Notebook teilen)."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Verwandte Themen",
    "anchor": "#verwandte-themen",
    "category": "Wissen",
    "text": "Wolke einbinden — Voraussetzung, um Wolke-Ordner an Notebooks zu hängen. Deine Daten im Grünerator — Hintergrund zu Notebooks für Landesverbände und Abgeordnetenbüros."
  },
  {
    "url": "/docs/wissen/eigenes-notebook-erstellen",
    "pageTitle": "Eigenes Notebook erstellen",
    "heading": "Was du benötigst",
    "anchor": "#was-du-benötigst",
    "category": "Wissen",
    "text": "Ein angemeldetes Grünerator-Konto und ein paar Dokumente, die du zusammenfassen, durchsuchen oder als Wissensbasis nutzen möchtest. Unterstützt werden PDF, DOCX, DOC, TXT, MD, ODT und RTF — bis zu 1.000 Dokumente pro Notebook und maximal 50 MB pro Datei."
  },
  {
    "url": "/docs/wissen/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Aktualisierung",
    "anchor": "#aktualisierung",
    "category": "Wissen",
    "text": "Landesverbände: Stündlich zwischen 06:00 und 22:00 Uhr Alle anderen Quellen: Täglich um 03:00 Uhr Die Synchronisation läuft automatisch über GitHub Actions. Neue Inhalte werden erkannt, in Textabschnitte aufgeteilt und als Vektoren (Embeddings) gespeichert."
  },
  {
    "url": "/docs/wissen/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Landesverbände",
    "anchor": "#landesverbände",
    "category": "Wissen",
    "text": "Die Landesverbände-Sammlung enthält 13.250 Vektoren aus 9 Quellen. Landesverband | Kürzel | Vektoren | ------------------------------- | ------ | ---------: | Mecklenburg-Vorpommern Fraktion | MV-F | 2.428 | Berlin Fraktion | BE-F | 2.253 | Brandenburg | BB | 2.161 | Berlin | BE | 1.834 | Mecklenburg-Vorpommern | MV | 1.412 | Sachsen-Anhalt Fraktion | LSA-F | 1.385 | Thüringen | TH | 771 | Bayern | BY | 722 | Sachsen-Anhalt | LSA | 284 | Gesamt | | 13.250 |"
  },
  {
    "url": "/docs/wissen/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Sammlungen",
    "anchor": "#sammlungen",
    "category": "Wissen",
    "text": "Sammlung | Vektoren | -------------- | ---------: | Landesverbände | 19.665 | KommunalWiki | 6.773 | Bundestag | 3.304 | Böll-Stiftung | 2.209 | gruene.at | 1.007 | Grünblog | 546 | Gesamt | 33.504 |"
  },
  {
    "url": "/docs/wissen/inhaltsdatenbank",
    "pageTitle": "Inhaltsdatenbank",
    "heading": "Übersicht",
    "anchor": "#übersicht",
    "category": "Wissen",
    "text": "Der Grünerator durchsucht und indexiert Inhalte aus verschiedenen Quellen der Grünen Partei. Insgesamt sind 33.504 Vektoren in der Datenbank gespeichert."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Landesverband-Grüneratoren",
    "anchor": "",
    "category": "Wissen",
    "text": "Der Grünerator hat für mehrere Landesverbände eigene, regional getunte Grüneratoren. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sprecher*innen, den lokalen Themen und der typischen Tonalität. Im Hintergrund recherchieren sie automatisch in der Wissensdatenbank des Landesverbands (Pressemitteilungen, Beschlüsse, Wahlprogramme) und im Web. Es gibt zwei Sorten von Landesverband-Grüneratoren: Öffentlichkeitsarbeit — schreibt Pressemitteilungen und Social-Media-Posts im Stil des Landesverbands. Bürger*innenanfragen — formuliert versandfertige, recherchebasierte Antwort-E-Mails auf Anfragen von Bürger*innen."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Abgedeckte Landesverbände",
    "anchor": "#abgedeckte-landesverbände",
    "category": "Wissen",
    "text": "Jede Kachel verlinkt auf die Landesverband-Seite — sie bietet beide Grüneratoren des Landesverbands zur Auswahl an: Öffentlichkeitsarbeit (siehe unten) und Bürger*innenanfragen (siehe unten). Darunter stehen die Rezept-Abkürzungen und ein Link zur Wissensdatenbank (Notebook). Die Grünen Österreich sind kein Landesverband, sondern die Bundespartei — sie haben aber dieselben beiden Grünerator-Typen (erreichbar unter /agents/gruene-oesterreich, Wissensdatenbank /notebooks/oesterreich · @at). Diese Grüneratoren verwenden österreichisches Vokabular (Nationalrat, Klubobfrau*Klubobmann, Klimaticket) und erscheinen nur für Nutzer*innen mit österreichischer Einstellung."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Bürger*innenanfragen beantworten",
    "anchor": "#bürgerinnenanfragen-beantworten",
    "category": "Wissen",
    "text": "Die Bürger*innenanfragen-Grüneratoren helfen dir, eingehende E-Mails von Bürger*innen zu beantworten. Du fügst die Anfrage ein, der Grünerator-Agent recherchiert die Positionen des Landesverbands (die Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine versandfertige Antwort-E-Mail nach festem Aufbau: Anrede → Dank → inhaltliche Antwort → weiterführende Links. Du erreichst sie über die Landesverband-Seite (z. B. /agents/gruene-berlin) — dort wählst du den Bürger*innenservice statt der Öffentlichkeitsarbeit."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Die Wissensdatenbank dahinter",
    "anchor": "#die-wissensdatenbank-dahinter",
    "category": "Wissen",
    "text": "Jeder Landesverband hat ein Notebook — eine durchsuchbare Sammlung seiner offiziellen Inhalte (Pressemitteilungen, Beschlüsse, Wahlprogramme). Die LV-Grüneratoren durchsuchen es automatisch und auf den richtigen Landesverband gefiltert, du musst nichts einstellen. Du kannst dasselbe Notebook auch direkt nutzen: Aufrufen & durchstöbern: über seine Adresse, z. B. /notebooks/berlin. Im Chat als Quelle einbinden: tippe die @-Erwähnung, z. B. @berlin, @mv, @thüringen, @brandenburg, @bayern, @sachsen-anhalt, @hessen oder @saar. Der Chat zieht dann seine Antworten aus diesem Notebook. Mehr zu Notebooks allgemein findest du unter Notebooks."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "LV-Rezepte im Überblick",
    "anchor": "#lv-rezepte-im-überblick",
    "category": "Wissen",
    "text": "Für diese Landesverbände gibt es eigene Rezept-Abkürzungen für Pressemitteilung und Instagram: Landesverband | Pressemitteilung | Instagram | ---------------------- | --------------------- | -------------------- | Berlin | /presse-berlin | /insta-berlin | Mecklenburg-Vorpommern | /presse-mv | /insta-mv | Thüringen | /presse-thueringen | /insta-thueringen | Brandenburg | /presse-brandenburg | /insta-brandenburg | Bayern | /presse-bayern | /insta-bayern | Sachsen-Anhalt, Hessen und das Saarland haben (noch) keine eigenen Rezept-Abkürzungen — ihre Grüneratoren erreichst du über die jeweilige Landesverband-Seite. Unabhängig vom Landesverband gibt es allgemeine Rezepte für jede Plattform: /presse, /instagram, /facebook, /twitter, /linkedin und /reel. Sie greifen auf Beispiele aus allen Landesverbänden zurück. Die LV-Rezepte oben sind die Spezialversion mit eingebautem Regional-Stil."
  },
  {
    "url": "/docs/wissen/landesverbaende",
    "pageTitle": "Landesverband-Grüneratoren",
    "heading": "Pressemitteilungen & Social Media schreiben",
    "anchor": "#pressemitteilungen--social-media-schreiben",
    "category": "Wissen",
    "text": "Du erreichst den Öffentlichkeitsarbeit-Grünerator auf zwei Wegen: 1. Über die Landesverband-Seite — öffne die LV-Adresse (z. B. /agents/gruene-berlin) und wähle dort Öffentlichkeitsarbeit; oder wähle den Grünerator-Agent direkt in der Auswahl im Chat aus. Er bleibt für das ganze Gespräch im LV-Stil. 2. Über eine Rezept-Abkürzung — tippe im Chat einen Slash-Befehl wie /presse-berlin und direkt dahinter dein Thema. Das Rezept schickt deine Anfrage an den passenden LV-Grünerator und gibt ihm gleich die richtige Aufgabe mit (Pressemitteilung bzw. Instagram-Post)."
  }
];
