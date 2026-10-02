# Projekte: Feed, Beiträge und Kommentare

Stand: 01.10.2026. Produktname: **Projekte**; technische IDs, Tabellen und API-Pfade bleiben `groups`.

## Ansichten und gemeinsame Daten

Web: `apps/web/src/features/groups/components/GroupDetailSection.tsx` und `components/feed/`. Mobile: `apps/mobile/app/(focused)/projekte/[id]/index.tsx` und `components/projekte/`.

Team-Projekte (`group_type = 'standard'`) haben **Feed** und **Alle**. Der Feed zeigt angeheftete Einträge zuerst (zuletzt angeheftet oben), danach die neuesten Freigaben. „Alle“ bündelt Inhalte nach Art; leere Abschnitte entfallen. Die Suche durchsucht Titel, Freigabe-Notiz, Kurzbeschreibung, Beitragstext und Dateinamen. Links werden separat dargestellt. Persönliche Projekte (`personal`) zeigen nur „Alle“; eigene Beiträge und neue Kommentare sind dort auch serverseitig ausgeschlossen.

`GET /api/auth/groups/:groupId/content` liefert Buckets samt Freigabe-Metadaten. `packages/shared/src/groups/feed.ts` vereinheitlicht sie mit `toGroupFeedItems`, `sortGroupFeed`, `groupFeedByKind` und `filterGroupFeed` für beide Plattformen. Die Navigation bleibt plattformspezifisch. Nicht jeder teilbare Inhaltstyp hat eine Feed-Karte: Die Darstellung richtet sich nach den tatsächlich konvertierten Buckets, nicht allein nach `groupContentTypeSchema`.

Web bietet den Beitrags-Composer und Mitgliedserwähnungen; Mobile zeigt Beiträge, Dateien und Kommentar-Threads. Daraus folgt keine vollständige Parität der Erstell- und Bearbeitungsfunktionen. `?beitrag=<shareId>` lässt beide Plattformen aus einer Benachrichtigung zum Feed-Eintrag scrollen. Benutzerseitige Projektlinks verwenden `buildGroupSlug` und den stabilen `slug_suffix`; UUID-Links bleiben als Legacy-Fallback auflösbar.

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

Limits aus `packages/contracts/src/schemas/groups.ts`: 3 Anheftungen (die älteste wird verdrängt), 500 Zeichen Freigabe-Notiz, 2.000 Zeichen Kommentar, 5.000 Zeichen Beitrag, 10 Dateien pro Beitrag, 25 MiB je Datei. Dateitypen werden serverseitig gegen die erlaubten Anhänge geprüft.

Kommentare in `group_share_comments` werden chronologisch als flache Liste geliefert und im UI zu Threads aufgebaut. `parent_id` erlaubt genau eine Antwortebene: Antworten auf Antworten hängen am obersten Kommentar. Beim Löschen eines Elternkommentars bleiben Antworten erhalten (`ON DELETE SET NULL`) und werden zu Kommentaren oberster Ebene.

## API und zuständige Dateien

- Contract und Zod: `packages/contracts/src/contracts/groupsContract.ts`, `packages/contracts/src/schemas/groups.ts`.
- ts-rest-Handler: `apps/api/routes/auth/groups/groupsContract/`; die alten `groupCore.ts`/`groupContent.ts` sind keine parallelen CRUD-Handler.
- Multipart-Erstellung: `POST /api/auth/groups/:groupId/posts`, Felder `body` und `files`; Dateizugriff: `GET /api/auth/groups/:groupId/posts/:postId/files/:fileId`. Beide liegen in `routes/auth/groups/groupPosts.ts`; Avatar-Upload bleibt ebenfalls eine separate Express-Route.
- Beitrag ändern/löschen: `PATCH`/`DELETE …/posts/:postId`; Freigabe ändern: `PATCH …/shares/:shareId`; Kommentare: `GET`/`POST …/shares/:shareId/comments`, `DELETE …/shares/:shareId/comments/:commentId`.
- Geschäftslogik: `services/groups/groupPosts.ts`, `groupFeed.ts`, `groupContent.ts`, `groupSharePermissions.ts`; Drizzle: `database/schema/groups.ts`.
- Web-Hooks: `packages/shared/src/groups/useGroups.ts`; JSON-Aufrufe über `getContractsClient()`, Multipart über den API-Client. Mutationen invalidieren die Inhalts-/Kommentar-Queries. Mobile besitzt eigene Hooks in `apps/mobile/hooks/`.
- Migrationen: `zz_20260927_group_feed.sql`, `zz_20260927_system_group.sql`, `zz_20260928_group_posts.sql`, `zz_20260928_group_comment_threads.sql` unter `apps/api/database/postgres/migrations/`.

## Erwähnungen und Benachrichtigungen

Tokens: `@[Name](user:<uuid>)` und `@alle`; Parser/Plaintext-Darstellung in `packages/shared/src/utils/groupMentions.ts`. Web stellt Mitgliedervorschläge in `GroupMentions.tsx` bereit. `services/groups/groupActivityNotifications.ts` bestimmt die Empfänger, `services/notifications/groupNotifications.ts` prüft aktive Mitgliedschaft und stellt zu.

Neue Beiträge benachrichtigen Mitglieder außer der verfassenden Person. Neue Kommentare erreichen die teilende Person und bisherige Kommentierende des Beitrags; Antworten erreichen die teilende Person und Beteiligte des betreffenden Threads. Persönliche Erwähnungen ersetzen für diese Person die Grundmeldung; `@alle` ersetzt die Grundmeldung für alle Mitglieder. Beim Bearbeiten werden nur neu hinzugekommene Erwähnungen gemeldet. Erwähnungen werden in der Glocke separat angezeigt, sonstige Projektmeldungen mit `groupKey = group:<id>` gebündelt. Projekt-Stummschaltung unterdrückt E-Mails, die In-App-Meldungen bleiben erhalten.

Das System-Projekt **„Grünerator“** (`is_system = true`, Zielgruppe `all`) enthält alle Profile über echte Mitgliedschaften. `systemGroup.ts` legt es idempotent beim Boot an, ergänzt fehlende Mitgliedschaften und nimmt neue Profile über den Auth-Hook auf. Mitgliederinformationen bleiben verborgen; Teilen und neue Beiträge sind Instanz-Admins vorbehalten. Mitglieder dürfen kommentieren; `@alle` ist dort nur für Instanz-Admins wirksam, persönliche Erwähnungen erreichen nur ohnehin beteiligte Thread-Personen. System-Projekt-Meldungen bleiben ausschließlich in der App.

Freigaben vorhandener Inhalte verwenden weiterhin `groupContent.ts` und dessen Zugriffsregeln. Private Notebooks und eigene Agents werden beim Teilen auf Gruppenfreigabe umgestellt; eine Rückstellung auf privat muss auch den Gruppenzugriff entziehen. Agenten-Prompts gehören nicht in die Inhaltsantwort. Feed-Darstellung ersetzt keine Zugriffsprüfung der Zielressource.

## Gezielte Prüfung

Am 01.10.2026 erfolgreich: 51 Tests in `groupFeed.vitest.ts`, `groupPosts.vitest.ts`, `groupActivityNotifications.vitest.ts`, `groupNotifications.vitest.ts` (API) sowie 37 Tests in `feed.vitest.ts` und `groupMentions.vitest.ts` (shared). Das prüft Logik mit Test-Abhängigkeiten; kein Nachweis eines Live-Datenbank-, Upload- oder UI-End-to-End-Laufs.
