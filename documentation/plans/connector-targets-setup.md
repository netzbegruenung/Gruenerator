# Teams, Slack, Trello, Mail: Einrichtung außerhalb des Codes

Stand 19.11.2026. Teams und Slack sind Exportziele mit Zielwahl (`GET/POST /api/connections/:provider/targets|send`), Teams zusätzlich Quelle im Cloud-Browser. Trello läuft **nicht** über Nango, sondern als MCP-Server im MCP-Katalog.

Teams und Slack stehen in `ADMIN_ONLY_NANGO_PROVIDERS` (`apps/api/config/nango.ts`), bis beide einmal echt durchgelaufen sind.

## Microsoft Teams (`microsoft-teams`)

- Dieselbe Azure-App wie `microsoft` (Client-ID `ecfb27d3-…`), eigene Nango-Integration mit Vorlage „Microsoft Teams“.
- Scopes: `User.Read Team.ReadBasic.All Channel.ReadBasic.All Files.ReadWrite.All offline_access`. Keiner davon verlangt laut Microsoft eine Admin-Zustimmung (delegiert).
- Nur Dienst- und Schulkonten: `/me/joinedTeams` und `/teams/{id}/channels` sind für private Microsoft-Konten „Not supported“. Darum eine eigene Integration: die Teams-Scopes im Satz von `microsoft` würden das Verbinden privater OneDrive-Konten brechen.
- Organisationen, die die Zustimmung durch Personen nur für verifizierte Herausgeber erlauben, sperren den Grünerator. Dort hilft eine einmalige Admin-Zustimmung: `https://login.microsoftonline.com/<tenant-id>/adminconsent?client_id=ecfb27d3-ae28-4e79-82fd-a924bf19e65d`.

## Slack (`slack`)

- Slack-App „Grünerator“ (Bot `gruenerator`), Redirect `https://nango.gruenerator.eu/oauth/callback`, Bot-Scopes `channels:read groups:read chat:write`.
- Gepostet wird nur in Kanäle, in die jemand den Bot eingeladen hat (`/invite @gruenerator`). `chat:write.public` fragen wir absichtlich nicht an.
- Für andere Workspaces: in der App „Manage Distribution“ → öffentliche Verteilung einschalten (keine Marketplace-Prüfung nötig). Workspace-Admins können Apps vorab freigeben müssen.
- **Nicht** über Slacks MCP-Server: der lässt nur Marketplace-Apps und interne Apps zu und kennt keine dynamische Client-Registrierung.
- Gelesen wird nichts: `conversations.history` ist für Apps außerhalb des Marketplace auf eine Anfrage pro Minute gedrosselt, und die API-Bedingungen verbieten dauerhafte Indexe fremder Organisationen.
- **Die App gehört in ein Grünerator-/netzbegrünung-Konto**, nicht in ein persönliches (die Test-App liegt im Workspace „Personal“).

## Trello (MCP)

- Katalogeintrag in `apps/api/services/mcp/McpRegistryService.ts`: `https://mcp.trello.com/v1`, OAuth über Atlassian mit DCR und PKCE. Keine eigene Trello-App, kein Nango.
- Laut Trello standardmäßig an für Premium und Enterprise; ob kostenlose Arbeitsbereiche Zugriff haben, steht dort nicht.
- Ungeprüft: ob Atlassian bei der Registrierung unsere Redirect-Domain annimmt — zeigt das erste Verbinden.

## Postfächer: Gmail (`google-mail`) und Outlook (`microsoft-mail`)

- Nur lesen, im Cloud-Browser des Chats: oben Ordner bzw. Labels, darunter die neuesten Mails, Suche geht an den Anbieter (`?q=`). Eine gewählte Mail wird erst beim Senden gelesen (`connectRetrieval` → `services/connections/mailBrowse.ts`) und geht mit Kopfzeilen als Material in den Turn. Anhänge werden nicht gelesen.
- Eigene Integrationen neben `google`/`microsoft`: Mail ist eine eigene Zustimmung, bestehende Drive-/OneDrive-Verbindungen bleiben unberührt.
- **Outlook:** Nango-Vorlage `outlook`, dieselbe Azure-App wie `microsoft`, Scopes `User.Read Mail.Read offline_access`. Keine Admin-Zustimmung nötig, auch private Outlook.com-Konten.
- **Gmail:** Nango-Vorlage `google-mail`, vorerst derselbe OAuth-Client wie `google`, Scope `gmail.readonly`. Im Cloud-Projekt muss die Gmail API aktiviert sein. `gmail.readonly` ist ein „restricted scope“: ohne Googles Prüfung (mit externer Sicherheitsbewertung) nur für Testnutzer*innen bzw. mit Warnhinweis und höchstens 100 Personen. Vor einer breiten Freigabe ein eigenes Cloud-Projekt erwägen, damit die laufende Markenprüfung für Drive nicht an der Mail-Prüfung hängt (ungeprüft, ob das nötig ist).
- Beide stehen in `ADMIN_ONLY_NANGO_PROVIDERS`. Die automatische Suche nach Arbeitsaufträgen fürs Tagesbriefing ist Schritt 2 (#5846).

## Nango-Integrationen per Script

Die Secrets müssen niemandem durch die Hände: das Teams-Secret liest man per Nango-API aus der Integration `microsoft` (`GET /integrations/microsoft?include=credentials`) und legt damit `microsoft-teams` an (`POST /integrations`, Scopes kommagetrennt). Das Slack-Secret steht in der App unter „Basic Information“.
