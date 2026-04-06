# Plan: Grünerator als Microsoft Teams Tab App

## Context

Die Grünerator Web-App soll als Microsoft Teams Tab in **mehreren M365-Tenants** nutzbar sein. Tenant-Admins laden ein identisches ZIP-Paket in ihren Org-App-Katalog hoch. User authentifizieren sich über Keycloak in einem Pop-up-Fenster (da Keycloak iframe-Redirects blockiert).

**Kein Teams SDK nötig** — rein iframe-basiert mit Pop-up-Auth.

---

## Phase 1: Server-Side (kein User-Impact, unabhängig deploybar)

### 1.1 Cookie-Attribute setzen
**Datei: `apps/api/config/betterAuth.ts`** (Zeile 156-166, `advanced`-Block)

`defaultCookieAttributes` hinzufügen — **nur in Production** (da `SameSite=None` das `Secure`-Flag erfordert, was auf `http://localhost` nicht funktioniert):
```typescript
advanced: {
  // ... bestehende Config ...
  defaultCookieAttributes: process.env.NODE_ENV === 'production'
    ? { sameSite: 'none' as const, secure: true, partitioned: true }
    : undefined,
},
```

**Begründung:** `SameSite=Lax` (Default) blockiert Cookies im Third-Party-iframe. `SameSite=None; Secure` ist ein Superset — funktioniert identisch für Same-Site-Requests, erlaubt aber zusätzlich Cross-Site (Teams-iframe). `Partitioned` (CHIPS) scoped das Cookie pro Top-Level-Site — zukunftssicher gegen Chromes Third-Party-Cookie-Deprecation.

**Wichtig:** Der Production-Guard verhindert, dass der Dev-Login bricht (`Secure`-Cookies werden auf `http://localhost` vom Browser ignoriert).

### 1.2 Teams zu `trustedOrigins` hinzufügen
**Datei: `apps/api/config/betterAuth.ts`** (Zeile 148-154)

```typescript
trustedOrigins: [
  'gruenerator://',
  'https://teams.microsoft.com',
  'https://*.teams.microsoft.com',
  ...(process.env.NODE_ENV === 'development'
    ? ['exp://', 'http://localhost:3000', 'http://localhost:5050']
    : []),
],
```

### 1.3 CSP `frame-ancestors` in Helmet
**Datei: `apps/api/server.ts`** (Zeile 307-356, Helmet-Config)

Neue Directive `frameAncestors` zum CSP hinzufügen:
```typescript
frameAncestors: [
  "'self'",
  'https://teams.microsoft.com',
  'https://*.teams.microsoft.com',
  'https://*.microsoft.com',
  'https://*.office.com',
  'https://*.office365.com',
  'https://*.sharepoint.com',
],
```

### 1.4 CSP `frame-ancestors` in Web-Nginx
**Datei: `apps/web/Dockerfile`** (Zeile 101-104, `location /` Block)

Header hinzufügen:
```nginx
location / {
    add_header Cache-Control "no-cache";
    add_header Content-Security-Policy "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.microsoft.com https://*.office.com https://*.office365.com https://*.sharepoint.com" always;
    try_files $uri /index.html;
}
```

---

## Phase 2: Client-Side (Pop-up Auth Flow)

### 2.1 iframe-Erkennung
**Neue Datei: `apps/web/src/utils/iframeContext.ts`**

```typescript
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // Cross-origin -> wir sind im iframe
  }
}

export function handlePopupAuthReturn(): boolean {
  if (window.opener && window.opener !== window) {
    try {
      window.opener.postMessage(
        { type: 'AUTH_COMPLETE' },
        window.location.origin
      );
      window.close();
      return true;
    } catch {
      window.close();
      return true;
    }
  }
  return false;
}
```

### 2.2 Pop-up Auth Return Handler einbinden
**Datei: `apps/web/src/index.tsx`** (am Anfang, vor React-Mount)

```typescript
import { handlePopupAuthReturn } from './utils/iframeContext';
if (handlePopupAuthReturn()) { /* Popup schliesst sich, nichts weiter tun */ }
```

### 2.3 Pop-up-Login in LoginPage
**Datei: `apps/web/src/features/auth/pages/LoginPage.tsx`**

Die `LoginProviders`-Komponente hat bereits einen `onLogin`-Prop (Zeile 23 in `LoginProviderButtons.tsx`), der den Default-Redirect ueberschreibt.

Aenderungen:
1. `isInIframe()` importieren
2. Pop-up-Handler erstellen, der `/api/auth/v2/sign-in/oauth2` aufruft und URL im Pop-up oeffnet
3. `onLogin={inIframe ? handleIframeLogin : undefined}` an `<LoginProviders>` uebergeben

```typescript
import { isInIframe } from '../../../utils/iframeContext';

// Im Component:
const inIframe = isInIframe();

const handleIframeLogin = async (provider: LoginProvider, callbackURL: string) => {
  setIsAuthenticating(true);
  try {
    const response = await fetch(`${AUTH_BASE_URL}/auth/v2/sign-in/oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        providerId: provider.betterAuthProviderId,
        callbackURL,
      }),
    });
    const data = await response.json();

    const width = 500, height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(data.url, 'gruenerator-auth',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`);

    if (!popup) { /* Popup blockiert — Fehlermeldung zeigen */ }

    // Warten auf AUTH_COMPLETE postMessage
    const handler = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'AUTH_COMPLETE') {
        window.removeEventListener('message', handler);
        window.location.reload();
      }
    };
    window.addEventListener('message', handler);
  } catch {
    setIsAuthenticating(false);
  }
};

// JSX:
<LoginProviders
  redirectTo={intendedRedirect}
  apiBaseUrl={AUTH_BASE_URL}
  disabled={isAuthenticating}
  onBeforeLogin={handleBeforeLogin}
  onLogin={inIframe ? handleIframeLogin : undefined}
/>
```

**Wichtig:** `LoginProviderButtons.tsx` (Zeile 46-47) ruft `onLogin(provider, callbackURL)` auf — die Signatur passt. Keine Aenderung an der shared-Komponente noetig.

---

## Phase 3: Teams App Manifest

### 3.1 Manifest-Paket erstellen
**Neues Verzeichnis: `teams-app/`**

Drei Dateien:
- `manifest.json` — App-Definition mit `staticTabs` -> `https://gruenerator.eu/?context=teams`
- `color.png` — 192x192 Farbicon (Gruenerator-Logo)
- `outline.png` — 32x32 Outline-Icon (weiss auf transparent)

`validDomains`: `gruenerator.eu`, `*.gruenerator.eu`, `user.netzbegruenung.de` (Keycloak, fuer Pop-up-Erlaubnis)

### 3.2 ZIP bauen
```bash
cd teams-app && zip gruenerator-teams.zip manifest.json color.png outline.png
```

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|----------|
| `apps/api/config/betterAuth.ts` | Cookie-Attribute + trustedOrigins |
| `apps/api/server.ts` | Helmet CSP frame-ancestors |
| `apps/web/Dockerfile` | Nginx CSP frame-ancestors |
| `apps/web/src/utils/iframeContext.ts` | **Neu** — iframe-Erkennung + Popup-Return |
| `apps/web/src/index.tsx` | Popup-Return-Handler aufrufen |
| `apps/web/src/features/auth/pages/LoginPage.tsx` | Pop-up-Login wenn im iframe |
| `teams-app/manifest.json` | **Neu** — Teams App Manifest |
| `teams-app/color.png` | **Neu** — 192x192 Icon |
| `teams-app/outline.png` | **Neu** — 32x32 Icon |

---

## Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| Dev-Login bricht durch `SameSite=None` | Verhindert | Production-Guard: Cookie-Attribute nur wenn `NODE_ENV === 'production'` |
| Pop-up-Blocker | Mittel | User-Click loest Pop-up aus (Browser erlaubt das). Fehlermeldung bei Blockierung |
| Third-Party-Cookie-Deprecation | Langfristig | `Partitioned` (CHIPS) ueberlebt die Deprecation |
| Teams-Domain-Liste unvollstaendig | Niedrig | Wildcards (`*.microsoft.com`, `*.office.com`) decken Varianten ab |

---

## Verifizierung

1. **Cookie-Check:** Nach Deploy von Phase 1, `Set-Cookie`-Header pruefen: `SameSite=None; Secure; Partitioned` muss gesetzt sein
2. **iframe-Test:** `<iframe src="https://beta.gruenerator.eu">` auf einer Test-Seite laden — App muss laden (nicht durch X-Frame-Options blockiert)
3. **Pop-up-Auth:** Im iframe den Login-Button klicken -> Pop-up oeffnet sich -> Keycloak-Login -> Pop-up schliesst -> iframe ist eingeloggt
4. **Regression:** Normaler Login auf gruenerator.eu (kein iframe) muss weiterhin per Redirect funktionieren
5. **Teams-Sideload:** ZIP in Test-Tenant hochladen -> Tab oeffnen -> Login testen
6. **Cross-Browser:** Edge + Chrome (primaere Teams-Clients)
