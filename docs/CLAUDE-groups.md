# Projekte: Übersicht, Austausch, Chats und Wissen

Stand: 22.11.2026. Produktname: **Projekte**; technische IDs, Tabellen und API-Pfade bleiben `groups`.

## Projektarten

| Art | Kennzeichen | Übersicht | Austausch |
| --- | --- | --- | --- |
| Persönlich | `group_type = 'personal'` | Chat-Composer, eigene Chats, Anweisungen, Wissen | nein (auch serverseitig: keine eigenen Beiträge, keine neuen Kommentare) |
| Team | `group_type = 'standard'` | wie persönlich, dazu Links und **Mitglieder** (ab zwei Personen) | ja |
| System „Grünerator“ | `is_system = true` | nur Wissen (keine Chats, keine Anweisungen, keine Mitgliederkarte) | ja, öffnet zuerst dort |

Das System-Projekt beschreibt der Abschnitt „Erwähnungen und Benachrichtigungen“ unten. Persönliche Projekte haben keinen Team-Chat (`team_chat_needs_team_project`, 400).

## Projektseite (Web und Mobile)

Web: `apps/web/src/features/groups/components/GroupInfoSection.tsx` (Kopf, „Hinzufügen“, Einstellungen) und `components/feed/GroupContentArea.tsx` (zwei Ansichten). Mobile: `apps/mobile/app/(focused)/projekte/[id]/index.tsx` und `components/projekte/`; die App spiegelt dieselben zwei Ansichten (`Übersicht`/`Austausch`), Rest siehe „Mobile“.

**Übersicht** (`?beitrag=` und das System-Projekt öffnen stattdessen den Austausch):

- **Chats:** `ProjectChatComposer` („Neuer Chat in …“) und `SpaceChatsSection` mit den Chats des Projekts. Nur wo geteilt werden darf und nicht im System-Projekt (`showChats`). Der Composer übergibt Nachricht und Projekt per `setPendingGroup(groupId, teamShared)` an `/chat`; der Chat legt den Thread dann **mit** `groupId` an, bevor der erste Turn läuft (der liest den Projekt-Kontext zur Laufzeit, ein späteres Ablegen käme zu spät). Die Liste filtert die Thread-Liste clientseitig (`projectChatThreads`), es gibt keinen eigenen Endpunkt.
- **Anweisungen** (`ProjectInstructionsCard`): eine Zeile, Dialog zum Bearbeiten für Admins; nicht im System-Projekt.
- **Wissen** (`ProjectKnowledgeList`): alles Geteilte außer Beiträgen als kompakte Zeilen (Dateien, Texte, Notebooks, Rezepte, Agents, Docs …); Suchfeld ab sechs Zeilen; „Im Austausch besprechen“ holt ein Element dorthin; das Zeilenmenü verwaltet Rolle und Entfernen (`shareActions.tsx`).
- Links (`GroupLinksSection`, nur wenn vorhanden) und, nur im Team-Projekt, **Mitglieder** (`ProjectMembersCard`).

**Austausch:** Beiträge und Freigaben mit Notiz, Anheftung, Reaktion oder Kommentar, dazu was gerade angesteuert wird (`austauschItems` in `packages/shared/src/groups/feed.ts`: Beitrag, angeheftet, Notiz, Kommentare, Reaktionen, per „Im Austausch besprechen“ geholt oder per `?beitrag=<shareId>` verlinkt). Alles andere ist Wissen. Sortierung: angeheftete zuerst (zuletzt angeheftet oben), danach die neuesten Freigaben. Die Suche im Austausch durchsucht Titel, Freigabe-Notiz, Kurzbeschreibung, Beitragstext und Dateinamen (`filterGroupFeed`). Karte: `GroupFeedCard`, Kommentare: `GroupCommentThread`, Composer: `GroupComposer`.

**Melden und Ausblenden:** Jede fremde Beitrags-/Freigabekarte hat im „…“-Menü „Melden“ (`group_post` bzw. `group_share`), jeder fremde Kommentar „Melden“ (`group_comment`); eigene Inhalte nie. Web nutzt `components/common/ReportDialog.tsx`, Mobile `ReportSheet`; beide senden `POST /api/content-reports` mit `groupId`. Die drei Arten sind keine moderierbaren Ziele (`moderatableReportKindSchema`): die Meldung wird gespeichert und dem Betrieb gemailt, es gibt kein Auto-Hide wie bei Marktplatz-Inhalten (`services/contentReports/`). „Person ausblenden“ gibt es nur in der App (`apps/mobile/utils/hiddenMembers.ts`).

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
| Kommentieren / antworten | Mitglieder, außer in persönlichen Projekten |
| Kommentar löschen | Verfassende Person oder Projekt-Admin |
| Beitragsdatei lesen | Nur Mitglieder; kein öffentlicher Upload-Link |
| Inhalt teilen / „Neu im Projekt“ | Mitglieder; System-Projekt nur Instanz-Admins (`assertCanShareToGroup`) |
| Rolle ändern / Inhalt entfernen | Projekt-Admins oder die Person, die geteilt hat (`canManageShare`) |
| Anweisungen lesen / schreiben | Mitglieder lesen, Projekt-Admins schreiben; System-Projekt schreiben nur Instanz-Admins |
| Link hinzufügen | Projekt-Admins |
| Melden | Jede Person, nicht bei eigenen Inhalten (Server: 400 bei moderierbaren Arten) |

Limits aus `packages/contracts/src/schemas/groups.ts`: 2.000 Zeichen Projekt-Anweisungen (`GROUP_INSTRUCTIONS_MAX`), 3 Anheftungen (die älteste wird verdrängt), 500 Zeichen Freigabe-Notiz, 2.000 Zeichen Kommentar, 5.000 Zeichen Beitrag, 10 Dateien pro Beitrag, 25 MiB je Datei. Dateitypen werden serverseitig gegen die erlaubten Anhänge geprüft.

Kommentare in `group_share_comments` werden chronologisch als flache Liste geliefert und im UI zu Threads aufgebaut. `parent_id` erlaubt genau eine Antwortebene: Antworten auf Antworten hängen am obersten Kommentar. Beim Löschen eines Elternkommentars bleiben Antworten erhalten (`ON DELETE SET NULL`) und werden zu Kommentaren oberster Ebene.

## Was Projekt-Chats automatisch lesen

Ein Chat mit `chat_threads.group_id` bekommt in `routes/chat/services/streamContext.ts` bei **jedem Turn** Projekt-Kontext, ohne @-Erwähnung. Nichts davon liegt am Thread; es wird pro Turn nach Mitgliedschaft gelesen:

| Was | Code | Wirkung |
| --- | --- | --- |
| Anweisungen | `readThreadProjectInstructions` (`groupInstructions.ts`) | Block im Systemprompt, mit Projektname |
| Dateien | `getProjectFileSources` (`projectFiles.ts`) | geteilte `documents` (`status = 'completed'`) als Dokumentquellen, gelesen mit der `ownerUserId` des Hochladenden; höchstens 8 je Turn, die neuesten gewinnen; erzwingen keine Route, ein Duplikat zu einer gewählten @datei zählt einmal |
| Notebooks | `getProjectNotebookIds` (`projectNotebooks.ts`) | geteilte `system_notebooks`/`notebook_collections` als Vorgabe-Suche wie `defaultNotebookIds` eines Agents; höchstens 8; Zugriff prüft `initializeChatState` (Tor bzw. `checkNotebookAccess`); eine @notebook-Wahl des Turns schlägt die Vorgabe; auf der Instanz verborgene System-Notebooks fallen heraus |
| Rezepte | `getProjectRecipeIds` (`projectRecipes.ts`) | eigener Block „REZEPTE DIESES PROJEKTS“ im Katalog von `rezept_laden`, höchstens 12, mit der Regel „im Zweifel laden“ (`renderRecipeCatalog`) |

Jeder Leser ist ein Ausfall-tolerantes `withTimeout` (`EXTERNAL_CONTEXT_TIMEOUT_MS`): ein Fehler kostet nur diesen Baustein, nicht den Turn. Hat der vorige Turn ein Projekt-Rezept geladen, lädt ein Schreib-Turn es vorab (`carriedProjectRecipes`, `preloaded`, weicht also einer anderen gewählten Textsorte); gelesen wird das aus `recipesUsed` der letzten Assistant-Nachricht, dort steht die Zeilen-id (`RecipeSummary.id`). Ohne Vorab-Laden lud das Modell Folgeaufträge („noch einer“, „kürzer“) gemessen fast nie neu. „Skill“ versteht der Chat als „Rezept“ (`productGlossary.ts`).

**DIE Zugriffsregel ist `projectThreadScopeSql(thread, user)`** (`services/groups/projectThreadScope.ts`): aktive Mitgliedschaft im (nicht gelöschten, aktiven) Projekt des Threads UND der Thread gehört der Person ODER ist ein Team-Chat. Wer das Projekt verlassen hat, behält seinen privaten Chat, aber nicht mehr dessen Material; die Thread-Id eines fremden privaten Chats öffnet das Projekt nicht. Jeder neue Leser baut auf diesem Baustein auf, nicht auf eigenem SQL.

## Team-Chats

Ein Chat ist **Team-Chat**, wenn eine Freigabe `content_type = 'chat_threads'` mit `read` und `write` ins Projekt existiert (`teamChatShareExistsSql`). Angelegt wird sie im Composer über „Für das Team“ (`teamShared` in `threads.create`, Standard an in Team-Projekten, Thread und Freigabe in einer Transaktion, `threadsContractRouter.ts`); die Thread-Liste meldet `teamShared`.

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

## Mobile

Gleiche Struktur wie Web: `Übersicht` (`ProjectChatComposer`, `ProjectChatList`, `ProjectInstructionsCard`, `ProjectKnowledgeList`, `ProjectLinks`, `ProjectMembersPreview`) und `Austausch` (nur Team- und System-Projekt, `GroupFeedCard`, `GroupCommentsSheet`). Menüs bauen `shareMenu.ts`, `addMenu.ts`, `knowledgeMenu.ts`, `moderationMenu.ts` (Melden, Person ausblenden). Offene Parität zu Web: Beiträge werden in der App über die Zeile oben im Austausch bzw. „+“ geschrieben; nicht alle Erstell- und Bearbeitungsfunktionen sind gleich.

## Gezielte Prüfung

Am 01.10.2026 erfolgreich: 51 Tests in `groupFeed.vitest.ts`, `groupPosts.vitest.ts`, `groupActivityNotifications.vitest.ts`, `groupNotifications.vitest.ts` (API) sowie 37 Tests in `feed.vitest.ts` und `groupMentions.vitest.ts` (shared). Das prüft Logik mit Test-Abhängigkeiten; kein Nachweis eines Live-Datenbank-, Upload- oder UI-End-to-End-Laufs.
