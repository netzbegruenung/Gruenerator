# LV-Korpusanalyse — Methodik & Checkliste

> Distilliert aus den 8 LV-PM-Analysen (Berlin LV+Fraktion, Hamburg LV, MV LV+Fraktion, Thüringen LV+Fraktion, Brandenburg LV).
> Zweck: (1) reproduzierbares Vorgehen für neue Landesverbände, (2) Qualitäts-Checkliste — jede Dimension MUSS im jeweiligen Agent-`systemRole` reflektiert (oder bewusst weggelassen) werden.

## Korpus-Bezugsquelle

- **Qdrant-Collection**: `landesverbaende_documents`
- **Pflicht-Filter pro Analyse**: `content_type='presse'` + `landesverband=<code>` + `source_type=<landesverband|fraktion>`
- **Extraktion**: `apps/api/scripts/extract-lv-pms.ts` — scrollt alle Chunks, **dedupliziert per `document_id`** (pro PM gewinnt der Chunk mit `full_text` ODER der längste `chunk_text`), sortiert per `published_at` DESC in-memory, behält Top-20. Ablage: `documentation/docs/landesverbaende/_raw/<lv>-<source>.json`.
- **Bekannte Daten-Anomalien aus der ersten Welle**:
  - Berlin LV: 7 exakte Repost-Duplikate (gleicher Inhalt, andere URL) — die 20 enthalten effektiv 13 unique PMs. Künftige Extraktionen könnten zusätzlich auf `content_hash` deduplizieren.
  - Berlin LV `content`: enthält Site-Chrome (Navigation, Termine, Related PMs). Analyse berücksichtigt das, nicht in Zeichen-Statistik einbeziehen. Mittelfristig: Scraper-Cleanup.
  - **Thüringen-Fraktion** ist seit Sept. 2024 nicht mehr im Landtag. Korpus ist historisch (Jul–Sep 2024). Verwendung im aktiven Agent nur mit explizitem Hinweis.

## Die 6 Analyse-Dimensionen

Diese Checkliste ist **die "What did we need to know"-Liste** aus dem Plan. Sie ist sowohl Erhebungs-Vorgabe (Phase 2) als auch Quality-Gate für die finale Agent-Prompts (Phase 5).

### 1. STRUKTUR (Architektur einer typischen PM)

- [ ] **Headline-Muster**: durchschnittliche Länge in Zeichen; claim-style vs. neutral-deskriptiv; typische Trennzeichen (`:`, `–`, `//`, `,`); Position der Partei-/Sprecher\*innennennung im Titel; gibt es das Speaker-Doppelpunkt-Format (`Müller: Wir fordern …`)?
- [ ] **Dachzeile/Subhead**: vorhanden oder nicht? Wenn ja: Format/Konvention.
- [ ] **Lead-Absatz**: Welche W-Fragen werden im Lead beantwortet? Typische Lead-Formel (z.B. `Zu/Zur/Anlässlich <Anlass> erklärt <Name>, <Rolle>:`)? Länge in Sätzen/Zeichen?
- [ ] **Body-Reihenfolge**: Lead → wie viele Zitatblöcke → Übergangstext → Hintergrund → Aufruf?
- [ ] **Zitat-Architektur**: min/avg/max Anzahl Zitate pro PM. Platzierung (top/middle/bottom). Single-Block-Zitat vs. mehrere kürzere Zitate?
- [ ] **Hintergrund-Block**: explizit als eigener Abschnitt (`Hintergrund:`) oder in Lead/Zitat gefolded? Fußnoten/URLs?

### 2. ZITATGEBER\*INNEN

- [ ] **Wer wird zitiert** — vollständige Liste der wiederkehrenden Namen mit ihren EXAKTEN Rollen-Strings (verbatim aus Korpus: _„Spitzenkandidatin von Bündnis 90/Die Grünen MV zur Landtagswahl 2026 und Bundestagsabgeordnete"_).
- [ ] **Rollen-Strategie**: Wer spricht zu welchen Themen? Landesvorsitzende vs. Fachsprecher\*innen vs. Spitzenkandidatur — gibt es eine sichtbare Themen-Zuteilung (z.B. Berlin LV: Stahr/Ghirmai für Parteipolitik, Graf/Jarasch für Wahlkampf)?
- [ ] **Single- vs. Multi-Quote-Norm**: typisch ein Sprecher\*in pro PM oder häufig Paare? Bei Paaren: gemeinsames Statement oder zwei getrennte Blöcke?
- [ ] **Attributionsstil**: pre- oder post-Quote (`X erklärt:` vs. `…, so X`)? Verbenwahl (`erklärt`, `kommentiert`, `betont`, `fordert`)? Folge-Attributionen (`Schäfer weiter:`, `Bohm abschließend:`)?
- [ ] **Title-Rendering**: Genderstern in Rollenbezeichnungen? Akademische Titel? Volle Rolle bei jeder Nennung oder nur erstmals?
- [ ] **Antagonist\*innen**: Wer wird namentlich angegriffen? Mit welcher Häufigkeit? (Berlin: Wegner 24×, MV: Reiche als Dauer-Antagonistin, Thüringen: Brombeer-Regierung).

### 3. LÄNGE & UMFANG

- [ ] **Volltext pro PM**: avg / min / max Zeichen.
- [ ] **Absatzzahl**: avg.
- [ ] **Zitatlänge**: avg / min / max Zeichen pro Zitat.
- [ ] **Quote-to-narrative-Ratio**: Wie viel Prozent der PM ist Zitat-Text (in Berlin Fraktion 80–95 %, in Hamburg ca. 50 % bei mehr narrativem Lead)?

### 4. SPRACHE

- [ ] **Register**: formal-journalistisch / kämpferisch-aktivistisch / regierungstragend / nüchtern-faktisch / hybrid.
- [ ] **Signature-Phrasen** (5–10, verbatim aus Korpus): wiederkehrende Slogans, rhetorische Pointen, Schlüsselverben (`verstolpert`, `Hausaufgaben machen`, `Es ist genug Geld da. Es ist nur falsch verteilt.`).
- [ ] **Genderstern-Konsistenz**: vollständig durchgehend / sparsam / gemischt mit Doppelnennung (`Bürgerinnen und Bürger`)? Gilt auch in Rollenbezeichnungen?
- [ ] **Selbstbezeichnung**: „Grüne" / „Bündnisgrüne" / „BÜNDNIS 90/DIE GRÜNEN" / „GRÜNE" (Großschreibung) / regional eigenständig (Brandenburg: „Bündnisgrüne" 54× vs. „Grüne" 5×)?
- [ ] **LV-Vokabular**: Geographie (Städte, Bezirke, Quartiere), institutionelle Bezüge (Bürgerschaft/Landtag/Abgeordnetenhaus, Senat/Landesregierung/Staatskanzlei), thematische Anker (Lausitz-Strukturwandel, Ostsee, Kieze, Hafen).
- [ ] **Du-/Sie-Form**: PMs konsequent Sie/3. Person? Kommt Du-Anrede an Leser\*innen vor?

### 5. DISTINKTIVE MARKER (3–5 pro LV)

Was macht diese LV-PMs **einzigartig identifizierbar** gegenüber einer generischen Grüne-PM? Wichtig: diese Marker werden als nicht-verhandelbare Stilregeln in den agent-`systemRole` aufgenommen. Beispiele aus dem ersten Durchgang:

- **Berlin LV**: Lead-Formel mit Doppelpunkt + Monolith-Zitat; Wegner-Personalisierung; Zwei-Stimmen-Architektur (Landesvorsitz vs. Spitzenduo); Markenkern-/Kultur-/Club-Frame; Programmsatz-Anker.
- **Hamburg LV**: Rot-Grün-Koalitionsdoppel mit SPD-Paarzitat; Bürgerschafts-Anker am Lead-Ende; hanseatischer Weg; keine Senator\*innen im Zitatkanon.
- **MV LV**: Ostsee-Frame; Ost-Frame in Sozialpolitik; Erneuerbare als Wirtschaftsthema (nicht Klima); Reiche-Personalisierung; Kleine-LV-Direktheit.
- **Thüringen LV**: Außerparlamentarische Opposition gegen Brombeer-Regierung; „Vorreiter verspielt"-Narrativ; DDR-Bürgerrechts-Identität; Petition-as-Tool; konkrete Anti-Nazi-Strukturen.
- **Brandenburg LV**: „Bündnisgrüne" statt „Grüne"; Strukturwandel/Lausitz; außerparlamentarisch (kein MdL); SPD-BSW-Regierung als Antagonist; staatstragend-faktischer Ton.

### 6. PROMPT-DIRECTIVE-PARAGRAPH

Eine 4–6-Satz-Anweisung an die LLM, geschrieben im Imperativ (`Schreibe …`, `Verwende …`, `Vermeide …`), die alle Marker aus 1–5 in ausführbare Regeln übersetzt. Dieser Block wird wörtlich in den `systemRole` des LV-Agents lifted.

---

## Wann fallen welche Dimensionen weg?

- **Fraktions-Korpus eines aktuell ausgeschiedenen Verbands** (Brandenburg, Thüringen): Dimensionen 1–4 bleiben relevant als historische Stilreferenz, aber im aktiven Agent muss klar markiert werden, dass die Fraktion nicht mehr existiert. Marker 5 sollte „außerparlamentarisch" als Ergebnis hervorheben.
- **AT-LV** (Österreich): LV-Filter und Press-Source-Map sind anders (`gruene_at_documents`, `content_type='news'`). Dimensionen-Set ist identisch; Vokabular-Liste muss DACH-spezifisch sein (`Nationalrat`, `Bundesländer` statt „Bundesländer" o.ä.).

## Automation-Hooks

- **Server-Side LV-Pin**: Per-LV-Agents haben `defaultFilter.landesverband` in `system.ts`. `executeDirectSearch` (`apps/api/routes/chat/agents/directSearchExecutors.ts:111-185`) und der `pressemitteilung_examples`-Pfad in `searchNode.ts:1013-1046` ziehen diesen Filter automatisch in den Qdrant-`must`-Clause. **Die LLM muss niemals `landesverband=BE` als Tool-Argument setzen.**
- **Notebook→Agent**: Beim Öffnen eines LV-Notebooks setzt ein `useEffect` in `NotebookPage.tsx` den globalen `selectedAgentId` auf den LV-Agent (warm-up für nachfolgenden /chat-Besuch). Quelle: `defaultAgent`-Feld auf `NotebookConfigEntry` (`apps/web/src/features/notebook/config/notebooksConfig.ts`).
- **Slash-Skills**: `/presse-<lv>` und `/social-<lv>` sind dünne UX-Wrapper, die den LV-Agent vorwählen und einen Topic-Opener in den Composer einfügen.

## Was diese Methodik NICHT abdeckt

- **Visuelle PM-Layouts**: Schrift, Farb-Branding, Logo-Position — Pressestellen-CIs sind nicht im Qdrant-Korpus.
- **Off-the-record-Kommunikation**: Briefings, Hintergrund-Gespräche, „nicht zur Veröffentlichung"-Statements.
- **Themen-Roadmap**: das, _worüber_ eine LV in einer Saison kommuniziert, ist Strategie und nicht Stil. Korpus zeigt nur das Wie, nicht das Was.
- **Foto-/Bild-Konventionen**: Fotocredits werden in Berlin Fraktion erwähnt (`Foto: Vincent Villwock/Grüne Fraktion Berlin`), sind aber nicht systematisch im Korpus.

## Reproduktion / Aktualisierung

Wenn sich die PR-Voice eines LV ändert (Wechsel im Vorstand, neue Spitzenkandidatur, neue Regierungsrolle):

1. `npx tsx apps/api/scripts/extract-lv-pms.ts` neu ausführen — überschreibt `_raw/<lv>-*.json`.
2. Für den betroffenen LV: einen General-Purpose-Subagent mit dem Template aus dieser Methodik gegen das neue JSON laufen lassen.
3. Das Section-6-Directive-Paragraph in den `systemRole` des LV-Agents in `packages/shared/src/agents/system.ts` einsetzen.
4. Bei strukturellen Stilwechseln (z.B. neuer LV im Landtag): auch `defaultFilter` (LV vs. LV+Fraktion) und `openingQuestions` anpassen.
