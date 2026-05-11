# Berlin — Landesverband

**Corpus**: 20 PMs as of 2026-05-11, source `berlin-lv-presse` (13 unique titles after dedupe; duplicates are exact reposts).

## 1. Structure

- **Headline pattern**: Two-part headlines dominate. The first half is a short topical/issue tag (often a single noun or compound: `Tourismuskrise`, `1. Mai`, `AGH-Wahl 2026`, `EXPO-Absage von Wegner`, `CSD-Auftakt in Sachsen-Anhalt`), followed by a **colon** and a claim-style second half (`Kai Wegner macht Berlin grauer, langweiliger und uncooler`; `Jobsicherheit vor Profitgier`; `Wer regiert Berlin?`). Headlines are claim-style with explicit attack framing roughly half the time; the other half are descriptive/issue headlines. Average ~46 chars without the lead carried over. The party name is almost never in the headline itself (exceptions: `Berliner Grüne zu …`, `Grüne kritisieren …`). Punctuation: colon (very frequent), em dash/„geradezitat" quotes, occasional question mark for rhetorical attack (`Wer regiert Berlin?`).
- **Subhead/dachzeile**: No separate dachzeile. The site instead labels each PM with a category slogan (`Solides Fundament, funktionierendes Berlin.` / `Buntes Berlin, vielfältige Stadt.` / `Starke Bildung, Zukunft schaffen.` / `Gerechte Stadt, faires Zuhause.` / `Grüne Stadt. Für alle.`).
- **Lead paragraph**: Highly formulaic anchor sentence introducing the occasion + naming the speaker(s) + role(s), almost always ending in a colon that opens the direct quote. Templates: `Zu [Anlass] erklärt/erklären [Name], [Rolle]:` (`Zur Unterschriftensammlung der beiden Volksinitiativen … erklären Nina Stahr und Philmon Ghirmai, Landesvorsitzende von Bündnis 90/Die Grünen Berlin:`); `Zu [Anlass] kommentiert [Name], [Rolle]:`; `Statement von [Name], [Rolle], zu [Anlass]:`. Lead is short (1 sentence, ~150-250 chars), W-questions reduced to _wer_ + _wozu/zu welchem Anlass_ — _wann/wo_ often implicit.
- **Body section order**: (1) one-sentence Anlass/lead with attribution → (2) one long, monolithic direct quote covering analysis + attack + own position (the body of most PMs IS the quote) → (3) occasional closing sentence outside the quote that adds a call-to-action or contextualises (`Bündnis 90/Die Grünen Berlin rufen dazu auf, an den Kundgebungen der DGB-Gewerkschaften "Erst unsere Jobs, dann eure Profite" teilzunehmen.`).
- **Quote count per PM**: min 0 (3 PMs are pure reportage without a direct quote, e.g. `AGH-Wahl 2026`, `Berliner Grüne zu neuen Zahlen … Hierzu kommentiert …` is structured as one giant quote — counted as 1), avg ~1, max 3 (multi-voice PMs like CSD-Auftakt and `Wir haben es satt!` carry 2-3 quotes from different speakers). The dominant pattern is **one single, long block quote** that runs 1000-3000 chars and carries the entire argument.
- **Background block**: Rarely a discrete background block. Context is usually fused into the lead sentence (`Heute hat die Beratungsstelle … ReachOut, ihre Zahlen … vorgestellt.`) or the opening of the quote. When present at the end, signature phrasing is `Bündnis 90/Die Grünen Berlin rufen dazu auf, …`, `Die Grüne Gewerkschaftsrunde ist Teil des kontinuierlichen Dialogs …`, or `Die Grünen werden auch in diesem Jahr landesweit … präsent sein`.

## 2. Citations & speakers

Recurring named individuals + roles (verbatim from corpus):

- **Werner Graf** — `Spitzenkandidat von BÜNDNIS 90/DIE GRÜNEN Berlin` / `Kandidat für das Amt des Regierenden Bürgermeisters` / `Bürgermeisterkandidat von BÜNDNIS 90/DIE GRÜNEN Berlin` / `Spitzen- und Bürgermeisterkandidat`
- **Bettina Jarasch** — `Co-Spitzenkandidatin von Bündnis 90/Die Grünen Berlin` / `Spitzenkandidatin`
- **Nina Stahr** — `Landesvorsitzende Bündnis 90/Die Grünen Berlin` (often paired with Ghirmai as `Landesvorsitzende von Bündnis 90/Die Grünen Berlin`)
- **Philmon Ghirmai** — `Landesvorsitzender Bündnis 90/Die Grünen Berlin`
- **Susan Sziborra-Seidlitz** — `Spitzenkandidatin von BÜNDNIS 90/DIE GRÜNEN Sachsen-Anhalt` (cross-LV pairing)

The duo Nina Stahr + Philmon Ghirmai speaks for the Landesverband on parteipolitischen Anlässen; Werner Graf + Bettina Jarasch speak for the Spitzenkandidatur and on policy attacks. Target/opponent name: **Kai Wegner** (Regierender Bürgermeister) — named repeatedly as the personalised antagonist (6 mentions).

- **Single vs. multi-quote norm**: Single long quote is the default (≈70% of PMs). Multi-quote PMs occur when (a) two cross-LV figures appear (CSD-Auftakt), or (b) a campaign occasion calls for both Spitzenkandidat\*innen (`Werner Graf und Bettina Jarasch … erklären dazu:` — joint quote, not separate).
- **Attribution style**: Attribution-first is overwhelmingly dominant, with the colon opening the quote on a new clause. Verbs: `erklärt/erklären` (most frequent), `kommentiert`, `Hierzu kommentiert …`, `Dazu erklärt …`, `… ergänzt`. Direct quotes use German typographic quotes `„…"` or `"…"` inconsistently (both appear). Indirect speech is rare; nearly everything is direct.
- **Title/role rendering**: Roles are formal-titled and follow the name with a comma (`Werner Graf, Bürgermeisterkandidat von BÜNDNIS 90/DIE GRÜNEN Berlin`). Party name appears as `Bündnis 90/Die Grünen Berlin` in mixed case in PM bodies and **BÜNDNIS 90/DIE GRÜNEN** in all-caps when used inside roles in higher-key PMs (CSD-Auftakt). Genderstern in titles: yes consistently (`Verfassungsrechtler*innen Frauke Brosius-Gersdorf und Hubertus Gersdorf`, `Spitzenkandidat*innen`, `Fachpolitiker*innen`). Address register is formal/journalistic — no Du-form in PM text.

## 3. Length

- **Avg. character count of full PM (body, after stripping site chrome)**: ~1,556 chars
- **Min / max body**: 325 / 3,665 chars (the 325 outlier is `AGH-Wahl 2026` which was returned as a partial scrape; the next shortest is ~1,000)
- **Avg. paragraph count**: ~1.5 — most PMs are effectively 1-2 paragraphs (the long quote runs as one unbroken block; an optional outer framing sentence forms the second).
- **Avg. quote length**: ~1,100 chars (the quote IS most of the PM). Range: ~250 chars (Sziborra-Seidlitz add-on) to ~2,400 chars (Ghirmai on ReachOut numbers, Graf+Jarasch on `Wir haben es satt!`).

## 4. Language

- **Register**: Formal-journalistic baseline (`Zu den Plänen … kommentiert …, Landesvorsitzende …:`) with a strong **campaigning/attack overlay**: pointed personal attacks on Kai Wegner, schlagworthafte Schluss-Sätze (`Schwarz-Rot macht Berlin grauer, langweiliger und uncooler.`; `Wegner schlingert wie ein Auto, das ins Schleudern geraten ist`). Activist register surfaces in solidarity/movement PMs (`Vielfalt ist keine Verhandlungsmasse.`). Mixed but tilted toward Wahlkampf-Modus, consistent with the laufenden AGH-Wahlkampf 2026.
- **Recurring signature phrases & vocabulary (verbatim)**:
  - `lebenswerte Kieze` / `lebenswert` (Verkehr/Stadt-PMs)
  - `Schwarz-Rot` / `schwarz-rote Regierung` / `Dauerchaos, Planlosigkeit und Stillstand der schwarz-roten Regierung`
  - `Politik ändern, Berlin bleiben.` (Wahlprogramm-Slogan, taucht in mehreren PMs als Anker auf)
  - `sozial gerecht in die Zukunft führen` / `sozial gerechte und klimaneutrale Zukunft Berlins`
  - `gerechtere Verteilung des öffentlichen Raums`
  - `Gute Arbeit, faire Löhne und soziale Sicherheit`
  - `Wir setzen uns weiter für … ein` (Programmsatz-Formel)
  - `Demokratie lebt von Beteiligung`
  - `Klar ist für mich:` / `Klar ist:` (rhetorische Zuspitzung in Zitaten)
  - `Markenkern dieser Stadt` / `Strahlkraft` (Kultur-/Tourismus-Framing)
  - `politisches Versagen mit Ansage`
  - `Vielfalt ist keine Verhandlungsmasse`
- **Genderstern usage**: **Yes, durchgängig konsistent**. 15+ Vorkommen über das Corpus, u.a. `Berliner*innen` (3x), `Tourist*innen` (2x), `Verfassungsrechtler*innen`, `Vertreter*innen`, `Fachpolitiker*innen`, `Akteur*innen`, `Verantwortungsträger*innen`, `Multiplikator*innen`, `Spitzenkandidat*innen`, `Verbraucher*innen`, `Erzeuger*innen`. Keine Auslassung beobachtet.
- **Berlin-specific vocabulary**: `Abgeordnetenhaus` / `AGH-Wahl 2026` (4 Treffer), `Senat` / `Regierender Bürgermeister` / `Sportverwaltung` / `Finanzsenator`, `Kiez` / `lebenswerte Kieze`, `BVG` (`BVG-Krise`, `BVG und Vivantes`), `Bezirke`, `Volksinitiativen` (`Berlin autofrei`, `Berlin werbefrei`), Landmarken-Clubs als Symbole (`Watergate`, `SchwuZ`), `Verfassungsgerichtshof`, dialektaler Slogan-Einschlag (`Damit uns keener wat kann` als Beschluss-Titel). Personalisierung: `Kai Wegner`, `Wegner` als feststehender Attack-Hook.
- **Du- vs. Sie-form**: Sie-Form / unpersönlich. PMs sprechen weder Leser\*innen direkt an noch verwenden sie Du. Direkte Anreden treten nur als Aufruf in der dritten Person auf (`Wir rufen … die Beschäftigten dazu auf, …`).

## 5. Distinctive markers

Five patterns that make Berlin-LV PMs uniquely identifiable vs. einer generischen Grüne-PM (für den systemRole-Block des Agents):

1. **Lead-Formel mit Doppelpunkt + Monolith-Zitat**: Fast jede PM besteht aus einem 1-Satz-Lead nach Schema `Zu [Anlass] erklärt/kommentiert [Name], [Rolle], Bündnis 90/Die Grünen Berlin:` und einem einzigen, mehrere Absätze langen Direktzitat. Beispiel: _„Zur Unterschriftensammlung der beiden Volksinitiativen … erklären Nina Stahr und Philmon Ghirmai, Landesvorsitzende von Bündnis 90/Die Grünen Berlin: „Demokratie lebt von Beteiligung, …""_. Keine getrennten Hintergrund-/Fazitblöcke außerhalb des Zitats.
2. **Personalisierte Wegner-/Schwarz-Rot-Attacke als wiederkehrender Aufhänger**: Berliner PMs adressieren `Kai Wegner` und `Schwarz-Rot` namentlich und scharf — oft mit bildhaften Vergleichen (_„Wegner schlingert wie ein Auto, das ins Schleudern geraten ist"_; _„Schwarz-Rot macht Berlin grauer, langweiliger und uncooler."_). Generischere Grüne-PMs benennen Regierungen seltener so personalisiert.
3. **Zwei-Stimmen-Architektur: Landesvorsitz vs. Spitzenkandidatur**: Themen-Sortierung ist sichtbar: Nina Stahr / Philmon Ghirmai sprechen für die Partei (Antirassismus, Volksinitiativen, Gewerkschaften); Werner Graf + Bettina Jarasch sprechen als Spitzenduo für Wahlkampf-Themen (Tourismus, EXPO, 1. Mai, Wahlprogramm). Rollenkürzel: `Co-Spitzenkandidatin` für Jarasch ist Markenzeichen.
4. **Berlin-Markenkern-Frame (Kultur, Clubs, Kieze, Strahlkraft)**: Ein wiederkehrender Argumentationsrahmen verteidigt Berlin als kulturell-internationalen Sehnsuchtsort. Vokabular: _„Markenkern dieser Stadt"_, _„Strahlkraft"_, _„kreative Freiheit"_, namentliche Nennung konkreter Clubs (_„Wenn Clubs wie das Watergate oder das SchwuZ schließen, ist das ein internationales Signal"_). Auch in Verkehrs-PMs: _„lebenswerte Kieze"_, _„gerechtere Verteilung des öffentlichen Raums"_.
5. **Programmsatz-Anker und Wahlkampf-Slogans**: PMs schließen oder pointieren Zitate fast immer mit einem festen Bekenntnis-Satz: _„Wir setzen uns weiter für sichere Fuß- und Radwege, einen starken öffentlichen Nahverkehr und lebenswerte Kieze ein."_ / _„Wir wollen die Politik in dieser Stadt ändern, damit Berlin Berlin bleibt."_. Der Slogan `Politik ändern, Berlin bleiben.` taucht ankerhaft mehrfach auf.

Zusätzliche Beobachtung (über Template hinaus):

- **Konsequente Genderstern-Inflation auch in formellen Rollenbezeichnungen** (`Verfassungsrechtler*innen Frauke Brosius-Gersdorf und Hubertus Gersdorf`) — sogar in attribuierten Rollen, nicht nur in Pluralen über Bürger\*innen.
- **Site-Kategorisierung mit poetischen Slogans** statt klassischen Sachressorts (`Buntes Berlin, vielfältige Stadt.` etc.) — wirkt PR-seitig wie eine Dachzeile auch wenn die PM selbst keine hat.

## 6. Notes for prompt engineering

Schreibe die Pressemitteilung im Stil des Landesverbands Berlin von Bündnis 90/Die Grünen: Beginne mit **einem einzigen Lead-Satz** im Schema `Zu [Anlass] erklärt/kommentiert/erklären [Name], [Rolle] [von] Bündnis 90/Die Grünen Berlin:` und lasse darauf **ein einziges, langes Direktzitat** folgen, das Analyse, Angriff und eigene Position in einem Block trägt — keine getrennten Hintergrund- oder Fazitabschnitte außerhalb des Zitats. Verwende konsequent Genderstern (`Berliner*innen`, `Tourist*innen`, `Spitzenkandidat*innen`, auch in Rollenbezeichnungen) und Sie-/unpersönliche Form, niemals Du. Adressiere die schwarz-rote Landesregierung und insbesondere **Kai Wegner** personalisiert und pointiert, gerne mit bildhaften Vergleichen oder Schlagsatz-Pointen am Zitatende (`Schwarz-Rot macht Berlin grauer, langweiliger und uncooler.`). Nutze Berlin-Vokabular (`Abgeordnetenhaus`, `Senat`, `Kieze`, `BVG`, `Bezirke`, konkrete Orte/Clubs wie `Watergate`, `SchwuZ`), wiederkehrende Programmsatz-Formeln (`Wir setzen uns weiter für … ein`, `Wir wollen die Politik in dieser Stadt ändern, damit Berlin Berlin bleibt.`) und das Markenkern-Frame (Kultur, Strahlkraft, lebenswerte Kieze). Wähle die Sprecher\*innen rollengerecht: **Nina Stahr** und **Philmon Ghirmai** (Landesvorsitzende) für parteipolitische und zivilgesellschaftliche Anlässe, **Werner Graf** (Spitzen- und Bürgermeisterkandidat) und **Bettina Jarasch** (Co-Spitzenkandidatin) für Wahlkampf- und Regierungskritik-Themen; vermeide es, beide Paare zu mischen. Halte den Gesamttext auf 1.000-3.000 Zeichen, ein bis maximal drei Zitate, und schließe optional mit einem kurzen Aufruf-Satz außerhalb des Zitats (`Bündnis 90/Die Grünen Berlin rufen dazu auf, …`).
