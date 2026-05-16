# Plan: Self-Hosted Nango — Connected Accounts (Backend-First)

## Context

Gruenerator braucht OAuth-basierte Connectoren für externe Cloud-Dienste, damit Nutzer\*innen Dateien und Dokumente durchsuchen und importieren können. Wir hosten **Nango** (Elastic License v2) als Connector-Middleware auf unseren EU-Servern.

**Scope dieser Phase:** Infrastruktur + Backend + 5 Provider-Gruppen in Nango konfiguriert. **Kein Frontend-UI** — die Verbindungen werden zunächst über das Nango Dashboard und die API verwaltet. Frontend folgt später.

**Keine Teams-/Chat-Nachrichten** — nur Dateizugriff, um DSGVO-Probleme mit Drittdaten zu vermeiden.

## Provider (5 Gruppen, 8 Dienste)

| #   | Provider                          | OAuth                                          | Scopes (read-only)                                             |
| --- | --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| 1   | **Google Drive**                  | Google OAuth                                   | `drive.readonly`, `userinfo.email`                             |
| 2   | **Google Docs/Sheets**            | (selber Google OAuth)                          | `docs.readonly`, `sheets.readonly`                             |
| 3   | **Microsoft OneDrive**            | Azure AD OAuth                                 | `Files.Read`, `User.Read`                                      |
| 4   | **Microsoft SharePoint**          | (selber Azure AD OAuth)                        | `Sites.Read.All`                                               |
| 5   | **Microsoft Teams (nur Dateien)** | (selber Azure AD OAuth)                        | `Team.ReadBasic.All`                                           |
| 6   | **Jira Cloud**                    | Atlassian OAuth 2.0 (3LO)                      | `read:jira-work`, `read:jira-user`                             |
| 7   | **Confluence Cloud**              | (selber Atlassian OAuth)                       | `read:confluence-content.all`, `read:confluence-space.summary` |
| 8   | **WebDAV (generisch)**            | Kein OAuth — Nutzer\*in gibt URL + Credentials | Kein Nango — eigener Adapter basierend auf Wolke-Client        |

> Google = 1 OAuth-App. Microsoft = 1 OAuth-App. Atlassian = 1 OAuth-App (deckt Jira + Confluence). WebDAV = kein OAuth. **3 OAuth-Registrierungen + 1 Credentials-basierter Adapter.**

## Architektur

```
Nango (Docker, self-hosted)          API Backend
┌──────────────────────────┐         ┌────────────────────────┐
│ OAuth Token Management   │◄────────│ @nangohq/node SDK      │
│ Automatic Token Refresh  │         │ ConnectionService      │
│ 250+ Provider Templates  │────────►│ Provider API Clients   │
│ Encrypted Token Storage  │         │ /api/connections/*     │
│ Connect UI (Dashboard)   │         └────────────────────────┘
└──────────────────────────┘
  nango.gruenerator.eu                intern (http://nango:3003)
```

---

## Phase 1: Infrastruktur

### 1.1 `services/nango/.env.example`

```env
NANGO_DB_HOST=host.docker.internal
NANGO_DB_PORT=5432
NANGO_DB_USER=gruenerator
NANGO_DB_PASSWORD=gruenerator
NANGO_DB_NAME=nango
NANGO_REDIS_URL=redis://redis:6379/1
NANGO_SERVER_URL=https://nango.gruenerator.eu
NANGO_ENCRYPTION_KEY=  # openssl rand -base64 32
NANGO_SECRET_KEY=      # aus Nango Dashboard nach erstem Start
NANGO_PUBLIC_KEY=      # aus Nango Dashboard nach erstem Start
TELEMETRY=false
FLAG_SERVE_CONNECT_UI=true
SERVER_PORT=3003
NANGO_CONNECT_UI_PORT=3009
```

### 1.2 Postgres-Datenbank (einmalig)

```sql
CREATE DATABASE nango;
GRANT ALL PRIVILEGES ON DATABASE nango TO gruenerator;
```

### 1.3 `docker-compose.prod.yml` — Nango Service

Nach `ocr`-Service einfügen:

```yaml
nango:
  image: nangohq/nango-server:0.48.1
  restart: unless-stopped
  depends_on:
    redis:
      condition: service_healthy
  environment:
    - NANGO_DB_HOST=host.docker.internal
    - NANGO_DB_PORT=5432
    - NANGO_DB_USER=${POSTGRES_USER}
    - NANGO_DB_PASSWORD=${POSTGRES_PASSWORD}
    - NANGO_DB_NAME=nango
    - NANGO_REDIS_URL=redis://redis:6379/1
    - NANGO_SERVER_URL=${NANGO_PUBLIC_URL}
    - NANGO_ENCRYPTION_KEY=${NANGO_ENCRYPTION_KEY}
    - NANGO_SECRET_KEY=${NANGO_SECRET_KEY}
    - FLAG_SERVE_CONNECT_UI=true
    - SERVER_PORT=3003
    - NANGO_CONNECT_UI_PORT=3009
    - TELEMETRY=false
  networks:
    - gruenerator
  extra_hosts:
    - 'host.docker.internal:host-gateway'
  labels:
    - 'com.gruenerator.service=nango'
  healthcheck:
    test: ['CMD', 'curl', '-f', 'http://localhost:3003/health']
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
```

### 1.4 `nginx.conf` — Subdomain-Routing

Server-Block nach `mcp.*`:

```nginx
    # Nango subdomain — OAuth Connector Service (Dashboard + API)
    server {
        listen 80;
        server_name ~^nango\.;

        location /nginx-health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        location / {
            set $upstream_nango http://nango:3003;
            proxy_pass $upstream_nango;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        }
    }
```

### 1.5 `services/nango/README.md`

Setup-Anleitung: DB erstellen, Env-Vars setzen, Container starten, Dashboard aufrufen.

---

## Phase 1b: Salt Deployment

Nango folgt dem **`ocr`-Pattern**: Pre-built Image, kein Custom GHCR Build.

### 1b.1 Passbolt-Einträge anlegen (manuell)

| Secret                 | Zweck                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| `NANGO_ENCRYPTION_KEY` | AES-256 Key für Token-Verschlüsselung (`openssl rand -base64 32`) |
| `NANGO_SECRET_KEY`     | API Secret Key (aus Nango Dashboard nach erstem Start)            |

### 1b.2 `Salt/pillars/gruenerator/prod.sls` + `test.sls`

```yaml
nango-encryption-key: <passbolt-uuid>
nango-secret-key: <passbolt-uuid>
```

### 1b.3 `Salt/pillars/letsencrypt/.../gruenerator.sls`

`nango.gruenerator.eu` zur Domain-Liste hinzufügen. Ebenso `nango.beta.gruenerator.eu` in `gruenerator-test.sls`.

### 1b.4 `Salt/states/gruenerator-docker/files/docker-compose.yml.j2`

Nango-Service nach `ocr` einfügen:

```yaml
nango:
  image: nangohq/nango-server:0.48.1
  restart: unless-stopped
  depends_on:
    redis:
      condition: service_healthy
  environment:
    - NANGO_DB_HOST=host.docker.internal
    - NANGO_DB_PORT=5432
    - NANGO_DB_USER={{ pillar["gruenerator"]["postgres-user"] }}
    - NANGO_DB_PASSWORD={{ pillar["passbolt"][pillar["gruenerator"]["postgres-password"]] }}
    - NANGO_DB_NAME=nango
    - NANGO_REDIS_URL=redis://redis:6379/1
    - NANGO_SERVER_URL=https://nango.{{ pillar["gruenerator"]["domain"] }}
    - NANGO_ENCRYPTION_KEY={{ pillar["passbolt"][pillar["gruenerator"]["nango-encryption-key"]] }}
    - NANGO_SECRET_KEY={{ pillar["passbolt"][pillar["gruenerator"]["nango-secret-key"]] }}
    - FLAG_SERVE_CONNECT_UI=true
    - SERVER_PORT=3003
    - NANGO_CONNECT_UI_PORT=3009
    - TELEMETRY=false
  networks:
    - gruenerator
  extra_hosts:
    - 'host.docker.internal:host-gateway'
  labels:
    - 'com.gruenerator.service=nango'
  healthcheck:
    test: ['CMD', 'curl', '-f', 'http://localhost:3003/health']
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
```

### 1b.5 `Salt/states/gruenerator-docker/files/nginx.conf.j2`

Server-Block nach `mcp.*`:

```nginx
    server {
        listen 80;
        server_name nango.{{ pillar["gruenerator"]["domain"] }};

        location /nginx-health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        location / {
            set $upstream_nango http://nango:3003;
            proxy_pass $upstream_nango;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        }
    }
```

### 1b.6 `Salt/states/gruenerator-docker/files/backend.env.j2`

```
# Nango (Connected Accounts)
NANGO_SERVER_URL=http://nango:3003
NANGO_PUBLIC_URL=https://nango.{{ pillar["gruenerator"]["domain"] }}
NANGO_SECRET_KEY={{ pillar["passbolt"][pillar["gruenerator"]["nango-secret-key"]] }}
NANGO_ENCRYPTION_KEY={{ pillar["passbolt"][pillar["gruenerator"]["nango-encryption-key"]] }}
```

### 1b.7 Postgres-Datenbank (einmalig pro Umgebung)

```sql
CREATE DATABASE nango;
GRANT ALL PRIVILEGES ON DATABASE nango TO gruenerator;
```

### 1b.8 Deployment-Reihenfolge

```
1. Passbolt: Secrets anlegen (NANGO_ENCRYPTION_KEY, placeholder für SECRET_KEY)
2. Salt-Repo: Pillar + Templates committen + pushen
3. Postgres: CREATE DATABASE nango
4. Salt: state.apply auf Test-Server → Container startet
5. Nango Dashboard: Erstzugang, echten SECRET_KEY generieren → in Passbolt aktualisieren
6. Salt: erneut state.apply mit aktualisierten Secrets
7. OAuth Apps registrieren (Google, Microsoft, Atlassian)
8. Nango Dashboard: Integrationen konfigurieren
```

---

## Phase 2: Provider-Konfiguration (Nango Dashboard)

Nach erstem Start `nango.gruenerator.eu` aufrufen.

### 2.1 OAuth-App-Registrierungen

| App       | Console                                                                        | Redirect URI                                  |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Google    | [Google Cloud Console](https://console.cloud.google.com)                       | `https://nango.gruenerator.eu/oauth/callback` |
| Microsoft | [Azure Portal](https://portal.azure.com) → App Registration                    | `https://nango.gruenerator.eu/oauth/callback` |
| Atlassian | [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) | `https://nango.gruenerator.eu/oauth/callback` |

### 2.2 Integrationen im Nango Dashboard

| Integration Key | Provider               | Scopes                                                                 |
| --------------- | ---------------------- | ---------------------------------------------------------------------- |
| `google`        | Google                 | `drive.readonly`, `docs.readonly`, `sheets.readonly`, `userinfo.email` |
| `microsoft`     | Microsoft              | `Files.Read`, `Sites.Read.All`, `Team.ReadBasic.All`, `User.Read`      |
| `jira`          | Atlassian (Jira)       | `read:jira-work`, `read:jira-user`                                     |
| `confluence`    | Atlassian (Confluence) | `read:confluence-content.all`, `read:confluence-space.summary`         |

> Kein `ChannelMessage.Read.All` bei Microsoft — bewusste DSGVO-Entscheidung.
> Atlassian: Eine App-Registration, aber separate Nango-Integrationen für Jira und Confluence (unterschiedliche Scopes).

### 2.3 WebDAV (ohne Nango)

WebDAV läuft nicht über Nango (kein OAuth), sondern als eigener Adapter basierend auf dem bestehenden Wolke/Nextcloud WebDAV-Client. Nutzer\*innen geben Server-URL + Benutzername + App-Password ein.

Unterstützt automatisch: **ownCloud**, **Seafile**, **HiDrive**, **Uni-Clouds**, und jede andere WebDAV-Instanz.

---

## Phase 3: API-Backend

### 3.1 SDK installieren

```bash
cd apps/api && pnpm add @nangohq/node
```

### 3.2 `apps/api/config/nango.ts`

```typescript
import { Nango } from '@nangohq/node';

export const nango = new Nango({
  host: process.env.NANGO_SERVER_URL || 'http://nango:3003',
  secretKey: process.env.NANGO_SECRET_KEY || '',
});
```

### 3.3 `apps/api/services/connections/ConnectionService.ts`

Generischer Service, der Nango SDK wrappet:

- `listConnections(userId)` → alle aktiven Verbindungen
- `getConnection(userId, providerKey)` → Verbindung mit frischem Token
- `deleteConnection(userId, providerKey)` → trennen + revoken
- `getStatus(userId)` → Status aller konfigurierten Provider
- `createSessionToken(userId)` → Nango Session Token (für späteres Frontend)

`connectionId` = `userId` (1:1 Mapping).

### 3.4 `apps/api/routes/connections/connectionsController.ts`

Endpoints:

```
GET    /api/connections              → alle Verbindungen
GET    /api/connections/status       → Provider-Statusübersicht
POST   /api/connections/session-token → Nango Session Token
DELETE /api/connections/:providerKey → trennen + revoken
GET    /api/connections/:providerKey/files         → Dateien auflisten
GET    /api/connections/:providerKey/files/:fileId → Datei-Inhalt lesen
```

### 3.5 Provider API-Clients

**`apps/api/services/api-clients/googleDriveClient.ts`**

- `listFiles(token, folderId?)`, `getFile(token, fileId)`, `downloadFile(token, fileId)`
- `exportDoc(token, docId, mimeType)`, `searchFiles(token, query)`

**`apps/api/services/api-clients/microsoftGraphClient.ts`**

- `listDriveItems(token, folderId?)`, `getDriveItem(token, itemId)`, `downloadDriveItem(token, itemId)`
- `listSharePointSites(token)`, `listTeamsDriveItems(token, teamId)`

**`apps/api/services/api-clients/atlassianClient.ts`**

- Jira: `listProjects(token)`, `listIssues(token, projectKey, query?)`, `getIssue(token, issueKey)`, `getIssueAttachments(token, issueKey)`
- Confluence: `listSpaces(token)`, `listPages(token, spaceKey)`, `getPageContent(token, pageId)`, `searchContent(token, query)`

**`apps/api/services/api-clients/webdavClient.ts`**

- Generischer WebDAV-Adapter, extrahiert aus `nextcloudApiClient.ts`
- `listFiles(credentials, path?)`, `downloadFile(credentials, path)`, `getFileInfo(credentials, path)`
- `testConnection(credentials)` — PROPFIND-Probe
- Nutzt Basic Auth (Benutzername + App-Password) statt OAuth
- Deckt ab: ownCloud, Seafile, HiDrive, Uni-Clouds, beliebige WebDAV-Server

Pattern: Google/Microsoft/Atlassian nutzen Nango-Tokens. WebDAV nutzt eigene Credentials (verschlüsselt in DB, wie Wolke).

### 3.6 Routes registrieren

**Ändern:** `apps/api/routes.ts`

```typescript
import connectionsRouter from './routes/connections/connectionsController.js';
app.use('/api/connections', requireAuth, connectionsRouter);
```

### 3.7 `.env.example` ergänzen

```env
# Nango (Connected Accounts)
NANGO_SERVER_URL=http://nango:3003
NANGO_PUBLIC_URL=https://nango.gruenerator.eu
NANGO_SECRET_KEY=
NANGO_PUBLIC_KEY=
NANGO_ENCRYPTION_KEY=
```

---

## Phase 4: DSGVO

### 4.1 Technische Maßnahmen

- **Minimale Scopes**: Nur read-only
- **Keine Kommunikationsinhalte**: Kein Zugriff auf E-Mails, Chat-Nachrichten, Kalender
- **Keine Datenspeicherung**: Dateiinhalte transient im RAM, nie in DB oder Qdrant
- **Kein Background-Sync**: Nur nutzerinitiierter Zugriff
- **Verschlüsselung**: AES-256 für Tokens in Nango
- **Audit-Log**: Connect/Disconnect Events (Zeitstempel + userId + Provider + Scopes)
- **Disconnect = Revoke**: Token beim Provider widerrufen + aus Nango löschen

### 4.2 Datenschutzerklärung — 4 neue Abschnitte

#### 1. Verknüpfte Konten (Connected Accounts)

> Unsere Plattform bietet Ihnen die Möglichkeit, Ihr Google-Workspace-Konto
> (Google Drive, Google Docs, Google Sheets), Ihr Microsoft-365-Konto
> (OneDrive, SharePoint), Ihr Atlassian-Konto (Jira, Confluence) und/oder
> einen beliebigen WebDAV-Server (ownCloud, Seafile u.a.) mit Ihrem
> Grünerator-Konto zu verknüpfen. Diese Verknüpfung erfolgt ausschließlich
> auf Ihre aktive Veranlassung hin und ist für die Nutzung der Plattform
> nicht erforderlich.
>
> **Rechtsgrundlage:** Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch aktiven
> OAuth-Verbindungsvorgang)
>
> **Verarbeitete Daten:**
>
> - OAuth-Zugangsdaten (Access-Token und Refresh-Token)
> - Metadaten der abgerufenen Dateien (Dateiname, Dateityp, Änderungsdatum)
> - Dateiinhalte der von Ihnen ausgewählten Dokumente (nur transient)
>
> **Speicherung:**
>
> - OAuth-Tokens: verschlüsselt (AES-256) auf EU-Servern
> - Dateiinhalte: keine dauerhafte Speicherung
> - Keine automatische Hintergrundsynchronisation
>
> **Widerruf:** Jederzeit in den Kontoeinstellungen. Bei Trennung werden Tokens
> gelöscht und Zugriffsberechtigungen beim Anbieter widerrufen.

#### 2. Datenübermittlung an Drittländer

> Beim Abruf von Dateien über die APIs von Google LLC, Microsoft Corporation
> und Atlassian Pty Ltd können personenbezogene Daten (Authentifizierungsdaten,
> IP-Adresse) an Server dieser Anbieter übermittelt werden.
> Bei WebDAV-Verbindungen erfolgt die Datenübermittlung direkt an den von
> Ihnen angegebenen Server.
>
> **Grundlage:** EU-U.S. Data Privacy Framework (Art. 45 DSGVO),
> Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO), sowie die
> Auftragsverarbeitungsvereinbarungen (DPAs) der jeweiligen Anbieter.
>
> **Restrisiko-Hinweis:** Bei Nutzung US-amerikanischer Dienste besteht ein
> Restrisiko hinsichtlich des Zugriffs durch US-Behörden. Sie können dieses
> Risiko vermeiden, indem Sie die Verknüpfung nicht aktivieren oder jederzeit
> wieder trennen.

#### 3. Nango (OAuth-Middleware)

> Für die Verwaltung der OAuth-Verbindungen setzen wir Nango ein, eine
> Open-Source-Software, die wir selbst auf EU-Servern betreiben (Self-Hosting).
> Es findet keine Datenübermittlung an Nango Labs, Inc. statt.
> Nango verarbeitet: OAuth-Tokens (verschlüsselt), Verbindungsmetadaten
> (Zeitpunkt, Anbieter, Status).

#### 4. Nur Lesezugriff — kein Zugriff auf Kommunikationsinhalte

> Wir fordern ausschließlich Lesezugriff auf Dateien und Dokumente an.
> Es erfolgt kein Zugriff auf E-Mails, Chat-Nachrichten, Kalendereinträge
> oder sonstige Kommunikationsinhalte.

### 4.3 Verarbeitungsverzeichnis (Art. 30 DSGVO)

Neue Einträge pro Provider:

| Feld                       | Wert (pro Provider anpassen)                                       |
| -------------------------- | ------------------------------------------------------------------ |
| **Verarbeitungstätigkeit** | Connected Account — [Provider]                                     |
| **Zweck**                  | Lesezugriff auf Cloud-Dokumente für KI-gestützte Inhaltserstellung |
| **Rechtsgrundlage**        | Art. 6 Abs. 1 lit. a DSGVO                                         |
| **Betroffene**             | Registrierte Nutzer\*innen                                         |
| **Datenkategorien**        | OAuth-Tokens, Dateimetadaten, Dateiinhalte (transient)             |
| **Empfänger**              | [Provider] (API-Zugriff)                                           |
| **Drittlandtransfer**      | USA (DPF, SCCs, DPA)                                               |
| **Löschfristen**           | Tokens: bei Kontotrennung; Dateiinhalte: keine Speicherung         |
| **TOM**                    | AES-256, EU-Hosting, Read-only Scopes, kein Background-Sync        |

### 4.4 DSFA

**Nicht erforderlich** bei aktuellem Scope (eigene Dateien, Einwilligung, read-only, transient). Begründung dokumentieren.

### 4.5 Checkliste vor Launch

**Pflicht:**

- [ ] Datenschutzerklärung aktualisieren (4 Abschnitte)
- [ ] Verarbeitungsverzeichnis aktualisieren (4 Einträge: Google, Microsoft, Atlassian, WebDAV)
- [ ] Disconnect/Revoke-Flow testen
- [ ] Hosting-Provider DPA deckt Nango-DB ab

**Empfohlen:**

- [ ] Datenschutzbeauftragte\*n informieren
- [ ] Consent-Events loggen
- [ ] DSFA-Nicht-Erforderlichkeit dokumentieren

---

## Dateiübersicht

### Neue Dateien (~9)

- `services/nango/.env.example`
- `services/nango/README.md`
- `apps/api/config/nango.ts`
- `apps/api/services/connections/ConnectionService.ts`
- `apps/api/services/api-clients/googleDriveClient.ts`
- `apps/api/services/api-clients/microsoftGraphClient.ts`
- `apps/api/services/api-clients/atlassianClient.ts`
- `apps/api/services/api-clients/webdavClient.ts`
- `apps/api/routes/connections/connectionsController.ts`

### Gruenerator-Repo — Geänderte Dateien (~4)

- `docker-compose.prod.yml` — Nango Service (lokale Dev-Referenz)
- `nginx.conf` — nango.\* Server-Block (lokale Dev-Referenz)
- `apps/api/routes.ts` — /api/connections registrieren
- `.env.example` — NANGO\_\* Variablen

### Salt-Repo — Geänderte Dateien (~6)

- `states/gruenerator-docker/files/docker-compose.yml.j2` — Nango Service
- `states/gruenerator-docker/files/nginx.conf.j2` — nango.\* Server-Block
- `states/gruenerator-docker/files/backend.env.j2` — NANGO\_\* Env-Vars
- `pillars/gruenerator/prod.sls` — Nango Passbolt-UUIDs
- `pillars/gruenerator/test.sls` — Nango Passbolt-UUIDs (Test)
- `pillars/letsencrypt/.../gruenerator.sls` — nango.gruenerator.eu Domain

### Bestehender Code als Vorlage

- `apps/api/services/api-clients/nextcloudApiClient.ts` — WebDAV-Client extrahieren
- `ocr`-Service in `docker-compose.yml.j2` — Pattern für pre-built Images
- `mcp`-Server-Block in `nginx.conf.j2` — Pattern für Subdomain-Routing

---

## Verifizierung

1. **Docker**: `docker compose -f docker-compose.prod.yml up nango` → Healthcheck auf `:3003/health`
2. **Dashboard**: `nango.gruenerator.eu` → Provider konfigurieren (Google, Microsoft, Atlassian)
3. **API**: `GET /api/connections/status` → Provider-Liste mit `disconnected`
4. **OAuth**: Verbindung über Nango Dashboard testen → `GET /api/connections/status` zeigt `connected`
5. **Dateien**: `GET /api/connections/google/files` → Google Drive Root-Dateien
6. **Trennen**: `DELETE /api/connections/google` → Token revoked
7. **Typecheck**: `npx tsc --noEmit --project apps/api/tsconfig.json`

---

## Späteres Frontend (Phase 2)

Wenn die Backend-API steht und getestet ist:

- `@nangohq/frontend` SDK in `apps/web`
- "Verbindungen"-Tab im Profil (`/profile/verbindungen`)
- Pre-OAuth Info-Screen (DSGVO)
- ProviderCard-Komponenten mit Connect/Disconnect

## Spätere Provider

| Provider            | Aufwand   | Nango-Template vorhanden    |
| ------------------- | --------- | --------------------------- |
| Dropbox             | ~1 Tag    | Ja                          |
| Box                 | ~1 Tag    | Ja                          |
| Slack (nur Dateien) | ~1 Tag    | Ja                          |
| Notion              | ~1 Tag    | Ja                          |
| Google Calendar     | ~0.5 Tage | Ja (selber OAuth)           |
| Trello              | ~0.5 Tage | Ja (selber Atlassian OAuth) |
