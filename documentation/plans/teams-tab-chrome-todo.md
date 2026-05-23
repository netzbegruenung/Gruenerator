# TODO for Claude-in-Chrome: Microsoft Teams Tab App setup

**Goal:** Create the Grünerator Microsoft Teams app package in the Teams Developer Portal and sideload it into a test M365 tenant, so Grünerator (`https://gruenerator.eu`) shows up as a Teams tab.

You (Claude-in-Chrome) do the **browser/portal work only**. The app is a pure iframe static tab pointing at the live site — no Teams SDK, no code lives in the package itself.

---

## ⚠️ Blocking dependency — read first

The tab embeds `https://gruenerator.eu` in a Teams iframe. That iframe will render **blank / blocked** until the server-side and client-side code ships:

- Server: `Content-Security-Policy: frame-ancestors … teams.microsoft.com …` (Helmet in `apps/api/server.ts` + nginx in `apps/web/Dockerfile`), cookies `SameSite=None; Secure; Partitioned`, and Teams added to Better Auth `trustedOrigins`.
- Client: iframe detection + popup-auth return handler (`apps/web/src/utils/iframeContext.ts`, wired into `LoginPage`).

Canonical engineering plan: `documentation/plans/teams-tab-integration.md`. **None of it is implemented yet** as of this writing — that's a separate coding task. You can still build and sideload the package now; just expect the **first load test to fail with a blocked iframe** until the code is deployed. That failure is the signal to go do the code phase, not a bug in your setup.

---

## Assets you need before starting

The Developer Portal requires two icons. Ask the human for, or locate:

- **Color icon** — 192×192 px PNG, full-color Grünerator logo.
- **Outline icon** — 32×32 px PNG, transparent background, single-color (white) glyph.

If they're not available, the portal supplies placeholder icons — proceed with placeholders and note it for follow-up.

---

## Step-by-step (Teams Developer Portal)

1. Go to **https://dev.teams.microsoft.com** and sign in with the **test tenant** admin account (the one you'll sideload into).
2. **Apps → New app**. Name it `Grünerator`. This auto-generates an App ID (GUID) — leave it.
3. **Basic information** — fill required fields:
   - Short + long description (e.g. "KI-Tool zur Content-Erstellung für Bündnis 90/Die Grünen").
   - Developer/company name: `netzbegrünung e.V.` (confirm with human).
   - Website, Privacy policy, and Terms of use URLs:
     - Website: `https://gruenerator.eu`
     - Privacy: `https://gruenerator.eu/datenschutz` (verify this path resolves; adjust if different)
     - Terms: `https://gruenerator.eu/impressum` (verify/adjust)
4. **Branding** — upload the color (192×192) and outline (32×32) icons.
5. **App features → Personal app** (static tab):
   - Add a tab. Name: `Grünerator`.
   - **Content URL:** `https://gruenerator.eu/?context=teams`
   - Leave website URL empty or same. No "Microsoft Entra App ID" needed (we don't use Teams SSO).
   - Entity/Tab ID: `gruenerator` (any stable string).
6. **Domains / valid domains** (App features or Domains section) — add:
   - `gruenerator.eu`
   - `*.gruenerator.eu`
   - `user.netzbegruenung.de` (Keycloak login host — for completeness; the login is a `window.open` popup so this is belt-and-suspenders)
7. **Permissions** — none required (no Graph, no device permissions). Leave empty.
8. **Save** at every step. When the portal's validation panel is green, either:
   - **Preview in Teams** (fastest test), or
   - **Download app package** (gives you the ZIP: `manifest.json` + the two icons) for manual sideload / archiving.

---

## Sideload into the test tenant

If "Preview in Teams" didn't already install it:

1. Open **https://teams.microsoft.com** (same test tenant).
2. **Apps** (left rail) → **Manage your apps** → **Upload an app** → **Upload a custom app**.
   - If that option is missing, an admin must enable custom-app upload in the **Teams admin center → Setup policies → "Upload custom apps" = On**. Do that first if blocked.
3. Upload the downloaded ZIP.
4. Open the app → the **Grünerator** personal tab.

---

## Verification

| Check      | Expected (code deployed)                                                | Expected (code NOT yet deployed)                                                          |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tab loads  | Grünerator UI renders inside Teams                                      | **Blank / "refused to connect"** iframe → this is the blocking dependency, not your error |
| Login      | Click login → popup → Keycloak → popup closes → tab is logged in        | Popup may open but session won't stick (cookie `SameSite` not yet set)                    |
| Regression | `https://gruenerator.eu` in a normal browser still logs in via redirect | unaffected                                                                                |

If the tab is blank, capture the browser devtools **Console + Network** errors (look for `X-Frame-Options` / `frame-ancestors` / CSP messages) and report them — that confirms the code phase is the next step.

---

## Hand-off note

When done, report: the generated **App ID (GUID)**, whether you used real or placeholder icons, the **sideload result**, and the **first-load outcome** (rendered vs. blocked + the exact console error). That tells the team whether the only remaining work is shipping the Phase 1–2 code in `teams-tab-integration.md`.
