/**
 * Classifier Prompt & Configuration Constants
 *
 * System prompt for the LLM intent classifier, plus related config values.
 * Separated from classifierNode.ts so prompt engineering changes
 * don't pollute logic diffs.
 */

import type { SearchIntent } from '../types.js';

/**
 * Doc subtypes the classifier may emit as `documentSubtype`.
 *
 * Single source for the prompt's enum line AND the parser-side validation
 * (classifierParsing.ts): the model occasionally invents a semantically
 * plausible value outside this set ("brief"), which then travels as
 * `subtypeOverride` past every downstream check straight into the DB, where
 * the `collaborative_documents_document_subtype_check` constraint rejects it.
 */
export const CLASSIFIER_DOC_SUBTYPES = [
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
  'tabelle',
] as const;

const DOC_SUBTYPE_ENUM_LINE = CLASSIFIER_DOC_SUBTYPES.map((s) => `"${s}"`).join(' | ');

/**
 * Intents the classifier prompt offers the LLM.
 *
 * Single source for the prompt's `"intent"` enum line AND the parser-side
 * accept-list (classifierParsing.ts). Keeping the two apart is what broke:
 * the prompt offered create_sheet / create_presentation / create_recurring_task
 * / share_doc / mcp while the parser's hand-written array did not, so those
 * verdicts were dropped and the turn fell through to `direct`. For
 * create_recurring_task — the one intent with no heuristic fast path — that
 * meant the chat entry point never worked at all.
 *
 * Deliberately NOT offered, because a deterministic step assigns them instead:
 *   compare                   → post-classification upgrade (classifierNode)
 *   scrape_url                → extractUrls on a pasted link
 *   edit_current_doc/_board   → the anchor tiers (Tier 1/2)
 *   pressemitteilung_examples → LV-scoped examples routing
 *   agentic                   → Tier 3.5 loop demotion, a router disposition
 */
export const CLASSIFIER_OFFERED_INTENTS = [
  'sharepic',
  'social_post',
  'image',
  'image_edit',
  'research',
  'search',
  'web',
  'examples',
  'abgeordnetenwatch',
  'bundestag',
  'bahn',
  'reise',
  'hotel',
  'umfragen',
  'wetter',
  'news',
  'hilfe',
  'summary',
  'chart',
  'artifact',
  'compute',
  'save_as_doc',
  'create_sheet',
  'create_presentation',
  'create_pdf',
  'create_recurring_task',
  'modify_doc',
  'modify_board',
  'share_doc',
  'chat_history',
  'mcp',
  'direct',
] as const satisfies readonly SearchIntent[];

export type OfferedIntent = (typeof CLASSIFIER_OFFERED_INTENTS)[number];

const OFFERED_INTENT_SET: ReadonlySet<string> = new Set(CLASSIFIER_OFFERED_INTENTS);

/** Narrows an LLM-supplied `intent` string to something the prompt actually offered. */
export function isOfferedIntent(value: string): value is OfferedIntent {
  return OFFERED_INTENT_SET.has(value);
}

const INTENT_ENUM_LINE = CLASSIFIER_OFFERED_INTENTS.map((i) => `"${i}"`).join(' | ');

/**
 * System prompt for intent classification.
 * Uses Chain-of-Thought for typo detection and content-type awareness.
 */
export const CLASSIFIER_PROMPT = `Du analysierst Benutzeranfragen und entscheidest welches Tool benötigt wird.

VERFÜGBARE TOOLS:
- sharepic: Sharepic-Erstellung (gebrandete Social-Media-Grafik der Grünen). NUR wenn der*die Nutzer*in ausdrücklich eines dieser Wörter benutzt: "Sharepic", "Share-Pic", "Spruchbild", "Zitatbild", "Dreizeiler", "Zitat-Sharepic", "Info-Sharepic". "Grafik", "Kachel" oder "Bild" zählen NICHT — das sind keine Sharepics. NICHT mit "image" verwechseln: ein Sharepic ist eine Vorlagen-Grafik mit Text, kein frei generiertes KI-Bild.
- image: Bildgenerierung (freies KI-Bild) - "erstelle Bild", "generiere Bild", "visualisiere", "zeichne", "male"
- image_edit: Bildbearbeitung eines angehängten Bildes - "bearbeite das Bild", "ändere dieses Foto", "mach mehr Bäume rein", "editiere", "transformiere das Bild". Nur wenn ein Bild angehängt ist ODER der Nutzer explizit Bild/Foto erwähnt.
- research: dieselbe Websuche wie "web", nur mit mehr Aufwand (mehr Quellen, langsamer). NUR bei EXPLIZITER Recherche-Anforderung ("recherchiere", "finde Fakten zu", "belege für"). Im Zweifel "web" — eine einzelne Faktenfrage braucht keine Recherche-Stufe, auch wenn sie schwierig klingt.
- search: NUR bei expliziten FRAGEN zu Grünen Parteiprogrammen, Positionen, Beschlüssen
- web: Aktuelle Nachrichten, externe Fakten, EXPLIZITE Web-Suche ("suche im netz")
- examples: Social-Media-Vorlagen/Beispiele ANSEHEN ("zeig mir Beispiele", "gibt es eine Vorlage für X"). Nur anschauen, nichts Neues erstellen.
- social_post: Social-Media-Post ERSTELLEN — NUR TEXT - STANDARD für "erstelle/schreib einen Post/Tweet/Insta-/Facebook-/LinkedIn-Beitrag zu X", "Social-Media-Post über Y". Eine Sharepic-Grafik entsteht dabei NUR, wenn im selben Satz ausdrücklich ein Sharepic verlangt wird ("Post mit Sharepic"). Ein Post ist KEINE direct-Aufgabe.
- abgeordnetenwatch: Transparenzdaten zu deutschen Abgeordneten (Bundestag/Landtage) via Abgeordnetenwatch - Abstimmungsverhalten ("wie hat X gestimmt", "Abstimmungsverhalten von"), Nebentätigkeiten/Nebeneinkünfte ("welche Nebentätigkeiten hat X"), Mandate, sowie namentliche Abstimmungen ("wie ging die Abstimmung zu Y aus", "Ergebnis der namentlichen Abstimmung"). NUR für konkrete Abgeordnete oder konkrete Parlamentsabstimmungen, NICHT für allgemeine Parteipositionen (→ search) und NICHT für Dokumente/Reden/Gesetzgebung (→ bundestag).
- bundestag: Offizielle Parlamentsdokumente des Deutschen Bundestags (DIP) - Drucksachen, Gesetzentwürfe, Anträge, Kleine/Große Anfragen, Plenardebatten und Reden ("was wurde im Bundestag zu X debattiert", "Rede von X zu Y", "Drucksache 21/123", "Stand des Gesetzgebungsverfahrens"). NICHT für Abstimmungsverhalten oder Nebentätigkeiten (→ abgeordnetenwatch), NICHT für Grüne Positionen (→ search), NICHT für aktuelle Nachrichten (→ web).
- bahn: Konkrete BAHNAUSKUNFT der Deutschen Bahn - Zugverbindungen, Abfahrts-/Ankunftszeiten, Fahrpläne, Verspätungen, Gleise, Bahnhofsausstattung ("welche Zugverbindung von X nach Y", "wann fährt der nächste Zug nach", "Abfahrten in Köln", "hat mein Zug Verspätung", "gibt es Parkplätze am Hbf"). NUR für reine Zug-/Bahnhofsauskünfte, NICHT für Bahnpolitik/Bahnreform/Grüne Verkehrspositionen (→ search) und NICHT für Nachrichten über die Bahn (→ news/web).
- reise: Kombinierte REISEPLANUNG - mehrere Reiseaspekte in EINER Anfrage (Zug + Hotel + Wetter): "plane meine Reise nach Berlin", "Zug und Unterkunft für den Parteitag", "Dienstreise nach X organisieren". Reine Zugauskunft → bahn; NUR Hotel → hotel; reine Wetterfrage → wetter; Tourismuspolitik → search.
- hotel: Hotel-/Unterkunftssuche OHNE weitere Reiseplanung - "Hotel in Berlin für 2 Nächte", "Unterkunft in Nürnberg", "wo kann ich in X übernachten". Mit Zug/Anreise kombiniert → reise.
- umfragen: WAHLUMFRAGEN und Meinungsbilder - Sonntagsfrage/Umfragewerte bundesweit oder pro Bundesland ("wie stehen die Grünen aktuell in Umfragen", "Sonntagsfrage Bayern", "aktuelle Umfragewerte der AfD") sowie Zustimmung zu Themen ("wie denken die Leute über Tempolimit"). NUR Umfragedaten, NICHT Parteipositionen (→ search), NICHT Wahlergebnisse oder namentliche Abstimmungen (→ abgeordnetenwatch/web).
- wetter: Konkrete WETTERAUSKUNFT - Vorhersage, aktuelles Wetter, Temperatur, Regen, Luftqualität für einen Ort/Zeitraum ("wie wird das Wetter morgen in X", "regnet es am Samstag", "wie warm wird es", "Pollenbelastung in Y"). NUR für konkrete Wetterdaten, NICHT für Klimapolitik/Klimawandel-Fragen (→ search/web).
- news: Aktuelle NACHRICHTENLAGE via tagesschau - Schlagzeilen, Meldungen zu einem Thema, Ressort- oder Regional-Nachrichten ("was gibt es Neues zu X", "aktuelle Nachrichten aus Bayern", "was meldet die tagesschau", "Nachrichtenlage zu Y"). Für die aktuelle Berichterstattung; bei allgemeiner Web-Recherche ohne News-Charakter → web.
- summary: Zusammenfassung eines Dokuments - "fasse zusammen", "zusammenfassung", "kurzfassung"
- chart: Datenvisualisierung - "erstelle Diagramm", "Balkendiagramm", "Kreisdiagramm", "visualisiere als Chart", "Statistik darstellen"
- compute: Deterministische Berechnung oder Zählung - "zähl die Zeichen/Wörter", "wie viele Zeichen/Wörter hat der Text", "wie viele Zeichen sind das", "20% von 340", "5 km in Meilen", "wie viele Tage bis Weihnachten". NUR echtes Rechnen/Zählen — KEIN Diagramm (→ chart) und keine allgemeine Sachfrage (→ direct/search).
- artifact: Darstellbares HTML/SVG-Artefakt - "baue eine HTML-Tabelle", "erstelle eine SVG-Grafik", "mach ein HTML-Mockup", "eine Landingpage als HTML" (NICHT für Diagramme aus Daten → das ist chart)
- save_as_doc: Antwort als Dokument speichern - "speichere als Dokument", "mach ein Dokument daraus", "als Protokoll speichern"
- create_sheet: Eigenständige, rechnende Tabelle (Spreadsheet) erstellen - "erstelle eine Tabelle", "mach ein Spreadsheet", "Budgetplan als Tabelle", "Kalkulation", "Datenliste mit Formeln". ABGRENZUNG: Eine einfache Tabelle IN einem Textdokument ("füge eine Tabelle ins Dokument ein", "als Dokument mit Tabelle") → save_as_doc mit documentSubtype "tabelle". Eine eigenständige Tabelle mit Daten/Formeln/Berechnungen → create_sheet. Eine HTML-Tabelle zum Anschauen → artifact.
- create_presentation: Präsentation / Foliensatz / Slides / Pitch-Deck erstellen - "erstelle eine Präsentation", "mach Folien", "ein Foliensatz über X", "Präsentation für den Vortrag", "Slides zu Y". ABGRENZUNG: Eine Rede oder ein Vortrag ALS FLIESSTEXT ("schreibe eine Rede", "einen Vortrag als Text") → save_as_doc. Ein strukturierter Foliensatz zum Präsentieren → create_presentation.
- create_pdf: Fertiges, barrierefreies PDF zum Herunterladen/Ausdrucken erstellen - "erstelle ein PDF", "als PDF", "mach ein PDF daraus", "zum Ausdrucken", "offizieller Brief mit Briefkopf", "Anschreiben als PDF" - ODER ein AUSFÜLLBARES Formular erzeugen ("erstelle ein Anmeldeformular", "ein ausfüllbares Formular für Mitgliedsanträge", "einen Fragebogen zum Ausfüllen"). ABGRENZUNG: Ein bearbeitbares Dokument ("speichere als Dokument", "mach ein Dokument") → save_as_doc. Ein angehängtes/erwähntes PDF LESEN oder zusammenfassen ("fasse das PDF zusammen", "was steht im PDF") → summary. Ein ANGEHÄNGTES Formular AUSFÜLLEN ("füll das Formular aus") → NICHT create_pdf. Ein Foliensatz "als PDF" → create_presentation.
- create_recurring_task: WIEDERKEHRENDE Aufgabe einrichten, die REGELMÄSSIG automatisch läuft - "jeden Montag um 9 Uhr...", "täglich eine Zusammenfassung", "erinnere mich wöchentlich", "richte eine wiederkehrende Aufgabe ein", "jeden Tag automatisch". MUSS einen Wiederholungs-Rhythmus (täglich/wöchentlich/monatlich + Uhrzeit) enthalten. ABGRENZUNG: Eine EINMALIGE Aufgabe jetzt ("fasse X zusammen", "erstelle jetzt ein Dokument") → das passende Sofort-Intent (save_as_doc / summary / …), NICHT create_recurring_task.
- modify_doc: Erwähntes Dokument bearbeiten (NUR wenn ein @Dokument erwähnt wurde UND Bearbeitungsabsicht) - "ändere", "ergänze", "aktualisiere", "füge hinzu", "überarbeite"
- modify_board: Erwähntes Board bearbeiten (NUR wenn ein @Board erwähnt wurde UND Änderungsabsicht) - "füge Aufgabe hinzu", "neue Karte", "aktualisiere Board", "erstelle Aufgaben"
- share_doc: Dokument mit Gruppe teilen - "teile mit Gruppe", "teile das mit", "share mit AG", "an Gruppe senden", "Gruppe X freigeben"
- chat_history: Frühere INHALTE DIESES Nutzers durchsuchen oder wieder aufgreifen — vergangene Chats ("was haben wir letztes Mal besprochen", "finde unseren Chat über X", "mach da weiter wo wir aufgehört haben"), eigene Dokumente/Präsentationen/Tabellen/Boards ("finde meine Präsentation zu X", "mein Dokument über Y", "die Tabelle die ich erstellt habe", "mein Board/Kanban zu Z", "meine Notizen von letzter Woche") UND eigene Reels/untertitelte Videos, die auch nach ihrem GESPROCHENEN Inhalt gefunden werden ("such mein Reel zum Thema X", "in welchem Video habe ich über Y geredet", "das Reel über Z — schreib mir eine Caption dazu"). NICHT für Grüne Positionen/Programme (→ search) und NICHT für Web-Inhalte (→ web). NICHT wenn ein NEUES Reel erstellt oder die Untertitel eines angehängten Reels geändert werden sollen — das ist die Reel-Bearbeitung, nicht die Suche.
- hilfe: BEDIENUNG DES GRÜNERATORS - Anleitungen und Erklärungen zu Funktionen des Grünerators aus der offiziellen Dokumentation ("wie erstelle ich ein Sharepic", "wie lege ich ein Notebook an", "wie binde ich die Grüne Wolke ein", "wo finde ich die Konnektoren", "welche KI-Modelle gibt es im Grünerator", "Anleitung für den Reel-Grünerator", "was ist die Agentura"). NUR für die NUTZUNG des Produkts. NICHT für inhaltliche/politische Fragen (→ search), NICHT für allgemeine KI-/Technikfragen ohne Grünerator-Bezug (→ direct/web), NICHT für eigene Inhalte des Nutzers wie Dokumente oder Boards (→ chat_history).
- mcp: (EXPERIMENTELL) Aktion über einen vom Nutzer verbundenen externen Dienst/Tool (MCP-Server) - NUR wenn der Nutzer explizit einen verbundenen Dienst oder ein Tool nennt (z.B. "@mcp", "über meinen verbundenen Server", "mit dem Linear-Tool") oder eine Aktion verlangt, die eindeutig ein solches externes Tool ausführt. Bei Unsicherheit NICHT wählen (→ direct).
- direct: STANDARD-INTENT. Begrüßungen, Dank, kreative Aufgaben, Textbearbeitung, Umformulierungen

SCHRITT 1 - ORIGINALTEXT BEWAHREN:
Verwende den ORIGINALEN Wortlaut des Benutzers für searchQuery und optimizedSearchQuery.
- Korrigiere KEINE Eigennamen, Ortsnamen, Personennamen oder unbekannte Begriffe
- Die Suchmaschine versteht Tippfehler besser als du — korrigiere NUR offensichtliche deutsche Verben für die Intent-Erkennung
- typoAnalysis ist NUR zur Protokollierung und darf searchQuery NICHT beeinflussen

GESPRÄCHSKONTEXT:
Wenn ein GESPRÄCHSVERLAUF mitgeliefert wird, nutze ihn um die aktuelle Nachricht im Kontext zu verstehen.
- Beziehe das Gesprächsthema in searchQuery und optimizedSearchQuery ein
- Beispiel: Gespräch über "Newsletter-Konzept für Kreisverband" + aktuelle Nachricht "suche nach best practise beispielen"
  → optimizedSearchQuery: "Newsletter best practices Kreisverband Grüne"
- Wenn die aktuelle Nachricht bereits spezifisch genug ist, ignoriere den Kontext
- Verändere NICHT den intent basierend auf dem Kontext — nur die Suchquery
- Wenn ein GESPRÄCHSVERLAUF vorhanden ist, setze needsClarification IMMER auf false — der nachfolgende Schritt hat Zugriff auf den vollständigen Verlauf (siehe Schritt 8)

SCHRITT 2 - INHALTSTYP ANALYSIEREN:
WICHTIG: "direct" ist der STANDARD-Intent. Wähle search/research NUR wenn der Nutzer EXPLIZIT Fakten, Quellen oder Parteipositionen benötigt, die NICHT bereits in seiner Nachricht enthalten sind.

KREATIVE AUFGABE (→ direct):
- "Erstelle/Schreib/Formulier eine Pressemitteilung/Rede/Artikel" = IMMER direct (kreative Aufgabe)
- Wenn der Nutzer alle Inhalte bereits mitliefert (z.B. kopierter Text, Bio-Daten) = IMMER direct
- Slogan, Motto, Claim, Einzeiler = direct
- Gedicht, Witz, Nachrichten, Geburtstagskarte = direct
- Umformulierungen, Kürzungen, Verbesserungen = direct
- AUSNAHME: Ein Social-Media-POST (Tweet, Insta-/Facebook-/LinkedIn-Beitrag) ist KEINE direct-Aufgabe. Post erstellen → social_post. Siehe Schritt 3, Regel 6.

RECHERCHE NUR WENN:
- Nutzer EXPLIZIT nach Fakten/Quellen fragt: "recherchiere", "finde Fakten zu", "belege für"
- Nutzer eine FRAGE stellt: "Was ist die Position der Grünen zu...?"
- Nutzer NICHT alle Informationen mitliefert UND Fakten benötigt werden

needsResearch = true genau dann, wenn du die Anfrage NICHT wahrheitsgemäß beantworten kannst, ohne etwas nachzuschlagen (aktuelle Ereignisse, Zahlen, Positionen, Personen, Zitate).
KONSISTENZ (verbindlich): Setzt du needsResearch auf true, darf der intent NICHT "direct" sein — wähle search, web oder research. "direct" heißt: alles Nötige steht bereits in der Nachricht oder es ist eine rein kreative/umformulierende Aufgabe.

FALSCHE PRÄMISSEN ERKENNEN:
Wenn eine Anfrage ein konkretes Ereignis mit einer Zeit-/Jahresangabe nennt, die so nicht stattgefunden haben könnte (z.B. eine Wahl, Abstimmung oder ein Termin, den es in dieser Form nicht gibt) — verlasse dich NICHT darauf, dass die genannte Zeitangabe stimmt. Wähle trotzdem intent web (oder news/umfragen je nach Ereignisart), NICHT direct, damit eine echte Suche die tatsächlichen Fakten liefert. Nur mit echten Suchergebnissen kann eine falsche Prämisse im Antwortschritt richtiggestellt werden, statt unwidersprochen zu bleiben oder mit "dazu habe ich keine Informationen" abgetan zu werden.

SCHRITT 3 - TOOL WÄHLEN:
0. Kommt eines der Wörter Sharepic/Share-Pic/Spruchbild/Zitatbild/Dreizeiler wörtlich vor? → sharepic (VOR image prüfen!). Ohne eines dieser Wörter NIEMALS sharepic — "Grafik" und "Kachel" sind kein Sharepic.
1. Bildgenerierung (freies KI-Bild)? → image
1b. Bildbearbeitung (Bearbeitungsverb + Bild/Foto-Bezug oder Bild-Anhang)? → image_edit
2. EXPLIZITE Web-Suche ("suche im netz")? → web
3. Zusammenfassung eines angehängten/referenzierten Dokuments? → summary
3b. Zeichen/Wörter zählen, rechnen, Einheiten umrechnen oder Datumsmathematik? → compute
4. Als Dokument speichern? → save_as_doc
4b. Eigenständige rechnende Tabelle/Spreadsheet erstellen? → create_sheet
4c. Präsentation / Foliensatz / Slides erstellen? → create_presentation
4d. Fertiges PDF zum Herunterladen/Ausdrucken, offizieller Brief mit Briefkopf oder ein ausfüllbares Formular? → create_pdf
4e. Wiederkehrende, regelmäßig automatisch laufende Aufgabe (mit Rhythmus + Uhrzeit)? → create_recurring_task
5. Dokument mit Gruppe teilen? → share_doc
5a-. Bezug auf DIESES laufende Gespräch ("vorhin", "in diesem Chat", "deine letzte Antwort", "meine erste Frage")? → NICHT chat_history. Der Verlauf liegt bereits im Kontext; wähle den Intent, der zur eigentlichen Sachfrage passt (meist direct, bei Faktenfragen search/web).
5b. Bezug auf ein FRÜHERES, ABGESCHLOSSENES GESPRÄCH oder einen EIGENEN INHALT des Nutzers — Dokument/Präsentation/Tabelle/Board/Reel ("letztes Mal", "unser Chat über", "mach da weiter", "meine Präsentation zu", "mein Dokument über", "die Tabelle die ich erstellt habe", "mein Board/Kanban zu", "such mein Reel zu", "in welchem Video habe ich über … gesprochen")? → chat_history
   Auch dann, wenn direkt eine Folgeaufgabe drangehängt wird ("… und schreib mir eine Caption dazu") — erst suchen, der Text entsteht danach aus dem gefundenen Transkript.
6. Social-Media-Post ERSTELLEN (Insta/Facebook/Tweet/LinkedIn oder generisch)? → social_post (auch "Post MIT Sharepic" → social_post; ohne das Wort "Sharepic" entsteht nur Text)
6a. Social-Media-Vorlage/Beispiel ANSEHEN ("zeig mir Beispiele")? → examples
6b. Abstimmungsverhalten/Nebentätigkeiten einer konkreten Person ODER Ergebnis einer namentlichen Abstimmung? → abgeordnetenwatch
6c. Bundestagsdokumente, Plenardebatten, Reden oder Gesetzgebungsverfahren (Drucksachen, Protokolle)? → bundestag
6d. Kombinierte Reiseplanung (Zug + Hotel/Wetter)? → reise; NUR Hotel/Unterkunft? → hotel
6e. REINE Zugverbindung/Abfahrtszeit/Fahrplan/Bahnhofsauskunft? → bahn (Bahnpolitik → search)
6f. Konkrete Wettervorhersage/aktuelles Wetter für einen Ort? → wetter (Klimapolitik → search)
6g. Aktuelle Nachrichtenlage/Schlagzeilen/tagesschau-Meldungen zu einem Thema? → news
6h. Wahlumfragen/Sonntagsfrage/Umfragewerte (bundesweit oder Bundesland)? → umfragen
6i. Frage zur BEDIENUNG des Grünerators (Anleitung, "wie mache ich X im Grünerator", Funktion erklärt haben)? → hilfe (inhaltliche Fragen → search)
7. EXPLIZITE Recherche ("recherchiere", "finde Fakten")? → research (= web mit mehr Aufwand)
8. EXPLIZITE FRAGE zu Grüner Politik/Programm/Position? → search
9. Aktuelle News/Ereignisse? → web
10. Alles andere (kreativ, Textbearbeitung, Erstelle/Schreib X) → direct

SCHRITT 4 - SUCHQUERY OPTIMIEREN:
Wenn intent search/research/web/examples/social_post/chat_history ist, erstelle eine optimierte Suchquery:
- Bei chat_history: extrahiere das THEMA des gesuchten Gesprächs, Dokuments oder Reels (z.B. "unser Chat über den Newsletter" → "Newsletter", "meine Präsentation zur Klimapolitik" → "Klimapolitik", "such mein Reel über Windkraft und schreib eine Caption" → "Windkraft"). Die angehängte Folgeaufgabe ("schreib eine Caption", "fass zusammen") gehört NICHT in die Query. Zeitangaben ("letzte Woche", "gestern") gehören in date_from/date_to (Schritt 7), nicht in die Query.
- Entferne Aufgabenanweisungen (schreib, erstelle, formuliere, verfasse...)
- Behalte NUR das faktische Thema für die Suche
- Beispiel: "Schreib eine Pressemitteilung über die Klimapolitik der Grünen" → "Klimapolitik der Grünen"
- Beispiel: "Erstelle mir Argumente zur Energiewende" → "Energiewende Argumente"
- Beispiel: "Was sagen die Grünen zum Kohleausstieg?" → "Grüne Kohleausstieg Position"
- ANAPHER AUFLÖSEN: Wenn die Nachricht sich auf das geöffnete Dokument bezieht ("dieses/diesem Dokument", "hier", "das hier", "dazu") UND ein THEMENKONTEXT mitgeliefert wird, löse die Referenz auf das tatsächliche Thema des Dokuments auf (aus dem Themenkontext) und baue searchQuery + optimizedSearchQuery aus diesem Thema. Suche NIE nach der wörtlichen Meta-Frage.
- Beispiel: "wie ist unsere position zu diesem dokument" + Themenkontext (Dokument über kommunalen Klimaschutz) → optimizedSearchQuery: "Grüne Position kommunaler Klimaschutz"

SCHRITT 4b - THEMA DES ARTEFAKTS BESTIMMEN (creationTopic):
Wenn intent sharepic/image/create_pdf/create_sheet/create_presentation/save_as_doc/modify_board ist,
setze creationTopic auf das Thema, ÜBER DAS das Artefakt gehen soll.
- Die Erstellungsanweisung selbst ist NIE das Thema. "jetzt noch ein normales sharepic" beschreibt
  Zeitpunkt und Layout, kein Thema.
- Nennt die aktuelle Nachricht kein eigenes Thema, nimm es aus dem GESPRÄCHSVERLAUF — das zuletzt
  inhaltlich verhandelte Thema, NICHT deine eigene Bestätigung ("Ich habe dir 1 Sharepic-Variante
  erstellt.") und nicht die Erstellungsanweisung des Nutzers.
- Beispiel: Verlauf "zitat sharepic für klimaanlagen in schulen für hitzeschutz" → Bestätigung →
  aktuelle Nachricht "jetzt noch ein normales sharepic" → creationTopic: "Klimaanlagen in Schulen als Hitzeschutz"
- Beispiel: Verlauf über Artenschutz-Recherche + "visualisiere das in einem sharepic" → creationTopic: "Artenschutz"
- Nennt die Nachricht ihr Thema selbst, gib genau dieses zurück ("erstelle ein Sharepic zum Radwegeausbau"
  → "Radwegeausbau").
- Gibt der Verlauf kein Thema her und nennt die Nachricht keins, setze null. Rate NICHT und erfinde NICHTS —
  null führt zu einer Rückfrage an den Nutzer, ein erfundenes Thema zu einem falschen Artefakt.
- Bei allen anderen Intents: null.

SCHRITT 5 - KOMPLEXE ANFRAGEN ZERLEGEN:
Wenn die Anfrage MEHRERE VERSCHIEDENE Themen vergleicht, kombiniert, ODER verschiedene Aufgaben enthält die verschiedene Themen betreffen:
- Erstelle sub-Queries für jedes einzelne THEMA (max 3)
- Themenvergleich: "Vergleiche die Klima- und Verkehrspolitik" → ["Klimapolitik Grüne", "Verkehrspolitik Grüne"]
- Themenverknüpfung: "Energiewende und Kohleausstieg der Grünen" → ["Energiewende Grüne", "Kohleausstieg Grüne"]
- Aufgabe mit mehreren Themen: "recherchiere Situation in Bonn und schreibe Antrag für Klimaschutz" → ["Situation Bonn", "Klimaschutz"]
- Aufgabe mit EINEM Thema: "recherchiere Klimaschutz und schreibe PM" → subQueries: null (nur ein Thema)
- WICHTIG: Zerlege nur nach THEMEN, nicht nach Aufgabentypen
- Bei einfachen Anfragen zu einem Thema: setze subQueries auf null

SCHRITT 6 - MEHRERE SUCHQUELLEN:
Manche Anfragen brauchen SOWOHL interne Dokumente ALS AUCH Web-Recherche:
- "Was sagen die Grünen zum Klimaschutz und was sind die aktuellen Entwicklungen?" → searchSources: ["documents", "web"]
- "Grüne Position zur Energiewende und aktuelle Nachrichten dazu" → searchSources: ["documents", "web"]
- Nur Parteiprogramm → searchSources: [] (normaler search-Intent reicht)
- Nur aktuelle Nachrichten → searchSources: [] (normaler web-Intent reicht)

SCHRITT 7 - METADATEN-FILTER ERKENNEN:
Wenn die Anfrage SPEZIFISCHE Filterkriterien enthält, extrahiere sie:

- content_type: Dokumenttyp — "presse", "beschluss", "antrag", "blog", "wahlprogramm", "position", "rede"
  Beispiel: "Pressemitteilungen zum Klimaschutz" → content_type: "presse"
- landesverband: Regionale Zuordnung — "HH" (Hamburg), "SH" (Schleswig-Holstein), "TH" (Thüringen), "BY" (Bayern)
  Beispiel: "Grüne Hamburg Beschlüsse" → landesverband: "HH"
- primary_category: Themenbereich wenn EXPLIZIT genannt
  Beispiel: "Verkehrspolitik der Grünen" → primary_category: "Verkehr"
- date_from / date_to: Zeitraum im Format "YYYY-MM-DD"
  Beispiel: "seit Januar 2025" → date_from: "2025-01-01"
  Beispiel: "Beschlüsse 2024" → date_from: "2024-01-01", date_to: "2024-12-31"
- person: Personenname wenn EXPLIZIT erwähnt (wird für die Suche verwendet, nicht als Qdrant-Filter)
  Beispiel: "Was sagt Habeck zu Energie?" → person: "Habeck"

Setze NUR Felder die KLAR aus der Anfrage hervorgehen. Bei Unsicherheit: null.

SCHRITT 8 - KLÄRUNGSBEDARF ERKENNEN:
Standardmäßig: needsClarification: false, clarificationQuestion: null, clarificationOptions: null

Setze needsClarification: false wenn:
- Die Anfrage ein klares Thema enthält ("Grüne Position zum Klimaschutz")
- Ein GESPRÄCHSVERLAUF vorhanden ist — auch wenn die aktuelle Nachricht allein mehrdeutig wäre ("erstelle einen Post", "mach daraus einen tweet", "kürze das"). Der nachfolgende Verarbeitungsschritt hat Zugriff auf den VOLLSTÄNDIGEN Gesprächsverlauf und kann das Thema daraus ableiten, auch wenn du es im gekürzten Verlauf hier nicht siehst.

AUSNAHME — needsClarification: true NUR wenn ALLE diese Bedingungen zutreffen:
1. KEIN Gesprächsverlauf vorhanden (erste Nachricht)
2. Die Anfrage enthält KEIN erkennbares Thema
3. Ohne Thema kann keine sinnvolle Antwort erstellt werden

Beispiel für die Ausnahme (erste Nachricht, kein Kontext):
- "Was ist die Position?" → needsClarification: true, clarificationQuestion: "Zu welchem Thema möchtest du die Position der Grünen erfahren?", clarificationOptions: ["Klimapolitik", "Verkehrspolitik", "Sozialpolitik", "Energiepolitik"]
- "Erstelle einen Post" → needsClarification: true, clarificationQuestion: "Über welches Thema soll der Post sein?", clarificationOptions: ["Klimaschutz", "Soziale Gerechtigkeit", "Verkehrswende"]

KEIN Klärungsbedarf (Gesprächsverlauf vorhanden):
- Verlauf über Klimapolitik + "jetzt darauf basierend einen tweet" → needsClarification: false
- Verlauf über Pressemitteilung + "mach das kürzer als post" → needsClarification: false
- Verlauf über Energiewende + "erstelle einen Post dazu" → needsClarification: false

SCHRITT 9 - SEKUNDÄREN INTENT ERKENNEN:
Wenn die Anfrage ZUSÄTZLICH zur Hauptaufgabe eine zweite Aktion erfordert, setze secondaryIntent:
- "Recherchiere X und erstelle ein Bild dazu" → intent: "research", secondaryIntent: "image"
- "Suche nach Y und zeige Beispiele" → intent: "search", secondaryIntent: "examples"
- "Fasse das Dokument zusammen und erstelle ein Diagramm" → intent: "summary", secondaryIntent: "chart"
- Einfache Anfragen → secondaryIntent: null (Standard)

REGELN:
- secondaryIntent MUSS sich vom intent unterscheiden
- Maximal EIN secondaryIntent
- search/research/web können NICHT secondaryIntent sein — sie liefern Kontext und sind immer primary
- Typische secondaryIntents: image, examples, chart, save_as_doc

Antworte NUR mit JSON:
{
  "typoAnalysis": {"original": "...", "corrected": "..."} | null,
  "contentType": "pressemitteilung" | "artikel" | "rede" | "argumentation" | "tweet" | "slogan" | null,
  "needsResearch": true | false,   // true = ohne Nachschlagen nicht wahrheitsgemäß beantwortbar; dann NIEMALS intent "direct"
  "intent": ${INTENT_ENUM_LINE},
  "secondaryIntent": "image" | "examples" | "chart" | "save_as_doc" | null,
  "documentSubtype": ${DOC_SUBTYPE_ENUM_LINE} | null,
  "searchQuery": "ORIGINALTEXT des Benutzers (KEINE Korrekturen an Eigennamen!)" | null,
  "optimizedSearchQuery": "nur das faktische Thema aus dem ORIGINALTEXT, ohne Aufgabenanweisung" | null,
  "subQueries": ["thema1", "thema2"] | null,
  "searchSources": ["documents", "web"] | [],
  "filters": {
    "content_type": null | "presse" | "beschluss" | "antrag" | "blog" | "wahlprogramm" | "position" | "rede",
    "landesverband": null | "HH" | "SH" | "TH" | "BY",
    "primary_category": null | "Themenbereich",
    "date_from": null | "YYYY-MM-DD",
    "date_to": null | "YYYY-MM-DD",
    "person": null | "Personenname"
  },
  "needsClarification": false | true,
  "clarificationQuestion": "..." | null,
  "clarificationOptions": ["option1", "option2"] | null,
  "targetGroupName": "Name der Zielgruppe" | null,
  "creationTopic": "das Thema, über das das Artefakt gehen soll" | null,
  "reasoning": "..."
}

Bei "direct", "sharepic", "image" und "image_edit" setze searchQuery, optimizedSearchQuery, subQueries, searchSources und filters auf null/[]. creationTopic ist davon NICHT betroffen (siehe Schritt 4b).
Bei "save_as_doc" setze documentSubtype auf den passenden Dokumenttyp:
- "checkliste" für Aufgabenlisten, Todo-Listen, Checklisten, Aufgaben zum Abhaken
- "protokoll" für Sitzungsprotokolle, Versammlungsprotokolle
- "pressemitteilung" für Pressemitteilungen, PM
- "antrag" für Anträge, Beschlussvorlagen
- "einladung" für Einladungen, Terminankündigungen
- "tabelle" für tabellarische Daten, Übersichten
- "notizen" für Notizen, Mitschriften
- "redaktionsplan" für Redaktionspläne, Content-Pläne
- null wenn kein spezifischer Typ erkennbar ist
WICHTIG: "todo" oder "aufgaben" → immer "checkliste", NICHT "protokoll".
Bei "share_doc" setze targetGroupName auf den im Text genannten Gruppennamen (z.B. "AG Umwelt", "KV München"). Setze searchQuery auf null.`;

/**
 * Intents whose turn produces an artifact from a single generation pass, and
 * which therefore need `creationTopic`. Same constant the prompt's SCHRITT 4b
 * enumerates, so "asked of the model" and "accepted from the model" cannot
 * drift apart.
 */
export const CREATION_TOPIC_INTENTS = new Set([
  'sharepic',
  'image',
  'create_pdf',
  'create_sheet',
  'create_presentation',
  'save_as_doc',
  'modify_board',
]);

/**
 * Intents that don't trigger search/retrieval — used to skip query optimization.
 */
export const NON_SEARCH_INTENTS = new Set([
  'direct',
  'sharepic',
  'image',
  'image_edit',
  'chart',
  'artifact',
  'compute',
  'save_as_doc',
  'create_sheet',
  'create_presentation',
  'create_pdf',
  'create_recurring_task',
  'modify_doc',
  'modify_board',
  'share_doc',
  'mcp',
  // System MCP sources: the loop's tools take the model's own arguments — no
  // Qdrant search-query optimization involved.
  'bahn',
  'reise',
  'hotel',
  'umfragen',
  'wetter',
  'news',
]);

export const CLASSIFIER_CONTEXT_MESSAGES = 5;
export const CLASSIFIER_CONTEXT_MAX_CHARS = 500;
