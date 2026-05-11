# Berlin — Fraktion (Abgeordnetenhaus)

**Corpus**: 20 PMs as of 2026-05-11, source `berlin-fraktion-presse` (`https://gruene-fraktion.berlin/pressemitteilungen/`)

## 1. Structure

- **Headline pattern**: Median length ~67 chars (range 31–98). Two dominant shapes:
  - **Topic-prefix + colon/dash**: `NOlympia: Berlin braucht funktionierende Sportanlagen statt Prunk und Protz`, `Rücktritt Wedl-Wilson: Kai Wegner wird der Verantwortung eines Regierenden nicht gerecht`, `CDU-Fördermittelaffäre „evident rechtswidrig" – Der Regierende muss jetzt Verantwortung übernehmen`. Both `:` and `–` are used; the colon dominates.
  - **Pure claim/attack headline**: `Kai Wegner verstolpert die Verwaltungsreform`, `Berlin geht das Wasser aus und der Senat schaut zu`, `Wann handelt Wegner? Stettner und Goiny nicht mehr tragbar!`. Roughly half of the corpus is purely claim-driven; neutral procedural framings (`Grüne und Linke beantragen Aktuelle Stunde …`) are the minority.
  - "Grüne" / "Fraktion" rarely appears in the headline itself — the party is the implicit speaker; named opponents (Wegner, Senat, CDU, schwarz-rot) appear far more often than the own brand.
- **Subhead/Dachzeile**: Not used. The CMS produces no separate Dachzeile/Untertitel; the body opens directly with a photo credit line.
- **Lead paragraph**: Every PM opens with a single boilerplate sentence after the photo credit, structured as either:
  - `Zu [Anlass] erklärt [Name], [Rolle]:` (most common, ~14/20), or
  - `Zur [Vorgang/Recherche/Bericht] erklär(t/en) …:` / `Dazu erklärt …:`
  - The lead answers Wann/Was/Wer in 1 sentence (typically 100–220 chars) and immediately yields to the quote. The W-questions are condensed into the trigger event (`Zur heutigen Vorstellung der Zahlen antiziganistischer Vorfälle …`, `Zur Bitte der Kultursenatorin Sarah Wedl-Wilson um Entlassung …`).
- **Body section order**: (1) Photocredit line `Foto: Vincent Villwock/Grüne Fraktion Berlin` (or Alisa Raudszus, C. Honnens) → (2) one-sentence Anlass-Lead with name+role → (3) one long single block quote opened with „ and closed with " → (4) date stamp `Veröffentlicht am DD.MM.YYYY`. There is no separate "Hintergrund", no contact block, no boilerplate "Über die Fraktion".
- **Quote count per PM**: min 1 / avg 1.1 / max 2 (n=20, 21 quotes total). 19/20 PMs are single-quote; only the Margot-Friedländer and Antiziganismus PMs use two speakers. The quote is always placed immediately after the lead and runs to the end of the PM.
- **Background block**: Absent as a separate section. Context is woven into the lead sentence (e.g. `Mit fünf Monaten Verspätung hat der Senat heute eine Zuständigkeitsverordnung verabschiedet, in der viele Zuständigkeiten nach wie vor ungeklärt sind. Dazu erklärt …`). The only recurring suffix is `Veröffentlicht am DD.MM.YYYY`; occasionally `Hier finden Sie den Antrag als PDF.` is inserted before that. No formal signature/contact block.

## 2. Citations & speakers

Named individuals appearing as quoted speakers in the corpus:

- **Werner Graf**, Fraktionsvorsitzender — 9 PMs (dominant voice; speaks on Wegner/CDU-Affäre, Verwaltungsreform, Koalitionsklausur, Energiebonus)
- **Bettina Jarasch**, Fraktionsvorsitzende — 1 PM (co-quoted with Graf, Margot Friedländer)
- **Klara Schedlich**, sportpolitische Sprecherin — 2 PMs (NOlympia, NRW-Olympiabewerbung)
- **Antje Kapek**, verkehrspolitische Sprecherin — 1 PM (BVG-Sicherheitsbilanz)
- **Benedikt Lux**, umweltpolitischer Sprecher — 1 PM (Wasserknappheit)
- **Gollaleh Ahmadi**, Sprecherin für Sicherheitspolitik — 1 PM (digitale Gewalt)
- **Sebastian Walter**, Sprecher für Diversitätspolitik — 1 PM (LADG, co-quoted)
- **Tuba Bozkurt**, Sprecherin für Antidiskriminierung — 1 PM (LADG, co-quoted)
- **Susanna Kahlefeld**, Sprecherin für Beteiligung — 1 PM (antiziganistische Vorfälle)

- **Single- vs. multi-quote norm**: Single-quote is the rule (19/20). The two co-quoted PMs share _one_ merged statement block — both names are introduced in the lead (`erklären X, Sprecher für Y, und Z, Sprecherin für Q:`) and a single „…" follows.
- **Attribution style**: Always upfront in the lead, never trailing (`sagte X` after the quote does not occur). Pattern: `… erklärt [Vorname Nachname], [Rolle]:`. For procedural news without a speaker (Aktuelle-Stunde-Anträge), no individual is named; the actor is `Die Abgeordnetenhausfraktionen von Bündnis 90/Die Grünen und Die Linke`.
- **Title/role rendering**: Parliamentary roles are spelled out: `Fraktionsvorsitzender` / `Fraktionsvorsitzende`, `Sprecher für X` / `Sprecherin für X` (gendered, never `*in` in role labels). Policy areas use adjective form (`sportpolitische Sprecherin`, `verkehrspolitische Sprecherin`, `umweltpolitischer Sprecher`) or `für`-form (`Sprecher für Diversitätspolitik`). No academic titles, no MdA, no Bezirk references.

## 3. Length

- **Full-PM character count**: min 384 / avg 1,238 / max 2,273. The 384-char outlier is the procedural Aktuelle-Stunde-Antrag (no quote, just the title/headline announcement).
- **Paragraph count**: The HTML source delivers everything as one running block in `content` (no `\n\n` separators); structurally a PM is 3 logical sections — credit line, lead sentence, single block quote. Counting sentence-boundaries inside the quote, the body averages ~9 sentences.
- **Quote length**: min 18 / avg ~860 / max 1,974 characters. The single quote routinely carries 80–95 % of the total PM body — the speaker statement _is_ the PM.

## 4. Language

- **Register**: Sharp, adversarial, parliamentary. Personalisiert (`Kai Wegner` by full name, then `Wegner` shorthand), urteilend (`evident rechtswidrig`, `nicht mehr tragbar`, `schlichtweg zu kurz`, `billiges Ablenkungsmanöver`, `Prunk und Protz`). Strong verbs of failure (`verstolpert`, `verspielt`, `verkennt`, `versagt`). Polished but combative; not academic.
- **Recurring signature phrases (verbatim)**:
  - `Kai Wegner verstolpert …` / `verstolperte Entscheidung` (2×)
  - `Die Zeit dieses Bürgermeisters ist vorbei.`
  - `… wird der Verantwortung eines Regierenden nicht gerecht`
  - `schlichtweg zu kurz`
  - `Wir fordern …` (4× — `Wir fordern die Senatsverwaltungen …`, `Wir fordern weiterhin eine ausreichende Ausstattung …`)
  - `Für uns ist klar: Berlin braucht …`
  - `… eine dauerhaft finanzierte, zentrale und niedrigschwellige …`
  - `Schwarz-Rot hat es nicht geschafft, …`
  - `Es fehlt an Zusammenhalt, Kraft und dem Willen, … zum Wohle der Stadt …`
  - `Veröffentlicht am DD.MM.YYYY` (closing line, 20/20)
- **Genderstern usage**: Sparing but present — only 4 hits across the corpus (`Berliner*innen` 2×, `Aktivist*innen`, `Ärzt*innen`). Role titles for the speakers themselves are _not_ sterned (always `Sprecherin` / `Sprecher`, `Fraktionsvorsitzende` / `Fraktionsvorsitzender`). Genderstern surfaces in references to affected groups, not to office-holders.
- **Parliamentary / Berlin vocabulary** (count in corpus): `Senat` 30, `Fraktion` 36, `Wegner` 24, `Sprecher(in)` 10, `Abgeordnetenhaus` 6, `Antrag` 3, `Plenarsitzung` 2, `Aktuelle Stunde` 2, `Regierender (Bürgermeister)` 2, `schwarz-rot(e/n)` 2. Also routine: `Senatsverwaltung(en)`, `Koalitionsklausur`, `Zuständigkeitsverordnung`, `Verwaltungsreform`, `Rechnungshof`, `Beratungsbericht`, `Staatssekretär`, `Kultursenatorin`, `Tagesordnung`, `Wahlperiode`, `Novellierung`. `Anfrage` (Kleine/Schriftliche) does not appear in this 20-PM window.
- **Du- vs. Sie-form**: Sie-Form / 3. Person — the genre is press, not direct address. The one direct-address moment is a rhetorical apostrophe at Wegner: `… und kümmern Sie sich um die Probleme dieser Stadt.` No `du`.

## 5. Distinctive markers (Fraktion vs. Landesverband)

1. **Triggered by a parliamentary or executive event, never campaign rhetoric.** Almost every lead names a concrete Senatsentscheidung, Rechnungshofbericht, Tagesspiegel-Recherche, Plenarsitzung or Antrag as the Anlass (`Zur Bitte der Kultursenatorin Sarah Wedl-Wilson um Entlassung …`, `Zur Sicherheitsbilanz der BVG für das Jahr 2025 …`, `Zum Bericht der LADG-Ombudsstelle …`). LV-PMs typically open from a party position; Fraktion-PMs react to an institutional event.
2. **Persona-driven attack on the Regierender Bürgermeister.** `Kai Wegner` appears 24 times in 20 PMs; `verstolpert` is a reusable in-house verb for Wegner. Headlines like `Wann handelt Wegner? Stettner und Goiny nicht mehr tragbar!` and `Die Zeit dieses Bürgermeisters ist vorbei.` are not LV register.
3. **Procedural toolkit explicit.** `Aktuelle Stunde`, `Antrag`, `Zuständigkeitsverordnung`, `Tagesordnung`, `Rechnungshof`, `Plenarsitzung`, `Wahlperiode`, `Novellierung` — used as nouns of action, not glossed: `… eine Aktuelle Stunde zu den Kürzungen im Gesundheitssystem beantragt`, `In der kommenden Wahlperiode werden wir daher eine Novellierung des LADG anstoßen.`
4. **Cross-fraction cooperation flagged by name.** Joint moves with Die Linke are named explicitly: `Die Abgeordnetenhausfraktionen von Bündnis 90/Die Grünen und Die Linke haben für die Plenarsitzung am Donnerstag, 7. Mai 2026, eine Aktuelle Stunde … beantragt.` That kind of inter-fraction procedural framing is a Fraktion marker.
5. **"Schwarz-Rot" / "schwarz-rote Koalition" as the standing antagonist** rather than CDU or SPD individually: `Zum schwarz-roten Olympia-Konzept des Senats …`, `Schwarz-Rot hat es nicht geschafft, diese Lücken zu schließen.`

## 6. Notes for prompt engineering

Schreibe als Pressestelle der **Grünen Fraktion im Berliner Abgeordnetenhaus**: knapp, scharf, parlamentarisch. Jede PM hat eine feste Form: ein-Satz-Anlass mit dem konkreten Auslöser (Senatsbeschluss, Bericht, Recherche, Plenarsitzung, Rücktritt), gefolgt von `… erklärt [Vorname Nachname], [Rolle]:` (`Fraktionsvorsitzende*r` oder `Sprecher*in für [Politikfeld]`, ohne Genderstern in der Rollenbezeichnung), und danach **ein einziger, langer Block-Zitatkörper** in deutschen Anführungszeichen `„ … "`, der 80–95 % des Textes trägt. Keine Zwischenüberschriften, kein Hintergrundblock, kein Kontakt — nur abschließend `Veröffentlicht am DD.MM.YYYY`. Sprich personalisiert über Kai Wegner und die `schwarz-rote` Koalition, verwende Fraktions-Vokabular (`Senat`, `Senatsverwaltung`, `Aktuelle Stunde`, `Antrag`, `Zuständigkeitsverordnung`, `Wahlperiode`, `Rechnungshof`, `Regierender Bürgermeister`), nimm Stilfiguren wie `verstolpert`, `schlichtweg zu kurz`, `Für uns ist klar: Berlin braucht …`, `Wir fordern …`. Genderstern nur bei Betroffenengruppen (`Berliner*innen`, `Aktivist*innen`), nicht bei Amtsbezeichnungen. Halte die Gesamtlänge zwischen 800 und 2.300 Zeichen; bei reinen Verfahrensankündigungen (Aktuelle Stunde gemeinsam mit Die Linke) reicht ein zitatloser Vier-Sätze-Block.
