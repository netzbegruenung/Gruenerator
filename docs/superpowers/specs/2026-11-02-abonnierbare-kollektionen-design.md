# Abonnierbare Kollektionen + Mustergrün-Wahlkampfpaket

Stand: 02.11.2026

## Worum es geht und warum

Landesverbände sollen ihren Mitgliedern künftig ein komplettes Paket geben können: Grüneratoren, Sticker, Hintergründe, Sharepic- und Story-Vorlagen, Visitenkarten und Profilbild-Rahmen. Das Paket ist eine **Kollektion**. Mit **einem Klick** abonniert eine Person die ganze Kollektion. Danach liegt alles in ihren eigenen Listen. Ändert oder ergänzt der Landesverband etwas, kommt die Änderung **automatisch** bei allen Abonnent*innen an. Nach dem Abonnieren wird die Kollektionsseite zur **Startrampe**: Ihre Kacheln führen direkt ins passende Werkzeug, vorbelegt mit dem jeweiligen Element. „Profilbild gestalten“ steht an erster Stelle, weil das erfahrungsgemäß der erste Schritt ist.

Als Schaufenster bauen wir die bisherige unsichtbare Beispielkollektion „Wahlkampf für Moritz“ zu **„Landesverband Mustergrün – Wahlkampf mit Maxi Mustermensch“** um. Sie ist öffentlich im Marktplatz, das Paket ist voll bestückt, und die Gestaltung orientiert sich eng an den bestehenden Kollektionen.

## Ziele

1. Eine Kollektion lässt sich abonnieren. Der Knopf heißt **„Abonnieren“**, danach **„Abonniert ✓“**, darunter steht „Neues vom Landesverband kommt automatisch dazu“. Abbestellen ist jederzeit möglich.
2. Die Elemente abonnierter Kollektionen erscheinen in den Listen, in denen die Person sie sucht:
   - Agents und Rezepte unter „Meine Grüneratoren“ (`/grueneratoren`)
   - Sticker und Hintergründe in Mediathek und Sticker-Ansicht
   - Vorlagen unter „Meine/Gemerkte“ Vorlagen
   - der Profilbild-Rahmen im Profilbild-Werkzeug
3. Die Elemente sind live und werden nicht kopiert. Die Listen lesen „eigene Zeilen ∪ Elemente der abonnierten Kollektionen“, berechnet zur Lesezeit.
4. Nach dem Abonnieren zeigt die Kollektionsseite eine Startrampe mit Deep Links:
   - Profilbild (Rahmen vorgewählt)
   - Sharepic- und Story-Vorlage (öffnet die Instanziierung)
   - Visitenkarte (Druckvorlage im Canvas-Editor)
   - Sticker und Hintergrund (Profilbild bzw. Editor)
   - Agent (Chat mit dem Agent)
5. Die Mustergrün-Kollektion ist öffentlich gelistet (`audience: 'de-DE'`) und enthält:
   - 3 Profilbild-Rahmen
   - 6–8 Sticker
   - 4–5 Hintergründe
   - 4–6 Sharepic- und Story-Vorlagen
   - 1–2 Visitenkarten
   - einen neuen Kandidatinnen-Agent „Maxi Mustermensch“
   - Cover und Story-Texte

## Nicht-Ziele (jetzt)

- **Landesverbände legen Kollektionen nicht selbst in der App an.** Das ist das Folgeprojekt. Bis dahin pflegen wir die Kollektionen im Code (`MARKETPLACE_COLLECTIONS`), im Auftrag der Landesverbände.
- Kein Besitzer- oder Herausgeber-Feld an Studio-Assets und Vorlagen. Das braucht erst das Folgeprojekt.
- Keine Kollektionen in der Mobile-App. Mobile rendert Kollektionen heute generell nicht. Der Server muss aber ein Abo so liefern, dass Mobile es später lesen kann.
- Keine Benachrichtigung („Neu in deiner Kollektion“).
- Weitere Druckvorlagen außer der Visitenkarte, also kein Plakat und kein Flyer.

## Anti-Ziele

- **Kopien statt Abo.** Sie würden das „automatisch aktuell“ brechen und die Listen der Leute mit Altständen fluten.
- **Ein zweites Parallelsystem neben den Kollektionen.** Wir erweitern die bestehenden Kollektionen (`docs/CLAUDE-collections.md`) und die bestehenden Leser.
- Abonnierte Elemente sind von eigenen nicht zu unterscheiden, und man kann sie scheinbar löschen, obwohl sie beim nächsten Laden wiederkommen. Abonnierte Elemente brauchen eine Herkunftsmarke („aus Mustergrün“). Entfernen heißt bei ihnen: die Kollektion abbestellen.
- Parteiinterne Inhalte im öffentlichen Repo, siehe Randbedingungen.

## Randbedingungen

- **F0**:
  - Die Kollektions-Id steht in geteilten Links (`?kollektion=`). `wahlkampf-moritz` bleibt lesbar und leitet auf die neue Id weiter. Die neue Id kommt additiv ins `marketplaceCollectionIdSchema`.
  - Die neue Abo-Tabelle und alle neuen Contract-Felder sind F0, sobald sie ausgeliefert sind.
- **Parteiinhalte liegen im privaten Repo `gruenerator-intern`**:
  - Sharepic-Vorlagen: „Die Vorlagen sind Parteiinhalt und liegen im privaten Repo, nie hier“ (`docs/CLAUDE-collections.md`).
  - der Persona-Text des Agents (`agents/<identifier>.md`, wie bei den LV-Agents)
  - Im öffentlichen Repo stehen nur Frontmatter, Registry-Einträge und Bilder. Das gilt auch für die fiktive Kollektion, damit das Muster für echte Landesverbände stimmt. `pnpm check:internal` muss grün bleiben.
- **Erfundene Zitate** sind nur in nicht gelisteten Kollektionen erlaubt. Mustergrün wird gelistet, also kein `quote`-Block mit erfundener Stimme.
- **Papierkorb**: Die neue Tabelle bekommt einen Eintrag im Wächter `trashReaders.vitest.ts` (bzw. eine Begründung, warum ein Abo hart gelöscht wird). Bei einer Kontolöschung räumt die FK-Kaskade auf `profiles` sie ab.
- **Locale**: Kollektion und Agent tragen `audience: 'de-DE'`. Mustergrün ist ein deutscher Landesverband. Das war meine Entscheidung.
- **Bilder**: `/images/**` sind unveränderlich gecacht. Neue Bilder bekommen einen neuen Stem, und vorhandene werden nie überschrieben.
- **a11y**: Sharepic-Vorlagen und Kollektionsseite erfüllen den Kontrast nach WCAG AA. Der Abo-Knopf hat einen zugänglichen Zustand (`aria-pressed` bzw. ein eindeutiges Label).

## Entscheidungen der Person

- Die Elemente werden automatisch aktualisiert, also ein Abo, keine Kopie.
- Der Knopf heißt „Abonnieren“.
- Version 1 pflegen wir im Code, Selbst-Anlegen ist ein Follow-up.
- „Wahlkampf für Moritz“ wird zu Mustergrün umgebaut, öffentlich im Marktplatz.
- Inhalt des Pakets: Profilbild-Rahmen, Sticker und Hintergründe, Sharepic- und Story-Vorlagen, als Druck nur Visitenkarten.
- Grüneratoren: ein **neuer** Kandidatinnen-Agent „Maxi Mustermensch“.
- Die Gestaltung entwirft ein Sonnet-Design-Agent: fertige Assets plus HTML-Mockup zum Review. Der Entwurf liegt außerhalb des Repos und wird erst nach Freigabe übernommen.
- **Abonnierte Elemente stehen in einem eigenen Abschnitt** in Mediathek, Sticker-Ansicht und Vorlagen, also eine Reihe je abonnierter Kollektion (z. B. „Aus Mustergrün“) oben. Darunter folgen die eigenen Elemente unverändert. Abo-Elemente werden nicht in die paginierten Listen gemischt.

## Entscheidungen des Assistenten (nach dem Builder-Check, bitte gegenlesen)

- **Der Ref ist von Anfang an eine Union.** Sticker, Hintergründe und Rahmen werden als `catalog:<id>` (Code-Katalog) oder `asset:<uuid>` (DB, für das Folgeprojekt) adressiert. Version 1 nutzt nur `catalog:`. Die Form ist F0 und deshalb schon jetzt offen für das Selbst-Anlegen.
- **Die Abo-Reihe liest direkt aus Registry und Katalog.** Die paginierten Leser der eigenen Zeilen bleiben unangetastet. Abo-Elemente sind keine Nutzerzeilen und berühren deshalb weder den Papierkorb noch das normale Entfernen. „Meine Grüneratoren“ bekommt dasselbe Muster mit einem eigenen Abschnitt „Aus Kollektionen“.
- **Eigen schlägt Abo.** Hat eine Person ein Element auch selbst (Library-Zeile oder Favorit), bleibt es nach dem Abbestellen erhalten. In der Abo-Reihe zeigt es dann nicht „Kollektion abbestellen“, sondern die normale Aktion.
- **Abbestellen nimmt nichts weg, was gerade benutzt wird.**
  - Offene Threads mit dem Agent laufen weiter, weil er aus dem offiziellen Katalog kommt. Aus „Meine Grüneratoren“ verschwindet er.
  - Ist er als Standard-Agent gesetzt, bleibt die Einstellung stehen.
- **Ohne `INTERN_CONTENT_DIR`** fehlen die privaten Vorlagen auf einer Instanz. Sie fallen dann still aus Startrampe und Abo-Reihe heraus, wie heute beim Baustein `vorlagen`. Einen eigenen Zustand „nicht verfügbar“ gibt es nicht.
- **Die Ids der privaten Inhalte vergeben wir selbst** (`mustergruen-maxi-*`) und liefern den PR im privaten Repo mit. Der öffentliche und der private PR verwenden dieselben Ids.
- **Ohne Login fehlt `subscribed` in der Antwort** (optionales Feld). Der Knopf „Abonnieren“ führt dann zum Login und danach zurück zur Kollektion.
- **PR 4 wartet auf die Freigabe des Designs.** PR 1–3 werden mit Fixtures gebaut, dafür reichen die heutigen Wahlkampf-Bilder. Das Rahmen-Format (1080 × 1080, transparente Mitte) legen wir zusammen mit dem Design fest.

## Lösungsskizze (vom Builder zu verfeinern)

### Daten

- Neue Tabelle `collection_subscriptions(user_id uuid FK profiles ON DELETE CASCADE, collection_id text, created_at, PRIMARY KEY(user_id, collection_id))`, als Raw-SQL-Migration plus Drizzle-Schema. `collection_id` validiert serverseitig gegen `marketplaceCollectionIdSchema`.
- Kollektionen bleiben eine Client- und Shared-Registry. Damit der Server die Elemente einer Kollektion kennt, braucht er dieselbe Liste `pinned` (die heute schon in `marketplaceService.resolveCollection` aufgelöst wird).

### Elemente müssen echt sein

Heute sind die Wahlkampf-Einträge `samples`, also reine Dateien, die man nicht speichern kann. Für ein Abo braucht jedes Element einen stabilen `ref`:

- **Sticker und Hintergründe:** als offizielle, systemweite Assets. Vorschlag: Sticker in den Code-Katalog `SYSTEM_STICKERS` (`packages/contracts/src/stickers/catalog.ts`). Hintergründe in den entsprechenden Code-Katalog, falls es ihn gibt, sonst als neuer Code-Katalog daneben. Es gibt keine DB-Zeilen, die je Instanz eine andere UUID hätten. Der Builder prüft, welcher Weg zum Profilbild-Deep-Link `?sticker=`/`?hintergrund=` passt (`packages/shared/src/profilbild/catalogLink.ts`).
- **Profilbild-Rahmen:** neue Art im selben Katalog plus Deep-Link-Parameter (z. B. `?rahmen=<id>`) in `ProfilbildPage.tsx`.
- **Sharepic-, Story- und Visitenkarten-Vorlagen:** im Katalog `sharepicVorlagen` (privates Repo), adressiert über die Vorlagen-Id. Die Visitenkarte läuft über das vorhandene Druckformat (`composePrint.ts`).
- **Agent:** Eintrag im offiziellen Katalog mit Frontmatter im öffentlichen Repo und Persona im privaten Repo. Ref = Identifier, wie in `user_library_items`.

### Lesen (eigener Abschnitt zur Lesezeit)

Jede Ansicht aus Ziel 2 bekommt oberhalb ihrer Liste einen Abschnitt je abonnierter Kollektion. Er liest die Elemente der Kollektion aus Registry und Katalog. Die vorhandenen paginierten Leser bleiben unverändert. Der Builder ermittelt die Ansichten vollständig, die Kandidaten sind:

- „Meine Grüneratoren“ (`userLibraryService`, Abschnitt „Aus Kollektionen“)
- Mediathek, Sticker-Ansicht und Vorlagen
- das Profilbild-Werkzeug (Rahmen, Sticker und Hintergründe der Abos auswählbar)

Jedes Abo-Element trägt seine Herkunft (`via: { collectionId }`), damit die UI die Marke „aus Mustergrün“ zeigen und „Entfernen“ zu „Kollektion abbestellen“ machen kann. Bei Dubletten, also Elementen, die eigen und abonniert sind, gewinnt das eigene.

### Contract

Zwei Endpunkte (`PUT`/`DELETE /api/marketplace/collections/:id/subscription`) im Marktplatz-Contract, und das optionale Feld `subscribed?: boolean` an der Kollektion in der Frontpage-Antwort (fehlt ohne Login). Clients, die das Feld nicht kennen, ignorieren es.

### UI (Web)

`MarketplaceCollections.tsx` und `CollectionStory.tsx`: den Abo-Knopf in die Hauptaktion des Titel-Blocks, und nach dem Abo den Startrampen-Block oben. Der Startrampen-Block ist vermutlich ein siebter Baustein `launchpad`. Die Begründung gehört nach `docs/CLAUDE-collections.md` („ein neuer Baustein nur, wenn ihn eine Kollektion wirklich braucht“).

### Mustergrün

Neue Id (Vorschlag des Design-Agents) in `collections/mustergruen.ts`. Dazu `listed` entfernen, die Weiterleitung von `wahlkampf-moritz` einrichten, die Cover in allen sechs Größen und die Story ohne erfundene Zitate.

## Was dem Builder überlassen bleibt

- die genaue Liste der Leser und wie die Vereinigung je Leser eingebaut wird
- ob Sticker, Hintergründe und Rahmen in einen Code-Katalog oder in offizielle `studio_assets` kommen; Kriterium: der `ref` ist auf jeder Instanz gleich
- der Name des Deep-Link-Parameters für Rahmen und die Form des `launchpad`-Bausteins
- die Reihenfolge der PRs, mit Vorschlag:
  1. Abo-Datenmodell, Contract und Knopf
  2. Abo-Abschnitte in den Listen
  3. Rahmen-Deep-Link und Startrampe
  4. Mustergrün-Assets (öffentlich) plus PR im privaten Repo (Vorlagen und Persona)

## Folgeprojekt (nicht Teil dieses Plans)

Landesverbände legen und pflegen Kollektionen selbst: Kollektionen kommen in die Datenbank, ein Herausgeber-Feld an Studio-Assets und Vorlagen, Bearbeitung über `landesverband_admins` und die LV-Admin-Seite.
