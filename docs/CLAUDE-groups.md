# Projekte: Übersicht, Austausch, Chats und Wissen

Stand: 22.11.2026. Produktname: **Projekte**; technische IDs, Tabellen und API-Pfade bleiben `groups`.

## Projektarten

**Seit 22.11.2026 gibt es eine Art Projekt** (Produktentscheidung): man legt es auf einem Weg an, nutzt es allein oder mit anderen, und Mitglieder lassen sich jederzeit einladen. „Gruppe“ ist kein Produktwort mehr (auch nicht für Team-Projekte). Die früheren Regeln „Persönlich“ vs. „Team“ (Revision 11.11.) sind zurückgenommen.

- **Gespeichert wird `group_type = 'standard'`**; der Server ignoriert ein mitgeschicktes `groupType` (ausgelieferte Mobile-Binaries senden es noch). `'personal'` bleibt als F0-Altwert in Zeilen, Contract-Enum und Binaries lesbar, **verhält sich aber überall wie `'standard'`**: kein Server-Guard und keine UI-Weiche liest ihn mehr, ein Umkippen beim ersten Einladen braucht es deshalb nicht (Beitritt per Token und E-Mail-Einladung prüfen den Typ nie).
- **Das Verhalten folgt der Mitgliedschaft:** Beiträge, Kommentare, Reaktionen, Mitglieder, Einladen, Beitrittsanfragen und „Öffentlich machen“ gibt es in jedem Projekt außer dem System-Projekt. Was nur mit anderen Sinn ergibt — der Tab **Austausch** — zeigt die UI bei mehr als einer Person; der **Austausch** zusätzlich, sobald es Beiträge oder besprochene Freigaben gibt (`hasAustauschContent`, #5950: wer wieder allein ist, verliert seine Beiträge nicht). Einladen steht im „…“-Menü (Admins, nicht im System- oder archivierten Projekt); einen zweiten Knopf im Kopf gibt es bewusst nicht. Begrüßung und Startfragen auf der Übersicht gibt es seit 23.11.2026 nicht mehr (Produktentscheidung); die Spalten `group_instructions.welcome_message`/`start_questions` bleiben als F0 stehen und werden nicht gelesen. **Archiviert** heißt: nur lesen — keine neuen Freigaben, Beiträge, Kommentare, Chats; wiederkehrende Aufgaben des Projekts **ruhen** (`claimDueRecurringTasks` überspringt sie, API und Chat-Werkzeug legen dort keine neuen an, #5951); nach „Wiederherstellen“ läuft eine überfällige Aufgabe einmal nach. Der Server lehnt nichts mehr nach Typ ab (Team-Chat in jedem Projekt, `team_chat_needs_team_project` kommt nur noch, wenn die Projektzeile fehlt).

| Art | Kennzeichen | Übersicht | Austausch |
| --- | --- | --- | --- |
| Projekt | `group_type` egal (neu: `standard`) | Chat-Composer, eigene Chats, Anweisungen, Wissen, Links, **Mitglieder** | ab zwei Personen oder mit Inhalt |
| System „Grünerator“ | `is_system = true` | nur Wissen (keine Chats, keine Anweisungen, keine Mitgliederkarte) | ja, öffnet zuerst dort |

Das System-Projekt beschreibt der Abschnitt „Erwähnungen und Benachrichtigungen“ unten.

## Projektseite (Web und Mobile)

**`/projekte`:** Projekte und darunter „Deine Rezepte“ (`ProjekteRecipesSection`, Daten aus `agentura/hooks/useMyRecipes.ts`: eigene, in Projekte geteilte, aus dem Marktplatz hinzugefügte) als dieselbe Kachel `TileCard` (Ton `projekte` = Tanne, „…“-Menü; Projekte: Archivieren für Admins). „Neues Projekt“, Sortieren und „Neues Rezept“ sind Icon-Knöpfe im Abschnittskopf. `/grueneratoren` bleibt vorerst mit einem Hinweis auf den Umzug stehen.

Web: `apps/web/src/features/groups/components/GroupInfoSection.tsx` (Kopf, „Hinzufügen“, Einstellungen) und `components/feed/GroupContentArea.tsx` (zwei Ansichten). Mobile: `apps/mobile/app/(focused)/projekte/[id]/index.tsx` und `components/projekte/`; die App spiegelt dieselben zwei Ansichten (`Übersicht`/`Austausch`), Rest siehe „Mobile“.

**Übersicht** (`?beitrag=` und das System-Projekt öffnen stattdessen den Austausch):

- **Zwei Spalten, zwei Reiter:** `GroupContentArea` besitzt das Zwei-Spalten-Layout; die rechte Spalte (`sidebar`: Anweisungen, Geplant, Rezepte, Wissen, Links, Mitglieder, 340 px ab 900 px) steht in Übersicht und Austausch an derselben Stelle, nur die linke wechselt (`overviewMain` bzw. der Austausch). Austausch-Einträge sind Zeilen (`GroupFeedRow`, Stil wie die Chat-Zeilen); ein Klick klappt die volle `GroupFeedCard` an Ort und Stelle auf (Kommentare, Reaktionen, Anheften, Menü, Bearbeiten, Melden), `defaultOpen` für `?beitrag=<shareId>` und „Im Austausch besprechen“. Beitrags-Composer und Suche stehen über der Liste.
- **Chats:** `ProjectChatComposer` und `SpaceChatsSection` mit den Chats des Projekts. Nur wo geteilt werden darf und nicht im System-Projekt (`showChats`). Der Composer ist der Start-Composer (`ChatInner` mit `projectId`: Pill, Modus/Modell/Werkzeuge auf „Auto“; einen Projekt-Picker hat kein Composer mehr, in ein Projekt kommt ein Chat über die Projektseite oder `/chat?projekt=<id>`), darunter immer der Schalter „Im Projekt teilen“ (Standard an; aus = Chat bleibt privat, entsteht aber trotzdem im Projekt und nutzt dessen Wissen). Auf der Projektseite steht der Composer linksbündig in Spaltenbreite, auf der Startseite zentriert. Die Vorwahl läuft über `setPendingGroup(groupId, teamShared)` und wird beim Verlassen ohne Senden wieder abgeräumt, sonst stünde das Projekt im nächsten Start-Composer; der Chat legt den Thread dann **mit** `groupId` an, bevor der erste Turn läuft (der liest den Projekt-Kontext zur Laufzeit, ein späteres Ablegen käme zu spät). Die Liste filtert die Thread-Liste clientseitig (`projectChatThreads`), es gibt keinen eigenen Endpunkt.
- **Anweisungen** (`ProjectInstructionsCard`): eine Zeile, Dialog zum Bearbeiten für Admins; nicht im System-Projekt.
- **Rezepte** (`ProjectRecipesCard`): die ins Projekt geteilten Rezepte (Chats im Projekt laden sie vorab, `services/groups/projectRecipes.ts`). „+ Rezept“ öffnet `/agentura/rezept/neu?projekt=<id>`; der Editor teilt das neue Rezept nach dem Speichern ins Projekt und kehrt zurück (scheitert nur das Teilen, landet man auf dem Rezept). Ein Rezept gehört der Person und existiert auch ohne Projekt.
- **Wissen** (`ProjectKnowledgeList`): alles Geteilte außer Beiträgen und Rezepten als kompakte Zeilen (Dateien, Texte, Notebooks, Agents, Docs …); je Datei/Doc der **Suchzustand** (`search_state`, abgeleitet in `services/groups/projectSearchState.ts`: wird eingelesen, fehlgeschlagen, nicht durchsuchbar, nach Bearbeitung veraltet, noch nicht indexiert, außerhalb der Deckel 200/50) und darüber „X von Y durchsuchbar“; das Web lädt nach, solange etwas eingelesen wird; Suchfeld ab sechs Zeilen; „Im Austausch besprechen“ holt ein Element dorthin; das Zeilenmenü verwaltet Rolle und Entfernen (`shareActions.tsx`).
- Links (`GroupLinksSection`, nur wenn vorhanden) und, nur im Team-Projekt, **Mitglieder** (`ProjectMembersCard`).

**Austausch:** Beiträge und Freigaben mit Notiz, Anheftung, Reaktion oder Kommentar, dazu was gerade angesteuert wird (`austauschItems` in `packages/shared/src/groups/feed.ts`: Beitrag, angeheftet, Notiz, Kommentare, Reaktionen, per „Im Austausch besprechen“ geholt oder per `?beitrag=<shareId>` verlinkt). Alles andere ist Wissen. Sortierung: angeheftete zuerst (zuletzt angeheftet oben), danach die neuesten Freigaben. Die Suche im Austausch durchsucht Titel, Freigabe-Notiz, Kurzbeschreibung, Beitragstext und Dateinamen (`filterGroupFeed`). Karte: `GroupFeedCard`, Kommentare: `GroupCommentThread`, Composer: `GroupComposer`.

**Melden und Ausblenden:** Jede fremde Beitrags-/Freigabekarte hat im „…“-Menü „Melden“ (`group_post` bzw. `group_share`), jeder fremde Kommentar „Melden“ (`group_comment`); eigene Inhalte nie. Web nutzt `components/common/ReportDialog.tsx`, Mobile `ReportSheet`; beide senden `POST /api/content-reports` mit `groupId`. Die drei Arten sind keine moderierbaren Ziele (`moderatableReportKindSchema`) und bekommen bewusst kein Auto-Hide, weil ein Projekt geschlossen ist (#5948). Der Server prüft vorher (`services/contentReports/projectReports.ts`): der Inhalt liegt in einem lebenden Projekt, die meldende Person ist dort aktives Mitglied (sonst 404), und er ist nicht ihr eigener (400). Das Projekt kommt aus der Zeile, nicht aus dem `groupId` des Requests. Gespeicherte Meldungen gehen an den Betrieb (Mail) und als `group_content_reported` an die Projekt-Admins; die Benachrichtigung nennt weder meldende noch verfassende Person, und die verfassende Person bekommt sie nicht. „Person ausblenden“ gibt es nur in der App (`apps/mobile/utils/hiddenMembers.ts`).

`GET /api/auth/groups/:groupId/content` liefert Buckets samt Freigabe-Metadaten. `packages/shared/src/groups/feed.ts` vereinheitlicht sie mit `toGroupFeedItems`, `sortGroupFeed` und `filterGroupFeed` für beide Plattformen; `groupFeedByKind` (Abschnitte je Art, `GroupKindRows.tsx`) nutzt nur noch Mobile. Nicht jeder teilbare Inhaltstyp hat eine Feed-Karte: Die Darstellung richtet sich nach den tatsächlich konvertierten Buckets, nicht allein nach `groupContentTypeSchema`. `?beitrag=<shareId>` lässt beide Plattformen aus einer Benachrichtigung zum Eintrag scrollen. Benutzerseitige Projektlinks verwenden `buildGroupSlug` und den stabilen `slug_suffix`; UUID-Links bleiben als Legacy-Fallback auflösbar.

## Inhalte hinzufügen

Ein „Hinzufügen“-Menü (`ProjectAddMenu`, Mobile `addMenu.ts`, Seite `projekte/[id]/hinzufuegen.tsx`):

- **Vorhandenes** (`AddExistingPicker`, Mobile `addItemsToGroup` aus `packages/shared/src/groups/addContent.ts`): nur Eigenes (Docs, Sheets, Präsentationen, Boards, Agents, Rezepte, Notebooks, Dateien), geteilt über `POST /groups/:id/share`; was schon im Projekt liegt, erkennt die Auswahl am Schlüssel `contentType:id`. Docs, Sheets, Präsentationen und Boards gehen in Team-Projekten mit Schreibrecht hinein (`writeDocuments`), alles andere nur lesend. Besitz, Papierkorb und `share_mode` prüft der Server (`shareContentToGroup`).
- **Neu im Projekt** (Doc, Sheet, Präsentation, Board): Inhalt und Freigabe entstehen in **einer** Transaktion über `services/groups/createInGroup.ts` (`createInGroup`; darf die Person nicht teilen, bleibt kein loses Dokument zurück). Im System-Projekt ohne Schreibrecht. Aufrufer: `docsContractRouter`, `canvasContractRouter`, `boardsContractRouter`; Web `features/groups/createInProject.ts`.
- **Datei und Text:** `uploadFileOnly(…, groupId)` bzw. `POST /documents/add-text` mit `groupId`; der Server prüft vorher `mayShareIntoGroup` (`routes/documents/manualController.ts`) und teilt das `documents`-Objekt ins Projekt.
- **Link:** nur Projekt-Admins.

## Speicherung und Rechte

Eine Zeile in `group_content_shares` ist der Feed-Anker: `note`, `pinned_at`, `pinned_by` und die Kommentare hängen an ihrer **shareId**, nicht an der Inhalts-ID. Eigene Beiträge stehen in `group_posts`, Anhänge in `group_post_files`; zusätzlich entsteht transaktional eine Freigabe mit `content_type = 'group_post'` und `content_id = group_posts.id`.

**`group_post` gehört bewusst nicht zu `GroupContentType`.** Beiträge über `groupPosts.ts` erstellen/bearbeiten/löschen, niemals über die allgemeinen Teilen-/Entfernen-Routen. Beim Löschen werden Freigabe und Beitrag transaktional entfernt; Kommentare kaskadieren, gespeicherte Dateien werden anschließend gelöscht.

| Aktion | Berechtigung / Grenze |
| --- | --- |
| Beitrag erstellen | Team-Mitglieder; System-Projekt nur Instanz-Admins; Text oder Datei erforderlich |
| Beitrag bearbeiten | Nur die verfassende Person; geändert wird der Text |
| Beitrag löschen | Verfassende Person oder Projekt-Admin |
| Anheften / lösen | Projekt-Admins oder Ersteller*in; System-Projekt nur Instanz-Admins |
| Freigabe-Notiz ändern | Teilende Person oder Projekt-Admin |
| Kommentieren / antworten | Mitglieder |
| Kommentar löschen | Verfassende Person oder Projekt-Admin |
| Beitragsdatei lesen | Nur Mitglieder; kein öffentlicher Upload-Link |
| Inhalt teilen / „Neu im Projekt“ | Mitglieder; System-Projekt nur Instanz-Admins (`assertCanShareToGroup`) |
| Rolle ändern / Inhalt entfernen | Projekt-Admins oder die Person, die geteilt hat (`canManageShare`) |
| Anweisungen lesen / schreiben | Mitglieder lesen, Projekt-Admins schreiben; System-Projekt schreiben nur Instanz-Admins |
| Link hinzufügen | Projekt-Admins |
| Melden | Jedes Mitglied, nicht bei eigenen Inhalten (Server: 400); Projekt-Admins werden benachrichtigt |

Limits aus `packages/contracts/src/schemas/groups.ts`: 2.000 Zeichen Projekt-Anweisungen (`GROUP_INSTRUCTIONS_MAX`), 3 Anheftungen (die älteste wird verdrängt), 500 Zeichen Freigabe-Notiz, 2.000 Zeichen Kommentar, 5.000 Zeichen Beitrag, 10 Dateien pro Beitrag, 25 MiB je Datei. Dateitypen werden serverseitig gegen die erlaubten Anhänge geprüft.

Kommentare in `group_share_comments` werden chronologisch als flache Liste geliefert und im UI zu Threads aufgebaut. `parent_id` erlaubt genau eine Antwortebene: Antworten auf Antworten hängen am obersten Kommentar. Beim Löschen eines Elternkommentars bleiben Antworten erhalten (`ON DELETE SET NULL`) und werden zu Kommentaren oberster Ebene.

## Was Projekt-Chats automatisch lesen

Ein Chat mit `chat_threads.group_id` bekommt in `routes/chat/services/streamContext.ts` bei **jedem Turn** Projekt-Kontext, ohne @-Erwähnung. Nichts davon liegt am Thread; es wird pro Turn nach Mitgliedschaft gelesen:

| Was | Code | Wirkung |
| --- | --- | --- |
| Anweisungen | `readThreadProjectInstructions` (`groupInstructions.ts`) | Block im Systemprompt, mit Projektname |
| Dateien | `getProjectFileDocumentIds` (`projectFiles.ts`) | alle fertigen geteilten `documents` als EIN Dokument-Scope („stilles Notebook“, `defaultNotebookDocumentIds`), Sicherheitsdeckel 200 (neueste); Vorab-Suche über den ganzen Scope (`seedAgentNotebooks`) |
| Docs, Tabellen, Boards | `getProjectCollabDocumentIds` + `collab_search_index` (`services/docs/collabSearchIndex.ts`) | ins Projekt geteilte Collab-Docs werden nach 2 Minuten Ruhe in Qdrant indexiert (`source_type: 'collab'`) und liegen im selben Scope, Deckel 50 |
| Titelliste | `getProjectCollabDocs` + `formatProjectDocs` (`projectCollabDocs.ts`) | Abschnitt „DOKUMENTE DES PROJEKTS“: Docs UND Dateien mit `kind`/`id`, höchstens 30, neueste zuerst — nur Titel, kein Volltext im Prompt |
| Projekt | `getThreadProjectId` → `ChatGraphState.project` | Projekt-Id und Suchbereich; der Loop hält damit `read_artifact` und `groups` sichtbar (`catalogAssembly`, `keepVisible`), eine Zusammenfassung ohne sonstiges Material geht in den Loop statt ins Web (`classifierNode`) |
| Notebooks | `getProjectNotebookIds` (`projectNotebooks.ts`) | geteilte `system_notebooks`/`notebook_collections` als Vorgabe-Suche wie `defaultNotebookIds` eines Agents; höchstens 8; Zugriff prüft `initializeChatState` (Tor bzw. `checkNotebookAccess`); eine @notebook-Wahl des Turns schlägt die Vorgabe; auf der Instanz verborgene System-Notebooks fallen heraus |
| Rezepte | `getProjectRecipeIds` (`projectRecipes.ts`) | eigener Block „REZEPTE DIESES PROJEKTS“ im Katalog von `rezept_laden`, höchstens 12, mit der Regel „im Zweifel laden“ (`renderRecipeCatalog`) |

Jeder Leser ist ein Ausfall-tolerantes `withTimeout` (`EXTERNAL_CONTEXT_TIMEOUT_MS`): ein Fehler kostet nur diesen Baustein, nicht den Turn. Hat der vorige Turn ein Projekt-Rezept geladen, lädt ein Schreib-Turn es vorab (`carriedProjectRecipes`, `preloaded`, weicht also einer anderen gewählten Textsorte); gelesen wird das aus `recipesUsed` der letzten Assistant-Nachricht, dort steht die Zeilen-id (`RecipeSummary.id`). Ohne Vorab-Laden lud das Modell Folgeaufträge („noch einer“, „kürzer“) gemessen fast nie neu. „Skill“ versteht der Chat als „Rezept“ (`productGlossary.ts`).

**Projekt-Werkzeuge im Loop** (nur Chat, kein MCP):

- `read_artifact` liest Docs, Tabellen, Boards, Präsentationen und mit `kind: "file"` hochgeladene Dateien — eigene oder in ein Projekt geteilte, in dem die Person aktives Mitglied ist (`artifactReader.ts`, Text über `readSourceText` wie `notebook_quellen`). Datei noch im Einlesen, fehlgeschlagen oder Chunk-Speicher aus → `ArtifactNotReadableError` mit eigenem Satz, nie „leer“.
- `groups` action `search`: gezielte Suche im Scope des Projekts DIESES Chats (kein anderes Projekt — die Dokument-ID-Suche läuft ohne `user_id`-Filter). Action `add_text`: Text als Datei ins Projekt, immer über die Karte `add_project_text`; ausgeführt von `addTextToGroup` (`createInGroup.ts`), demselben Weg wie „Hinzufügen → Text“ (`POST /documents/add-text`).
- Rechte beim Teilen aus dem Chat: Docs standardmäßig „Bearbeiten“ (`documents` share_to_group), Dateien und Texte „Lesen“.
- **Beim Namen genannte Dateien liest der Turn vorab ganz** (`seedNamedProjectDocs` in `catalogAssembly.ts`, erkannt über `namedProjectDocs`: Titel aus der Prompt-Liste, ab 8 Zeichen, höchstens 2), als Replay unter `read_artifact`. Grund (#5952, gemessen 22.11.2026): mit den Auszügen der Vorab-Suche riefen Gemma und „Klein“ `read_artifact` in 0 von 6, Mistral Large in 2 von 6 Fällen und rieten „letzter Satz“, „wie oft“ und Vergleiche aus Auszügen. Nach Thema statt Titel benannte Dateien bleiben Sache des Modells; Zählen bleibt unzuverlässig (Gemma: 8 statt 7 bei korrektem Text).

**DIE Zugriffsregel ist `projectThreadScopeSql(thread, user)`** (`services/groups/projectThreadScope.ts`): aktive Mitgliedschaft im (nicht gelöschten, aktiven) Projekt des Threads UND der Thread gehört der Person ODER ist ein Team-Chat. Wer das Projekt verlassen hat, behält seinen privaten Chat, aber nicht mehr dessen Material; die Thread-Id eines fremden privaten Chats öffnet das Projekt nicht. Jeder neue Leser baut auf diesem Baustein auf, nicht auf eigenem SQL.

## Team-Chats

Ein Chat ist **Team-Chat**, wenn eine Freigabe `content_type = 'chat_threads'` mit `read` und `write` ins Projekt existiert (`teamChatShareExistsSql`). Angelegt wird sie im Composer über „Im Projekt teilen“ (`teamShared` in `threads.create`, Standard an in Team-Projekten, Thread und Freigabe in einer Transaktion, `threadsContractRouter.ts`); die Thread-Liste meldet `teamShared`.

- **Besitz:** `ownsThreadSql` (`projectThreadScope.ts`): `user_id` ist die Person UND sie ist nicht aus dem Projekt ausgetreten, dem der Thread als Team-Chat gehört. Wer geht, verliert den Team-Chat samt Besitzerrechten (sonst läse er weiter mit, #5678); ein privater Projekt-Chat bleibt bei seiner Besitzerin. Ein gelöschtes oder stillgelegtes Projekt macht den Chat wieder privat. Hocuspocus spiegelt die Regel (`services/hocuspocus/src/auth.ts`). Zugriffsstufen: `threadAccessService.getThreadAccessLevel`.
- **Anheftungen je Person:** Wolke-Dateien, Notebook-Quellen, Erwähnungen und der letzte MCP-Konnektor eines Threads gelten pro Person (#5675): die Spalten auf `chat_threads` gehören der Besitzerin, jedes andere schreibende Mitglied hat eine Zeile in `chat_thread_member_refs` (`threadPersistenceService.ts`, `readThreadRef`/`writeThreadRef`). Ein Turn liest und schreibt nur die eigenen; keiner überschreibt fremde.
- **Recall:** frühere Chats durchsuchen eigene und Team-Chats des Projekts (`teamChatMemberSql` in `pastChatRecallService.ts`).

## API und zuständige Dateien

- Contract und Zod: `packages/contracts/src/contracts/groupsContract.ts`, `packages/contracts/src/schemas/groups.ts`.
- ts-rest-Handler: `apps/api/routes/auth/groups/groupsContract/`; die alten `groupCore.ts`/`groupContent.ts` sind keine parallelen CRUD-Handler.
- Multipart-Erstellung: `POST /api/auth/groups/:groupId/posts`, Felder `body` und `files`; Dateizugriff: `GET /api/auth/groups/:groupId/posts/:postId/files/:fileId`. Beide liegen in `routes/auth/groups/groupPosts.ts`; Avatar-Upload bleibt ebenfalls eine separate Express-Route.
- Beitrag ändern/löschen: `PATCH`/`DELETE …/posts/:postId`; Freigabe ändern: `PATCH …/shares/:shareId`; Kommentare: `GET`/`POST …/shares/:shareId/comments`, `DELETE …/shares/:shareId/comments/:commentId`.
- Anweisungen: `GET`/`PUT /api/auth/groups/:groupId/instructions`; Tabelle `group_instructions` (eine Zeile je Projekt, `custom_prompt`, `instructions_enabled` spiegelt „Text vorhanden“; leerer Text entfernt sie).
- Meldungen: `POST /api/content-reports` (`contentReportContract.ts`), Registry `services/contentReports/moderationTargets.ts`.
- Geschäftslogik: `services/groups/groupPosts.ts`, `groupFeed.ts`, `groupContent.ts`, `groupSharePermissions.ts`, `groupInstructions.ts`, `createInGroup.ts`, `project{Files,Notebooks,Recipes,ThreadScope}.ts`; Drizzle: `database/schema/groups.ts`, `chat.ts`.
- Web-Hooks: `packages/shared/src/groups/useGroups.ts`; JSON-Aufrufe über `getContractsClient()`, Multipart über den API-Client. Mutationen invalidieren die Inhalts-/Kommentar-Queries. Mobile besitzt eigene Hooks in `apps/mobile/hooks/`.
- Migrationen: `zz_20260927_group_feed.sql`, `zz_20260927_system_group.sql`, `zz_20260928_group_posts.sql`, `zz_20260928_group_comment_threads.sql`, `zz_20261116b_chat_thread_member_refs.sql` unter `apps/api/database/postgres/migrations/`.

## Erwähnungen und Benachrichtigungen

Tokens: `@[Name](user:<uuid>)` und `@alle`; Parser/Plaintext-Darstellung in `packages/shared/src/utils/groupMentions.ts`. Web stellt Mitgliedervorschläge in `GroupMentions.tsx` bereit. `services/groups/groupActivityNotifications.ts` bestimmt die Empfänger, `services/notifications/groupNotifications.ts` prüft aktive Mitgliedschaft und stellt zu.

Neue Beiträge benachrichtigen Mitglieder außer der verfassenden Person. Neue Kommentare erreichen die teilende Person und bisherige Kommentierende des Beitrags; Antworten erreichen die teilende Person und Beteiligte des betreffenden Threads. Persönliche Erwähnungen ersetzen für diese Person die Grundmeldung; `@alle` ersetzt die Grundmeldung für alle Mitglieder. Beim Bearbeiten werden nur neu hinzugekommene Erwähnungen gemeldet. Erwähnungen werden in der Glocke separat angezeigt, sonstige Projektmeldungen mit `groupKey = group:<id>` gebündelt. Projekt-Stummschaltung unterdrückt E-Mails, die In-App-Meldungen bleiben erhalten.

Das System-Projekt **„Grünerator“** (`is_system = true`, Zielgruppe `all`) enthält alle Profile über echte Mitgliedschaften. `systemGroup.ts` legt es idempotent beim Boot an, ergänzt fehlende Mitgliedschaften und nimmt neue Profile über den Auth-Hook auf. Mitgliederinformationen bleiben verborgen; Teilen und neue Beiträge sind Instanz-Admins vorbehalten. Mitglieder dürfen kommentieren; `@alle` ist dort nur für Instanz-Admins wirksam, persönliche Erwähnungen erreichen nur ohnehin beteiligte Thread-Personen. System-Projekt-Meldungen bleiben ausschließlich in der App.

Freigaben vorhandener Inhalte verwenden weiterhin `groupContent.ts` und dessen Zugriffsregeln. Private Notebooks und eigene Agents werden beim Teilen auf Gruppenfreigabe umgestellt; eine Rückstellung auf privat muss auch den Gruppenzugriff entziehen. Agenten-Prompts gehören nicht in die Inhaltsantwort. Feed-Darstellung ersetzt keine Zugriffsprüfung der Zielressource.

## Nutzungs-Ranking („Empfohlen“)

Projekte und Notebooks erscheinen in der Seitenleiste und auf `/projekte` nach Nutzung. Die Zählung ist `user_item_usage` (`item_type` `project` bzw. `notebook`, `item_id` = Projekt-/Notebook-UUID). Geschrieben wird an zwei Stellen für Projekte: der Client meldet das Öffnen der Projektseite (`POST /api/item-usage`, `useRecordItemUsage` in `ProjektePage`), der Server zählt jeden Chat-Turn im Projekt (`streamContext.ts`); Notebooks zählt allein der Server (Chat und Notebook-Frage), nicht das bloße Öffnen. Das Maß steht an einer Stelle, `rankByUsage` (`packages/shared/src/utils/usageRanking.ts`): Genutzte zuerst, nach Anzahl, dann zuletzt genutzt; Ungenutzte danach in der Rückfallordnung (Projekte: letzte Aktivität, Notebooks: Name), damit neue Personen etwas sehen. `sortGroups(..., 'recommended', usage)` ist die Sortierung „Empfohlen“ (Standard auf `/projekte`); die Seitenleisten-Popups (`ProjekteSidebarSection`, `NotebooksSidebarSection`) nehmen daraus die ersten acht. Die Sortierung ist nirgends persistiert; Mobile sortiert weiter nach `'activity'`.

## Mobile

Gleiche Struktur wie Web: `Übersicht` (`ProjectChatComposer`, `ProjectChatList`, `ProjectInstructionsCard`, `ProjectKnowledgeList`, `ProjectLinks`, `ProjectMembersPreview`) und `Austausch` (sichtbar nach derselben Regel wie im Web, #5950; `GroupFeedCard`, `GroupCommentsSheet`). Menüs bauen `shareMenu.ts`, `addMenu.ts`, `knowledgeMenu.ts`, `moderationMenu.ts` (Melden, Person ausblenden). Funktional gleich mit dem Web (Stand 23.11.2026 im Code verglichen): Beiträge mit Dateien schreiben, bearbeiten und löschen, Admin-Löschen fremder Beiträge und Kommentare, Anheften, Notiz, Kommentar-Threads, Erwähnungen, Reaktionen, Melden. Anders nur in der Form: Beiträge entstehen über die Zeile oben im Austausch bzw. „+“ auf einem eigenen Bildschirm (`projekte/[id]/beitrag.tsx`), Anheften/Notiz/Löschen liegen im „…“-Menü statt als Knopf. Auf beiden Plattformen fehlt: eigene Kommentare bearbeiten (keine Route), Dateien eines Beitrags nachträglich ändern.

## Gezielte Prüfung

Am 01.10.2026 erfolgreich: 51 Tests in `groupFeed.vitest.ts`, `groupPosts.vitest.ts`, `groupActivityNotifications.vitest.ts`, `groupNotifications.vitest.ts` (API) sowie 37 Tests in `feed.vitest.ts` und `groupMentions.vitest.ts` (shared). Das prüft Logik mit Test-Abhängigkeiten; kein Nachweis eines Live-Datenbank-, Upload- oder UI-End-to-End-Laufs.
