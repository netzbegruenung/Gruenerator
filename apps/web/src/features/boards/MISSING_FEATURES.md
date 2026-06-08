# Board — verbleibende Feature-Lücken

Vergleich unseres Boards mit **kanbn/kan**, **plankanban/planka**, **wekan**, **focalboard** (mattermost) und **opf/openproject**. Branch `feat/board-card-features` (abgezweigt von der Board-AI-PR #1184). Quell-Repos liegen unter `~/github-inspirationen/`.

Das Dokument hat **zwei Teile**:

- **Teil A — Board- & Projekt-Übersicht** (NEU): Features auf Ebene des _ganzen Boards_ bzw. _mehrerer Boards/Projekte_ — nicht die einzelne Karte.
- **Teil B — Karten-Features**: Lücken auf Ebene der _einzelnen Aufgabe_.

Die **8 großen Karten-Lücken** sind in diesem Branch bereits umgesetzt (Multiple Assignees, Checklisten, Archivieren, Duplizieren, Datei-Anhänge, Aktivitätslog, Watcher/Benachrichtigungen inkl. Fälligkeits-Reminder, Rich-Text-Beschreibung) — inkl. AI-Ops, Board-Preview-Badges, ⋯-Aktionsmenü und Cover-Bild.

**Was wir auf Board-Ebene schon haben** (zur Abgrenzung): Board-Liste im Workplace · Board archivieren/löschen/umbenennen · 5 View-Layouts (Kanban/Tabelle/Liste/Kalender/Gantt) + Whiteboard · mehrere Views pro Board · pro-View Filter/Sortierung/Gruppierung (1-dimensional) · Filterleiste · Rollen Owner/Editor/Viewer · Einladen + Public/Authenticated/Private + Gruppen-Sharing + Share-Link · Spalten hinzufügen/umbenennen/löschen/färben · Board-Vorlagen (4 Stück) + „als Vorlage speichern" · Echtzeit-Kollaboration (Yjs) + Presence-Avatare + Spalten-Awareness · Karten-Aktivitätsfeed (relational).

---

# Teil A — Board- & Projekt-Übersicht

## 🔴 Hoch wichtig

| #   | Feature                                        | Quelle                          | Notiz / Umsetzungsskizze                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | **Board favorisieren / anpinnen**              | kan, planka, openproject        | Sterne-Toggle in Board-Liste + Header. Relationale Mini-Tabelle `board_favorites(user_id, board_id)` (Comments-Muster) oder Flag in der Workplace-Liste; Sortierung „Favoriten zuerst".                                                                                  |
| A2  | **Board duplizieren / klonen**                 | kan, wekan, planka, openproject | Ganzes Board kopieren (Felder, Views, Spalten, Karten — _ohne_ relationale Tails). Yjs-Doc serverseitig klonen + neues `collaborative_documents`-Row. Wir haben bereits `duplicateRow` pro Karte; hier die Board-Doc-Ebene. ⋯-Menü in der Board-Liste + `BoardDropdown`. |
| A3  | **Board-Beschreibung**                         | wekan, focalboard, kan, planka  | Markdown-Beschreibung pro Board (z. B. Ziel/Briefing). Feld in `collaborative_documents.content` + Anzeige im Header/Info-Panel. Wir haben `CardDescription` (Markdown on blur) — Komponente wiederverwenden.                                                            |
| A4  | **Schnellfilter-Presets**                      | planka, kan, wekan              | Buttons „Meine Aufgaben", „Überfällig", „Ohne Zuständige", „Nach Label" über der bestehenden Filter-Engine (`useViewData`). Kein neuer Speicher nötig — Presets setzen vordefinierte Filterregeln.                                                                       |
| A5  | **Volltext-Suche im Board**                    | wekan, focalboard               | Suchfeld in der `ViewToolbar`, filtert Titel/Beschreibung live über alle Layouts (`useViewData`). Aktuell gibt es nur die regelbasierte Filterleiste, keine freie Suche.                                                                                                 |
| A6  | **WIP-Limits pro Spalte**                      | wekan, kan, (trello)            | Optionales Kartenlimit je Status-Spalte; Badge „4/5" + Warn-Highlight bei Überschreitung. `limit?: number` an der SelectOption des Status-Felds; Zähl-Logik im `ColumnHeader`/`PlannerKanban`.                                                                           |
| A7  | **Spalten per Drag-&-Drop neu anordnen**       | alle                            | Status-Optionen umsortieren = Spaltenreihenfolge. Aktuell fix durch Options-Reihenfolge, keine Drag-Reorder-UI. Reorder der `typeOptions.options` im Status-Feld + dnd im `PlannerKanban`-Header.                                                                        |
| A8  | **Board-weiter Aktivitätsfeed**                | wekan, planka, openproject      | Board-Übersicht „Wer hat was getan" (Karte X archiviert, Spalte umbenannt, …). Wir haben bereits `board_card_activity` relational — Board-Feed = Aggregat ohne `card_id`-Filter + Board-Events. Drawer/Tab im Header.                                                    |
| A9  | **Ganzes Board beobachten + Benachrichtigung** | planka                          | `BoardSubscription` (analog zu unserem `cardSubscriptionService`) — Board abonnieren statt nur einzelne Karten; Fan-out über die vorhandene Notification-Pipeline. „Board beobachten"-Toggle im Header.                                                                  |
| A10 | **Custom-Fields-Verwaltung (UI)**              | focalboard, planka, openproject | Felder im Board anlegen/bearbeiten/löschen (Text/Zahl/Select/Datum/Person/Checkbox/URL). Datenmodell (Yjs-`fields`) trägt das schon — es fehlt die Verwaltungs-UI. Größter struktureller Hebel; aktuell nur fixer Feldsatz.                                              |
| A11 | **Export (CSV) + Druckansicht**                | wekan, openproject, focalboard  | Sichtbare View als CSV exportieren (Spalten = Felder) + druckfreundliche Ansicht. Client-seitig aus `useViewData`-Rows. (wekan zusätzlich JSON/PDF/Excel.)                                                                                                               |
| A12 | **Echte Swimlanes (2D-Gruppierung)**           | wekan, focalboard               | Zeilen-Gruppierung _zusätzlich_ zur Spalten-Gruppierung → Raster (z. B. Zeilen = Zuständige, Spalten = Status). Aktuell nur 1-dimensionale Gruppierung. `swimlaneFieldId` an der View + 2D-Layout im `PlannerKanban`.                                                    |

---

## 🟡 Mittel wichtig

| #   | Feature                                          | Quelle                     | Notiz / Umsetzungsskizze                                                                                                                                                                                         |
| --- | ------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A13 | **Board-Hintergrund / Farbe / Gradient**         | planka, wekan              | Optisches Board-Theming. planka: 25 benannte Gradienten + Upload-Bild; wekan: Farbe + Bild. Feld am Board; im Header/Workplace-Kachel rendern.                                                                   |
| A14 | **Karte auf anderes Board verschieben/kopieren** | planka, wekan, focalboard  | Cross-Board-Transfer inkl. Daten-Migration (Labels per Name matchen, relationale Tails umhängen/kopieren). Siehe auch Teil B #11.                                                                                |
| A15 | **Action-Boards (Drag ändert Attribut)**         | openproject                | Gruppierung nach _beliebigem_ Feld → Drop in andere Lane setzt dieses Feld (Zuständige/Version/Parent), nicht nur Status. Wir setzen beim Drop schon das `groupByFieldId`-Feld — generisch dokumentieren/testen. |
| A16 | **Mehrfachauswahl + Bulk-Edit**                  | openproject, wekan         | Mehrere Karten markieren → gemeinsam Status/Label/Zuständige ändern, archivieren, löschen. Auswahl-State im Board + Bulk-Aktionsleiste.                                                                          |
| A17 | **Karten-Beziehungen / Abhängigkeiten**          | openproject, planka        | „blockiert / hängt ab von / verbunden mit / Vorgänger-Nachfolger". Relationale Tabelle `card_relations`; im Gantt als Verbindungslinien, im Panel als Beziehungs-Sektion.                                        |
| A18 | **Gantt: Meilensteine + Abhängigkeitslinien**    | openproject                | Meilenstein-Kartentyp (Raute) + Abhängigkeits-Pfeile (baut auf A17). Aktuell Gantt nur mit Start/Ende-Balken, ohne Verknüpfungen.                                                                                |
| A19 | **Parent-Child / Subtasks als eigene Karten**    | openproject                | Echte Karten-Hierarchie (Karte hat Unter-Karten) statt nur Checklisten. `parentCardId` an der Row; Einrückung in Tabelle/Liste, Hierarchie-Modus.                                                                |
| A20 | **Summen-/Totals-Zeile (Tabellen-View)**         | openproject, focalboard    | Spalten-Berechnungen (Summe/Anzahl/Ø) unter der Tabelle, z. B. Σ Aufwand, Anzahl pro Status. `calculations` je Feld im `BoardTableView`.                                                                         |
| A21 | **Trello-/CSV-Import**                           | planka, kan, wekan         | Board aus Trello-Export oder CSV anlegen (Listen→Spalten, Karten, Labels per Farbe matchen). planka hat fertige `import-from-trello`-Logik als Vorlage.                                                          |
| A22 | **Spalte ausblenden / archivieren**              | wekan                      | Status-Spalte verbergen ohne die Option zu löschen (Karten bleiben erhalten). `hidden?`-Flag an der SelectOption; Filter in `useViewData`/`PlannerKanban`.                                                       |
| A23 | **Granularere Rollen**                           | wekan (8+), focalboard (4) | Über Owner/Editor/Viewer hinaus: „Kommentar-only", „Worker" (nur eigene Karten bewegen/zuweisen), „nur zugewiesene sehen". Erweiterung der `permissions`-JSONB-Level + `checkBoardAccess`.                       |
| A24 | **Ausgehende Webhooks**                          | wekan, planka, kan         | Pro Board konfigurierbare Webhooks bei Karten-Events (created/moved/…); HMAC-Signatur. Relationale `board_webhooks` + Fan-out im jeweiligen Router.                                                              |
| A25 | **Automatisierung / Regeln (Trigger→Aktion)**    | wekan                      | „Wenn Status = X → Label Y setzen / verschieben / Notification". Regel-Engine pro Board (Trigger + Aktion). Größeres Feature; wekan `Rules/Triggers/Actions` als Referenz.                                       |

---

## 🟢 Wenig wichtig / groß & strukturell (Projekt-Ebene)

| #   | Feature                                         | Quelle                   | Notiz                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A26 | **Projekte / Workspaces (Board-Hierarchie)**    | planka, kan, openproject | Boards in Projekte/Workspaces/Ordner gruppieren statt flacher Liste. planka: Projekt→Board; kan: Workspace→Board; openproject: Projekt-Hierarchie mit Unterprojekten. Großer Architektur-Schritt — bei uns am ehesten über das bestehende **Gruppen**-Konzept andockbar. |
| A27 | **Projekt-Übersicht / Widget-Dashboard**        | openproject (overviews)  | Konfigurierbares Dashboard pro Projekt/Board (Mitglieder, Status-Verteilung, News, anstehende Fälligkeiten als Widgets).                                                                                                                                                 |
| A28 | **Team-Planner / Ressourcen-Kapazität**         | openproject              | Zuständige als Zeilen × Zeit als Spalten; Auslastung sichtbar, per Drag (um)planen. Eigene View über vorhandene Assignee-/Datums-Felder.                                                                                                                                 |
| A29 | **Backlog / Sprints / Burndown / Story Points** | openproject (backlogs)   | Agile-Modul: Sprint-Container, Backlog-Buckets, Story-Points-Schätzung, Burndown-Chart, Velocity. Sehr groß; nur falls Scrum-Workflow gewünscht.                                                                                                                         |
| A30 | **Baselines (Snapshot-Vergleich)**              | openproject (Enterprise) | Aktuellen Board-Stand mit gespeichertem Snapshot vergleichen (Was hat sich seit Datum X geändert). Braucht periodische Snapshots.                                                                                                                                        |
| A31 | **Live-Kollaborations-Cursor**                  | (planka/figma-Stil)      | Cursor-Position anderer Nutzer live anzeigen. Wir haben Presence-Avatare + Spalten-Awareness (`useBoardAwareness`), aber keine Cursor-Positionen.                                                                                                                        |
| A32 | **Vorlagen-Galerie erweitern**                  | wekan, focalboard, kan   | Mehr fertige Board-Vorlagen + Vorlagen-Auswahl-Dialog. Wir haben 4 Vorlagen + „als Vorlage speichern"; Galerie-UX ausbaubar.                                                                                                                                             |
| A33 | **Öffentliches Board-Verzeichnis**              | wekan                    | Galerie öffentlicher Boards zum Stöbern/Klonen. Niedrige Priorität für internen Einsatz.                                                                                                                                                                                 |

---

# Teil B — Karten-Features

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
- Vergleichsquellen für **Teil A** (Board-/Projekt-Ebene): `~/github-inspirationen/{kan,planka,wekan,focalboard,openproject}`. Stärkste Inspirationen je Bereich: **openproject** (Action-Boards, Gantt-Abhängigkeiten/Meilensteine, Parent-Child, Team-Planner, Bulk-Edit, Projekt-Hierarchie, Dashboards), **wekan** (Swimlanes, Regeln/Trigger, granulare Rollen, Export-Vielfalt, Board-Klon), **planka** (Projekt→Board-Hierarchie, Gradient-Hintergründe, Board-Subscriptions, Trello-Import), **kan** (Favoriten, Board-Templates/-Klon, Karten-Nr. mit Prefix), **focalboard** (Custom-Property-System, 2D-Group-by, Tabellen-Berechnungen).
- Voller Plan (inkl. der großen Karten-Features): `~/.claude/plans/piped-noodling-nest.md`.
