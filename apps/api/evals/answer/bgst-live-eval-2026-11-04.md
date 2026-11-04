# BGSt-Beschluss-Notebook: Live-Eval gegen gruenerator.eu (04.11.2026)

**Zielsystem:** Produktion, `https://gruenerator.eu`, Notebook „Beschlüsse Testing" (`5a438806-4e76-43c4-bf1e-1751708d123b`, geteilt über das Projekt „BGS Test", 41 Beschluss-PDFs, alle `ready`).
**Sollwerte:** `TestergebnisseKI.docx` (BGSt, 03.11.2026): 18 Fragen in drei Gruppen. A = Einzelfakt, B = Gremium/Urheberschaft, C = Synthese über mehrere Beschlüsse. Jede Soll-Antwort nennt Titel, Gremium und Fundstelle (Seite/§/Zeile).
**Lauf:** genau der Request, den die Web-UI schickt (vor dem Lauf im Browser mitgeschnitten): `POST /api/chat-service/notebook/stream`, `mode: "deep"` (Regler „Mittel", Standard), `answerMode: "auto"`, `model: "gruenerator-medium"`. A1 und A2 wurden über die UI gestellt, A3–C4 mit demselben Body aus der eingeloggten Seite, jede Frage in einem frischen Thread und ohne Verlauf. Die Trace-IDs stehen unten in der Tabelle.

## Ergebnis

|                 | richtig | teilweise  | falsch |
| --------------- | ------- | ---------- | ------ |
| A (8 Fakten)    | 6       | 1 (A8)     | 1 (A7) |
| B (6 Gremien)   | 6       | –          | –      |
| C (4 Synthesen) | 1 (C2)  | 2 (C1, C4) | 1 (C3) |
| **gesamt**      | **13**  | **3**      | **2**  |

Erfundene Fakten gab es keine. Alle Fehler sind Auslassungen: Ein Dokument, das die Antwort trägt, kommt in der Antwort nicht vor. Die gesuchten Dokumente werden aber gefunden (siehe P2). Der Verlust entsteht nach dem Retrieval.

## Je Frage

| ID  | Urteil | Modus (Grund)         | Latenz | Befund                                                                                                                                                                                                                                                                                                                                                                                          | Trace    |
| --- | ------ | --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A1  | ✅     | chat                  | ~20 s  | 15.10.2026, § 18 Evaluation als Zusatz korrekt. Alle vier Zitate hängen an jedem Satz, und zwei davon zeigen auf die Dublette (P4).                                                                                                                                                                                                                                                             | – (UI)   |
| A2  | ✅     | chat (auto)           | –      | ≥ 70 % bis 2029, „Public Money, Public Code". Der Beschlusstitel fällt nicht. Grammatikfehler im letzten Satz („die vor allem durch Lizenzkosten verursachen").                                                                                                                                                                                                                                 | – (UI)   |
| A3  | ✅     | chat (guard)          | 9,5 s  | 5 ct/kWh, Zielgruppe und Bedingungen korrekt. Ordnet die Zahl zusätzlich „Kurs Zukunft" zu; ob die Zahl dort auch steht, ist **ungeprüft**.                                                                                                                                                                                                                                                     | f5e977b0 |
| A4  | ✅     | praezision (guard)    | 14,9 s | 30–60 Personen. „paritätisch" fehlt. Alle 10 Zitate stammen aus demselben Dokument.                                                                                                                                                                                                                                                                                                             | 2c36a082 |
| A5  | ✅     | chat (guard)          | 17,1 s | 420 €/2.100 €, Koalition, PtL-Quote, Kerosinsteuer: vollständig. Lang und mit Füllabsätzen.                                                                                                                                                                                                                                                                                                     | 535af41d |
| A6  | ✅     | chat (guard_fallback) | 12,5 s | 6 Monate plus Ausnahme bei Straftatverdacht: vollständig.                                                                                                                                                                                                                                                                                                                                       | 245dd468 |
| A7  | ❌     | praezision (guard)    | 20,8 s | Antwortet, die Quellen enthielten **keine** Zahl. Soll: „rund drei Prozent", Beschluss „Nur Ja heißt Ja" (Bundesfrauenrat). 8 von 10 Passagen stammten aus dem _anderen_ Frauenrat-Beschluss (digitale Gewalt).                                                                                                                                                                                 | bf726271 |
| A8  | 🟡     | praezision (guard)    | 19,0 s | Die Höhe (500 Mrd. €) stimmt, die Bezeichnung („Sondervermögen für Infrastrukturinvestitionen") fehlt. Die Frage fragt nach beidem.                                                                                                                                                                                                                                                             | 529d6ed8 |
| B1  | ✅     | chat (guard)          | 12,1 s | Diversitätsrat, Beteiligte korrekt.                                                                                                                                                                                                                                                                                                                                                             | cf5a508a |
| B2  | ✅     | chat (guard)          | 19,1 s | Beide Forderungen kommen vom Bundesfrauenrat; die beiden Beschlüsse und Daten (20.04./18.04.2026) sind richtig auseinandergehalten.                                                                                                                                                                                                                                                             | c32892f0 |
| B3  | ✅     | chat (guard)          | 20,0 s | 51. BDK Hannover, „Digitale Souveränität stärken".                                                                                                                                                                                                                                                                                                                                              | 48660e3d |
| B4  | ✅     | chat (guard)          | 17,0 s | BuVo (ausdrücklich „aus dem Dateinamen" hergeleitet, wie im Soll), am Folgetag Länderrat. Nennt 2 der 3 LR-Beschlüsse vom 28.06.                                                                                                                                                                                                                                                                | 8900b078 |
| B5  | ✅     | chat (guard)          | 14,3 s | BuVo + Parteirat, jeweils Zweidrittelmehrheit. Nennt danach „§ 25 der Satzung" neben „§ 28". Ob § 25 im Dokument steht, ist **ungeprüft**.                                                                                                                                                                                                                                                      | 3d083292 |
| B6  | ✅     | chat (guard)          | 7,6 s  | Antragsteller und BAG korrekt, A5 als Bezugsantrag korrekt.                                                                                                                                                                                                                                                                                                                                     | 99c1ad8c |
| C1  | 🟡     | praezision (guard)    | 20,6 s | Nennt 2 von 3 Beschlüssen. Es fehlt „Zukunft sichern – ökologisch, gerecht, wettbewerbsfähig" (BDK). 9 von 10 Passagen stammten aus „Nah am Menschen".                                                                                                                                                                                                                                          | 2be7bda8 |
| C2  | ✅     | chat (guard)          | 11,8 s | Staat und Partei vollständig (70 %/2029, Lock-in, Schleswig-Holstein, Ankerkunde, „Open Source first", Ausnahmen). Beste Antwort des Laufs.                                                                                                                                                                                                                                                     | a984d6ef |
| C3  | ❌     | chat (guard)          | 10,6 s | Nur 2 von 4 Positionen. Es fehlen die 49-€-Garantie (BuVo „Mehr im Geldbeutel", 01/2025) und „Erfolg der Regierungsbeteiligung" (LR „Klar. Grün. Konstruktiv", 04/2025). Fazit „**konsistentes** Forderungsprofil" ist inhaltlich falsch, denn das Soll zeigt eine Entwicklung von 49 € zu 9 €. Positionen sind keinem Gremium und keinem Datum zugeordnet („Es wird die Forderung erhoben …"). | f61062ff |
| C4  | 🟡     | chat (guard)          | 19,2 s | Frauenrat (digital), Diversitätsrat, LR-Statut und BuVo-Ombuds sind abgedeckt. **„Nur Ja heißt Ja" fehlt.** Dafür kommen Themenfremde Punkte hinzu (Selbstbestimmungsgesetz/Geschlechtsmündigkeit, PMK-Statistik, KI-Diskriminierung). Die Pauschale „Alle Gremien betonen … Forschung und Monitoring" deckt keine Quelle für LR/BuVo.                                                          | 93842ff4 |

## Probleme, nach Wirkung sortiert

### P1: Der Präzisionsmodus sieht nur 10 Passagen, meist aus einem einzigen Dokument (A7 ❌, C1 🟡, A8 🟡)

`answerMode: "auto"` hat 4 der 16 API-Fragen in den Präzisionsmodus geschickt (A4, A7, A8, C1, alle `reason: guard`). Jede dieser Antworten hatte `toolCallCount: 1` und genau 10 Zitate. Das Werkzeug `notebook_quellen` (`find`) holt ohne explizites `limit` 10 Treffer (`routes/chat/agents/notebookSourceTools.ts:927`, `limit: args.limit ?? 10`), und der Loop sucht danach nicht weiter. Im Chatmodus derselben Tiefe gehen 100 Passagen in den Prompt (`config/notebookDepthProfiles.ts`, `deep.rerankOutput: 100`).

Was das bewirkt: Bei A7 füllt der _thematisch nähere_ Frauenrat-Beschluss 8 der 10 Plätze, und das Modell antwortet ehrlich „steht nicht drin". Die Antwort ist falsch, aber nicht erfunden. Bei C1 belegt ein Dokument 9 der 10 Plätze. C1 ist dazu eine Inventarfrage („Welche Beschlüsse …"), die nach Vollständigkeit über Dokumente fragt. Genau dafür ist ein Fenster von 10 Passagen ohne Streuung über Dokumente der falsche Modus.

Ansatzpunkte, ungeprüft: (a) Inventar- und „welche Beschlüsse"-Fragen nicht in den Präzisionsmodus leiten; (b) `find` im Präzisionsmodus mit größerem `limit` oder mit einer Obergrenze je Dokument; (c) die Antwort „nicht enthalten" erst zulassen, wenn ein zweiter Suchlauf mit umformulierter Anfrage stattgefunden hat.

### P2: Das Retrieval findet die fehlenden Dokumente, die Antwort lässt sie trotzdem weg (C3 ❌, C4 🟡)

Gegenprobe über `GET /api/auth/notebook-collections/:id/search?q=<Frage im Wortlaut>` (Dokument-Ebene, Top 5; das ist **nicht** dieselbe Pipeline wie der Stream, nur ein Indiz):

- A7: „Nur Ja heißt Ja" steht auf Rang 5.
- C1: „Zukunft sichern" steht auf Rang 5.
- C3: „Klar. Grün. Konstruktiv" steht auf **Rang 1** und erscheint auch in den 10 angezeigten Quellen der C3-Antwort (`allSources`, Position 8), in der Antwort selbst aber nicht. „Mehr im Geldbeutel" fehlt in der Top 5. Ob es unter den 100 Prompt-Passagen war, ist **ungeprüft**.

Bei C3 lag das Material also im Kontext. Die Lücke entsteht beim Schreiben, und der Prompt begünstigt sie (P3).

### P3: Der Dossier-Prompt arbeitet gegen Fakt- und Positionsfragen (alle 12 Chat-Antworten)

`agents/langgraph/prompts.ts:103–150` (`buildDraftPrompt`) gilt für jede Frage im Chatmodus und schreibt vor:

- Zeile 117: Einleitung mit dem wörtlichen Satzanfang „Die Quellen enthalten [umfangreiche/detaillierte/grundlegende] Informationen zu …". Das Ergebnis: **alle 12 Chat-Antworten** beginnen mit diesem Satz, auch die Ein-Fakt-Fragen. Die eigentliche Antwort steht erst im zweiten Absatz.
- „Strukturiere nach INHALTLICHEN Themen, nicht nach Dokumenten" und „Verbinde Informationen aus verschiedenen Quellen zu kohärenten Aussagen". Bei C3 („Welche Positionen … wie verhalten sie sich zueinander?") verschmilzt das die Positionen zu einer einzigen und streicht Urheber und Datum. Daraus entsteht das falsche „konsistent". Bei C4 ordnet das Modell nach Themen statt nach Gremien, obwohl die Frage „von welchen Gremien" lautet.
- Synthese-Absatz „bei komplexen Themen": Er erscheint auch bei A3 und A5 und wiederholt dort nur den Inhalt davor.

Das Soll erwartet bei A- und B-Fragen: direkte Antwort im ersten Satz, danach Titel, Gremium und Fundstelle. Bei C-Fragen: Gliederung nach Quelle bzw. Gremium mit Datum. Ansatzpunkt: die Antwortform nach Fragetyp verzweigen (Faktfrage, Zuordnungsfrage, Synthese), statt eine einzige Dossierform für alles vorzuschreiben. Die Floskel ersatzlos streichen.

### P4: Doppelt hochgeladenes Dokument verdoppelt Treffer und Zitate

„20260628-Beschluss-LR-Statut-gegen-sexuelle-Belaestigung.pdf" liegt zweimal im Notebook (`8c2d2084-…` und `c92b3b45-…`). Folgen: Die Trefferliste der Notebook-Suche zeigt dieselbe Karte zweimal hintereinander, und A1 belegt jeden Satz mit vier Zitaten für zwei Textstellen. Das ist ein Datenfehler im Testbestand, aber beim Hochladen in dasselbe Notebook fällt er nicht auf. Ein Abgleich über den Datei-Hash (`file_hash` gibt es für gescrapte PDFs schon) würde ihn abfangen. Für weitere Läufe sollte die Dublette aus dem Testnotebook raus, sonst misst jede Zitatzählung doppelt.

### P5: Zitate sind grob verteilt

- Chatmodus: dieselbe Zitatgruppe hängt an jedem Satz (A1: `[1][2][3][4]` zweimal hintereinander; A5/A6: `[1][2]` an fast jedem Satz). Welche Passage welchen Satz stützt, lässt sich so nicht prüfen.
- Präzisionsmodus: 10 Zitate pro Antwort, auch bei einem einzigen Fakt (A4: eine Zahl, 10 Quellen aus einem Dokument).
- Keine Antwort nennt Seite, § oder Zeile im Text. Das Soll tut es durchgehend. Ob die Zitat-Chips die Seite zeigen, ist in diesem Lauf nicht geprüft.

### P6: Kleinkram

- A2: Grammatikfehler in der Synthese.
- C4: Pauschalaussagen über „alle Gremien", die die Quellen nicht decken.
- C2: Das Fazit zitiert den Außenpolitik-Beschluss (`[cite:17]`), der zur Beschaffung nichts beiträgt.

## Was gut lief

- **Keine erfundenen Zahlen und keine falschen Gremien.** Alle B-Fragen stimmen, auch die beiden schwierigen: B2 (zwei Beschlüsse desselben Gremiums an verschiedenen Tagen) und B4 (Gremium nur aus dem Dateinamen ableitbar; die Antwort sagt das offen, genau wie das Soll).
- **Ausnahmen und Einschränkungen kommen mit:** A6 (Straftatverdacht), A1 (§ 18 Evaluation), A5 (Kerosinsteuer, PtL).
- **C2 erreicht das Soll vollständig**, inklusive Staat/Partei-Trennung.
- **A7 scheitert ehrlich.** Das Modell hat aus der falschen Quelle nichts erfunden, sondern „nicht enthalten" gesagt.
- Latenz 7,6–20,8 s je Frage in „Mittel".

## Gegenprobe: dieselben Fragen mit festgelegtem Modus

Nachgelaufen am selben Tag. Body wie oben, nur `answerMode` fest gesetzt (bzw. `mode: "ultra"`).

| Frage | auto wählte | Ergebnis auto         | Gegenprobe                            | Ergebnis Gegenprobe                                                                                                     |
| ----- | ----------- | --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A4    | praezision  | ✅ ohne „paritätisch" | chat                                  | ✅ vollständig inkl. „paritätisch"                                                                                      |
| A7    | praezision  | ❌ „nicht enthalten"  | chat                                  | ✅ „rund drei Prozent", „Nur Ja heißt Ja", 20.04.2026                                                                   |
| A8    | praezision  | 🟡 Bezeichnung fehlt  | chat                                  | ✅ „Sondervermögen für Infrastrukturinvestitionen, 500 Mrd."                                                            |
| C1    | praezision  | 🟡 2/3                | chat                                  | ✅ alle 3 Beschlüsse zitiert. Die Antwort nennt sie aber nicht als Liste, sondern verschmilzt sie im Fließtext.         |
| C1    | –           | –                     | praezision (zweiter Lauf)             | 🟡 identisch zum ersten: ein `find`, 2/3                                                                                |
| C3    | chat (deep) | ❌ 2/4                | praezision                            | ❌ 1/4, ein `find` mit `query: "Deutschlandticket"`, nur „Kurs Zukunft"                                                 |
| C3    | chat (deep) | ❌ 2/4                | chat, `mode: ultra` (3 Suchvarianten) | 🟡 3/4: „Klar. Grün. Konstruktiv" kommt dazu, die 49-€-Garantie fehlt weiter. Weiterhin ohne Gremium und Datum im Text. |

**Folgerung: Alle vier Präzisions-Entscheidungen von „auto" waren falsch.** Im Chatmodus beantwortet „Mittel" alle vier Fragen vollständig. Nach der eigenen Definition des Wächters (`notebookAnswerModeResolver.ts`, `GUARD_PROMPT`) sind A4, A7 und A8 Inhaltsfragen. Die Zahl steckt im Inhalt, gezählt werden keine Quellen. Der Wächter verwechselt offenbar Zahlwörter („wie viele", „welcher Anteil", „in welcher Höhe") mit „zählen". C1 („welche Beschlüsse …") passt formal zu „vollständige Listen über alle Quellen". Dafür bräuchte der Präzisionsmodus aber `grep` über alle Quellen, und den ruft er nicht auf (P1).

C3 hat zwei Ursachen. **Retrieval:** „Mehr im Geldbeutel" landet bei der Dokumentsuche mit der Anfrage „Deutschlandticket 49 Euro Preis garantieren" auf Rang 1, mit dem Wortlaut der Frage nicht unter den ersten 5. Ob es unter den 100 Prompt-Passagen war, ist ungeprüft. **Prompt:** Auch mit 3 Dokumenten verschmilzt die Antwort die Positionen und nennt kein Gremium und kein Datum (P3).

## Nebenbeobachtungen (nicht Teil der Eval)

- Enter im leeren Notebook zeigt in diesem Tab die Trefferliste („30 Ergebnisse") und hat die Antwort in einem **neuen Browser-Tab** geöffnet (`?thread=…`). Ob das gewollt ist oder am Automatisierungs-Browser lag, ist ungeprüft.
- Die Notebook-Suche hebt Füllwörter („zu", „in", „das") in den Trefferausschnitten als Treffer hervor.
- Barrierefreiheit (nebenbei geprüft): Die Icon-Links der Seitenleiste und das Konto-Menü haben `sr-only`-Namen, und die Zitat-Buttons tragen `aria-label="Quelle n: <Titel>"`. Mängel fanden sich nicht.

## Nächster Schritt für die Messbarkeit

`evals/tools/buildBgstKorpusCorpus.ts` enthält bereits eine Notebook-Lane für genau diesen Bestand (`bgst-korpus`, 16 Szenarien). Sie zeigt auf die Sammlung `bgst-beschluesse`, „die heute auf keinem Zielsystem eingelesen ist". Mit diesem Notebook gibt es den Bestand jetzt. Wer die 18 Fragen dieser Datei als Szenarien dort ergänzt (`topicsCovered` aus den Sollwerten, z. B. A7 `['drei prozent|3 prozent']`, C1 drei Titel, C3 `['49', '9 euro']`), kann jeden Fix an P1–P3 gegen dieselbe Messlatte fahren statt per Hand im Browser.
