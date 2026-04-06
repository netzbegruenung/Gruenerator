# WordPress-Integration: One Plugin For All

> **Status**: Geplant, noch nicht implementiert (Stand: 2026-04-05)

## Context

Das WordPress-Plugin (`apps/wordpress/`) ist aktuell ein **Sunflower-only** Gutenberg-Block-Plugin (`Requires Themes: sunflower`). Es soll zum universellen Gruenerator-Plugin werden:

1. **Gruenerator-Anbindung** (jedes WP-Theme) — AI-generierte Inhalte als Entwuerfe empfangen
2. **Sunflower-Bloecke** (nur mit Sunflower-Theme) — bestehendes Kandidat\*innen-Landingpage-Feature

**Architektur-Ansatz: Hybrid**

- **Gruenerator API** speichert WP-Site-Verbindungen pro User\*in (wie Nextcloud-Pattern)
- **Gruenerator API** ruft die WordPress REST API auf (`POST /wp-json/wp/v2/posts`) — funktioniert mit JEDEM WordPress
- **WP-Plugin** (optional installiert) bietet Zusatzfeatures: eigener REST-Endpoint mit Gruenerator-Metadaten, Dashboard-Widget fuer Entwuerfe, Feature-Detection (`/wp-json/gruenerator/v1/status`)

---

## Teil A: WordPress-Plugin umbauen

### A.1 Plugin-Header & Conditional Loading

**Modify**: `apps/wordpress/gruenerator.php`

- `Requires Themes: sunflower` entfernen
- Description aendern: "Verbinde deine WordPress-Seite mit dem Gruenerator — AI-generierte Inhalte als Entwuerfe empfangen. Optional: Kandidat\*innen-Landingpages mit dem Sunflower-Theme."
- Sunflower-abhaengige Includes conditional laden:

```php
// Immer laden: Gruenerator-Anbindung
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-api-connection.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-rest-api.php';
require_once GRUENERATOR_PATH . 'includes/class-gruenerator-settings.php';

// Nur mit Sunflower-Theme laden
$theme = wp_get_theme();
$is_sunflower = ($theme->get_template() === 'sunflower' || $theme->get('Name') === 'Sunflower');
if ($is_sunflower) {
    require_once GRUENERATOR_PATH . 'includes/class-gruenerator-customizer.php';
    require_once GRUENERATOR_PATH . 'includes/class-gruenerator-blocks.php';
    require_once GRUENERATOR_PATH . 'includes/class-gruenerator-meta-fields.php';
    // ... Setup-Wizard, Default-Content, Content-Source
}
define('GRUENERATOR_HAS_SUNFLOWER', $is_sunflower);
```

- Admin-Menue anpassen: Gruenerator-Anbindung immer zeigen, Sunflower-Menuepunkte conditional

### A.2 REST API Endpoints (Plugin-seitig)

**New file**: `apps/wordpress/includes/class-gruenerator-rest-api.php`

Registriert Custom REST Endpoints unter `/wp-json/gruenerator/v1/`:

| Method | Endpoint  | Beschreibung                                                      |
| ------ | --------- | ----------------------------------------------------------------- |
| `GET`  | `/status` | Feature-Detection: Plugin-Version, Sunflower aktiv?, Capabilities |
| `POST` | `/drafts` | Entwurf erstellen mit Gruenerator-Metadaten                       |
| `GET`  | `/drafts` | Liste der vom Gruenerator erstellten Entwuerfe                    |

**`POST /drafts`** akzeptiert:

```json
{
  "title": "Pressemitteilung: ...",
  "content": "<p>HTML content...</p>",
  "excerpt": "Kurzbeschreibung",
  "gruenerator_source": "chat|text-generator|docs",
  "gruenerator_id": "optional-thread-or-doc-id"
}
```

Erstellt einen `wp_post` mit `status: 'draft'` und Custom Post Meta:

- `_gruenerator_source` — Herkunft (chat, text-generator, docs)
- `_gruenerator_id` — Referenz zum Gruenerator-Objekt
- `_gruenerator_created_at` — Timestamp

**Auth**: Standard WordPress REST API Auth (Application Passwords / Cookie Auth)
**Permission**: `edit_posts` Capability

### A.3 Gruenerator-Verbindungs-Einstellungen

**New file**: `apps/wordpress/includes/class-gruenerator-api-connection.php`

Settings-Seite im WP-Admin fuer die Gruenerator-Verbindung:

- **Gruenerator API URL** (default: `https://gruenerator.eu`)
- **Verbindungsstatus** anzeigen (Connected/Disconnected)
- **Anleitung**: "Verbinde in deinem Gruenerator-Profil diese WordPress-Seite"

Speichert in `wp_options`:

- `gruenerator_api_url`
- `gruenerator_connection_status`

### A.4 Dashboard-Widget

**New file**: `apps/wordpress/includes/class-gruenerator-dashboard-widget.php`

WordPress Dashboard Widget "Gruenerator Entwuerfe":

- Zeigt die letzten 5 Posts mit `_gruenerator_source` Meta
- Link zum Bearbeiten jedes Entwurfs
- Link zum Gruenerator

### A.5 Admin-Menue Umstrukturierung

**Modify**: `apps/wordpress/gruenerator.php` — `gruenerator_add_admin_menu()`

```
Gruenerator (main) — immer sichtbar
+-- Verbindung          — Gruenerator API Verbindungseinstellungen (NEU)
+-- Entwuerfe           — Liste der Gruenerator-Entwuerfe (NEU)
+-- Setup-Assistent     — nur mit Sunflower
+-- Social Media        — nur mit Sunflower
+-- Einstellungen       — Design-Settings nur mit Sunflower
```

### A.6 Dashboard-Seite anpassen

**Modify**: `apps/wordpress/gruenerator.php` — `gruenerator_main_page()`

Conditional Cards: Gruenerator-Verbindungs-Card immer zeigen, Sunflower-Cards nur wenn Theme aktiv.

---

## Teil B: Gruenerator Backend

### B.1 Database Migration

**New file**: `apps/api/database/postgres/migrations/YYYYMMDD_add_wordpress_sites.sql`

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wordpress_sites JSONB DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wordpress_enabled BOOLEAN DEFAULT FALSE;
```

**Update**: `apps/api/database/postgres/schema.sql` (nach `nextcloud_share_links`, line ~85)

### B.2 Credential Encryption

**New file**: `apps/api/utils/validation/encryption.ts`

- AES-256-GCM, `CREDENTIAL_ENCRYPTION_KEY` env var
- `encryptCredential()` / `decryptCredential()`
- WordPress Application Passwords werden verschluesselt gespeichert

### B.3 WordPress Site Manager

**New dir**: `apps/api/utils/integrations/wordpress/`

Pattern: `apps/api/utils/integrations/nextcloud/shareManager.ts`

- **`types.ts`** — `WordPressSite`, `WordPressDraftResult`
- **`siteManager.ts`** — `WordPressSiteManager` (CRUD fuer WP-Sites in JSONB)
- **`index.ts`** — barrel export

Key-Unterschied zu Nextcloud: Passwoerter werden verschluesselt gespeichert und **nie** an Frontend zurueckgegeben.

### B.4 WordPress API Client

**New file**: `apps/api/services/api-clients/wordpressApiClient.ts`

Zwei Modi:

1. **Standard WP REST API** — `POST /wp-json/wp/v2/posts` (jede WP-Seite)
2. **Plugin-Enhanced** — `POST /wp-json/gruenerator/v1/drafts` (wenn Plugin installiert)

Feature Detection: `GET /wp-json/gruenerator/v1/status` -> wenn erreichbar, Plugin-Modus nutzen.

Methods:

**Push (Gruenerator -> WordPress):**

- `createPost(title, content, status, source, grueneratorId?)` -> Standard oder Plugin-Endpoint
  - `status`: `'draft'` (default), `'publish'`, `'pending'`, `'future'` (mit `date`)
  - Standard: `POST /wp-json/wp/v2/posts`
  - Plugin-Enhanced: `POST /wp-json/gruenerator/v1/drafts` (mit Gruenerator-Metadaten)

**Pull (WordPress -> Gruenerator):**

- `getPosts(params?)` -> `GET /wp-json/wp/v2/posts` — Artikel auflisten
  - Filter: `status` (draft/publish/pending), `categories`, `search`, `per_page`, `page`
  - Liefert: title, content (HTML), excerpt, date, categories, tags, featured_media
- `getPost(id)` -> `GET /wp-json/wp/v2/posts/:id` — Einzelnen Artikel holen
- `getCategories()` -> `GET /wp-json/wp/v2/categories` — Kategorien auflisten
- `getMedia(id)` -> `GET /wp-json/wp/v2/media/:id` — Beitragsbild holen

**Connection & Detection:**

- `testConnection()` -> `GET /wp-json/wp/v2/users/me`
- `hasPlugin()` -> `GET /wp-json/gruenerator/v1/status`

SSRF-Prevention: `validateUrlForFetch()` aus `apps/api/utils/validation/urlSecurity.ts`

**Pull-Use-Cases im Gruenerator:**

- Bestehende Artikel in Text-Improver laden (ueberarbeiten, kuerzen, umschreiben)
- Artikel in Leichte Sprache umwandeln
- Social-Media-Posts aus bestehenden Artikeln generieren
- Artikel in den Docs-Editor importieren fuer kollaborative Bearbeitung
- Content-Recycling: Pull -> AI-Verarbeitung -> Push als neuer/aktualisierter Post

### B.5 API Routes

**New file**: `apps/api/routes/wordpress/wordpressApi.ts`

Pattern: `apps/api/routes/nextcloud/nextcloudApi.ts`

| Method   | Path                                     | Beschreibung                                            |
| -------- | ---------------------------------------- | ------------------------------------------------------- |
| `GET`    | `/api/wordpress/status`                  | Integrationsstatus                                      |
| `GET`    | `/api/wordpress/sites`                   | Liste verbundener Seiten                                |
| `POST`   | `/api/wordpress/sites`                   | WP-Seite verbinden                                      |
| `PUT`    | `/api/wordpress/sites/:id`               | Seite aktualisieren                                     |
| `DELETE` | `/api/wordpress/sites/:id`               | Seite entfernen                                         |
| `POST`   | `/api/wordpress/test-connection`         | Verbindung testen                                       |
| `POST`   | `/api/wordpress/publish`                 | Post erstellen (draft/publish/pending/future)           |
| `GET`    | `/api/wordpress/sites/:id/posts`         | Artikel von WP-Seite auflisten (Pull)                   |
| `GET`    | `/api/wordpress/sites/:id/posts/:postId` | Einzelnen Artikel holen (Pull)                          |
| `GET`    | `/api/wordpress/sites/:id/categories`    | Kategorien der WP-Seite                                 |
| `PUT`    | `/api/wordpress/sites/:id/posts/:postId` | Bestehenden Artikel aktualisieren (nach AI-Bearbeitung) |

### B.6 Route Registration & Auth

**Modify**: `apps/api/routes.ts` (line ~194 import, ~435 register)
**Modify**: `apps/api/middleware/authMiddleware.ts` — `wordpress_enabled` Feature-Flag

---

## Teil C: Gruenerator Frontend

### C.1 WordPress Feature Module

**New dir**: `apps/web/src/features/wordpress/`

- `lib/wordpressApi.ts` — API Client
- `hooks/useWordPressSites.ts` — React Query Hooks
- `components/WordPressSetupModal.tsx` — Verbindungs-Dialog
- `components/WordPressSiteList.tsx` — Verbundene Seiten

### C.2 ExportDropdown Integration

**Modify**: `apps/web/src/components/common/ExportDropdown.tsx`

"Nach WordPress" Option (pattern: Wolke/Nextcloud-Integration, line ~106):

- Sites vorhanden -> Submenu mit Sites
- Keine Sites -> "WordPress verbinden" -> SetupModal
- `wordpress_enabled` false -> versteckt
- Status-Picker: "Als Entwurf speichern" (default) / "Direkt veroeffentlichen" / "Zur Pruefung einreichen"

### C.3 WordPress Import (Pull)

**New**: Import-Dialog in relevanten Features (Text-Improver, Chat, Docs)

- "Von WordPress importieren" Button -> Dialog mit Artikel-Liste von verbundener WP-Seite
- Suche/Filter nach Kategorie, Status, Freitext
- Artikel auswaehlen -> HTML-Content wird in den aktuellen Editor/Chat geladen
- Use Cases: Text ueberarbeiten, in Leichte Sprache, Social-Media-Posts generieren
- Nach AI-Verarbeitung: zurueck pushen als neuer Draft oder bestehenden Artikel aktualisieren

---

## Critical Files

| Zweck                       | Pfad                                                     |
| --------------------------- | -------------------------------------------------------- |
| Plugin Hauptdatei           | `apps/wordpress/gruenerator.php`                         |
| Plugin Settings             | `apps/wordpress/includes/class-gruenerator-settings.php` |
| Nextcloud Manager (Pattern) | `apps/api/utils/integrations/nextcloud/shareManager.ts`  |
| Nextcloud Routes (Pattern)  | `apps/api/routes/nextcloud/nextcloudApi.ts`              |
| Route Registration          | `apps/api/routes.ts` (lines 194, 435)                    |
| DB Schema                   | `apps/api/database/postgres/schema.sql` (line ~85)       |
| Auth Middleware             | `apps/api/middleware/authMiddleware.ts`                  |
| ExportDropdown              | `apps/web/src/components/common/ExportDropdown.tsx`      |
| URL Security                | `apps/api/utils/validation/urlSecurity.ts`               |

---

## Implementierungs-Reihenfolge

1. **Plugin umbauen** (A.1-A.6) — Conditional Sunflower, REST Endpoints, Dashboard-Widget
2. **Backend** (B.1-B.6) — Migration, Encryption, SiteManager, API Client, Routes
3. **Frontend** (C.1-C.2) — WordPress-Feature-Modul, ExportDropdown

Schritt 1 und 2 sind unabhaengig voneinander und koennen parallel laufen.

---

## Verification

1. Plugin auf einer **Nicht-Sunflower** WP-Seite aktivieren -> keine Fehler, Gruenerator-Menue sichtbar
2. Plugin auf einer **Sunflower** WP-Seite -> alle bestehenden Features + Gruenerator-Menue
3. `GET /wp-json/gruenerator/v1/status` -> Plugin-Info zurueck
4. `POST /wp-json/gruenerator/v1/drafts` mit Application Passwords -> Draft erstellt mit Meta
5. Gruenerator: WP-Seite verbinden -> Credentials verschluesselt gespeichert
6. Gruenerator: "Als WordPress-Entwurf" -> Draft erscheint im WP-Admin
7. WP Dashboard-Widget zeigt Gruenerator-Entwuerfe
