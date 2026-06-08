# Board — Karten-Features: verbleibende Lücken (mittel & gering)

Vergleich unseres Boards mit kanbn/kan und plankanban/planka, fokussiert auf **Features pro Karte**. Branch `feat/board-card-features` (abgezweigt von der Board-AI-PR #1184).

Die **8 großen Lücken** sind in diesem Branch umgesetzt (Multiple Assignees, Checklisten, Archivieren, Duplizieren, Datei-Anhänge, Aktivitätslog, Watcher/Benachrichtigungen inkl. Fälligkeits-Reminder, Rich-Text-Beschreibung) — inkl. AI-Ops, Board-Preview-Badges, ⋯-Aktionsmenü und Cover-Bild. Dieses Dokument listet nur noch die **mittel- und wenig-wichtigen** Lücken.

---

## 🟡 Mittel wichtig

| #   | Feature                                   | Quelle | Notiz / Umsetzungsskizze                                                                                                         |
| --- | ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | **Zeiterfassung / Stopwatch**             | planka | Start/Pause-Timer pro Karte (`{ startedAt, total }`), Chip im Preview. Yjs-Zelle `field-stopwatch` + Toggle im Panel.            |
| 2   | **Karten-Nummer / Public-ID mit Prefix**  | kan    | Auto-inkrementierende Ticket-Nr. (`PROJ-123`), Prefix pro Board. Counter im Yjs-Doc oder relational; Anzeige in Preview + Panel. |
| 3   | **Subtask-Assignee**                      | planka | Checklisten-Item an Member zuweisen (`ChecklistItem.assigneeId` ergänzen; `doneBy` existiert bereits). MemberPicker je Item.     |
| 4   | **Subtask → Karten-Link (Dependency)**    | planka | `ChecklistItem.linkedCardId`; Klick navigiert zur Karte.                                                                         |
| 5   | **Checkliste „auf Vorderseite zeigen"**   | planka | `ChecklistGroup.showOnFront` / erledigte ausblenden; Preview rendert Items.                                                      |
| 6   | **Custom-Field-Gruppen**                  | planka | Custom Fields in benannte Sektionen bündeln (`fieldGroups` im Board-Schema).                                                     |
| 7   | **Custom Field „auf Vorderseite zeigen"** | planka | `showOnFrontOfCard` pro Feld; Preview rendert ausgewählte Felder.                                                                |
| 8   | **Karten-Typ (project/story)**            | planka | `row.type` mit unterschiedlichem Icon/Layout im Panel.                                                                           |
| 9   | **Due-Date-Completion separat**           | planka | Fälligkeit als „erledigt" markieren, unabhängig vom Status (`row.dueCompleted`).                                                 |
| 10  | **Web-Link-Anhang**                       | planka | Externe URL als Anhang (Favicon/Titel). Anhang-Tabelle um `type: 'file'                                                          | 'link'`+`url`erweitern; UI im bestehenden`CardAttachments`. |
| 11  | **Karte auf anderes Board verschieben**   | planka | Transfer inkl. Daten-Migration (Labels per Name matchen, relationale Tails kopieren/umhängen).                                   |
| 12  | **„Karte schließen" (Closed-State)**      | planka | Boolean-Flag `row.closed` (separat von Archiv); Filter/Badge.                                                                    |
| 13  | **Copy/Cut/Paste von Karten**             | planka | Clipboard-Store; Paste nutzt vorhandenes `duplicateRow`/`addRow`.                                                                |
| 14  | **Karten-Link teilen**                    | kan    | Direktlink `/boards/:id?card=:cardId` in ⋯-Menü kopieren.                                                                        |
| 15  | **E-Mail bei @-Mention**                  | kan    | Mention im Kommentar → `createNotification` ist da; E-Mail-Kanal für `board_user_mentioned` in Preferences aktivieren/prüfen.    |

---

## 🟢 Wenig wichtig / Polish

| #   | Feature                                                                             | Notiz                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Rechtsklick-Kontextmenü** auf Board-Karten (Duplizieren/Archivieren/Löschen)      | Panel-⋯-Menü ist da; `ContextMenu` aus `@gruenerator/ui` auf die Karte legen (Callbacks via PlannerKanban durchreichen).                                        |
| 2   | **„Archivierte anzeigen"-Toggle + Restore-Drawer**                                  | Filter (`useViewData includeArchived`) ist da; Header-Toggle + Liste mit „Wiederherstellen" fehlt (archivierte aktuell nur per KI `restore_task` zurückholbar). |
| 3   | **`commentCount` im Board-Preview** liest noch die veraltete `field-comments`-Zelle | auf echten relationalen Count umstellen (oder Count-Endpoint).                                                                                                  |
| 4   | **Karten-Ersteller sichtbar** im Panel                                              | `createdBy` wird getrackt, aber nicht angezeigt.                                                                                                                |
| 5   | **Größere Label-Palette** (planka: 42 Farben)                                       | aktuell 8 (`LABEL_COLORS`).                                                                                                                                     |
| 6   | **Unified Activity+Comments-Feed**                                                  | Aktivität ist aktuell eine eigene Sektion unter den Kommentaren; kan mischt beides in _einen_ chronologischen Feed (in `CardComments` zusammenführen).          |
| 7   | **Custom-Field-Wert-Anzeige** je Layout                                             | bestehende Custom Fields werden in Tabelle gerendert, aber nicht prominent im Panel.                                                                            |

---

## Hinweise

- Architektur-Referenz für relationale Features: das **Comments-Muster** (Migration → Drizzle → Zod → ts-rest-Contract → Router mit `checkBoardAccess` → `routes.ts` → `contractsClient` → Hook → Komponente). Beispiele in diesem Branch: `boardActivity*`, `boardSubscriptions*`, `boardAttachments*`.
- Voller Plan (inkl. der großen Features): `~/.claude/plans/piped-noodling-nest.md`.
