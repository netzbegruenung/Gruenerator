# TODO for Claude-in-Chrome: Microsoft 365 connector (Nango)

**Goal:** Register a Microsoft Entra (Azure AD) OAuth app, grant it the Microsoft Graph read scopes Grünerator needs, then create the matching **Nango integration** so the "Microsoft 365" → **Verbinden** button at `/profile/wolke` completes and lists OneDrive/SharePoint files.

Two browser surfaces: **(A)** Entra/Azure portal, **(B)** the Nango dashboard at `https://nango.gruenerator.eu`.

This is the **first** connector being set up — treat it as the reference. Auth between the backend and Nango already works; only the per-provider integration is missing.

---

## Non-negotiable invariant

In Nango (Part B), the integration's **Unique Key MUST be exactly `microsoft`** (lowercase). The backend hardcodes that string when building the connect URL (`config/nango.ts` → `NANGO_PROVIDERS`). Any other key (`microsoft-365`, `Microsoft`, `onedrive`) makes the Verbinden popup 404 with no useful error. Do the whole thing in the **same Nango environment** whose secret key the backend uses (the Prod env you configured earlier).

---

## Part A — Entra app registration

Surface: **https://entra.microsoft.com** (Identity → Applications → App registrations) — or `https://portal.azure.com` → "Microsoft Entra ID" → App registrations. Sign in as a **tenant admin** (you'll need to click "Grant admin consent" at the end).

1. **New registration.**
   - Name: `Grünerator – Connectors`
   - Supported account types: **"Accounts in this organizational directory only" (single tenant)** for the first working setup — you're admin, consent is one click. (Switch to *multitenant* later when other Grüne orgs need it; that's a dropdown change + each tenant's admin consenting.)
   - Redirect URI: platform **Web**, value `https://nango.gruenerator.eu/oauth/callback`
   - Register.
2. From the **Overview** page, copy the **Application (client) ID** — you'll paste it into Nango. (Also note the **Directory (tenant) ID** in case Nango asks.)
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions.** Add exactly these:
   - `User.Read` (usually present by default)
   - `Files.Read`
   - `Sites.Read.All`
   - `Team.ReadBasic.All`
   - `offline_access`
4. **Grant admin consent for <tenant>** (button at the top of API permissions). Confirm the *Status* column turns into green "Granted" check marks.
   - Why: `Sites.Read.All` and `Team.ReadBasic.All` are admin-consent-required. Without this, login works but those scopes are silently denied and SharePoint/Teams listing fails.
   - Do **not** add `ChannelMessage.Read.All` or any message-content scope — that's a deliberate DSGVO exclusion (files only).
5. **Certificates & secrets → New client secret.**
   - Description: `nango`, expiry: **24 months** (max).
   - **Copy the secret `Value` immediately** — the column you want is **Value**, NOT "Secret ID". It's shown only once; if you navigate away you must delete and recreate it.
   - ⚠️ Note the expiry date for a renewal reminder — when it lapses, every Microsoft connection breaks.

You now have: **client ID** + **secret Value** (+ tenant ID).

---

## Part B — Nango integration

Surface: **https://nango.gruenerator.eu** (basic-auth `admin` / dashboard password). Confirm the env switcher (top-left) is on the **same env as the backend's secret key**.

1. **Integrations → Configure New Integration** (or "New").
2. Choose the **Microsoft** provider template. (If the list distinguishes variants, pick the generic **Microsoft** / Microsoft Graph one — not `onedrive`/`sharepoint-online`-specific — because the backend calls generic Graph `/me/drive/...`.)
3. Set **Unique Key / Integration ID** = `microsoft` (exactly).
4. Paste **Client ID** and **Client Secret** (the Value from A.5).
5. **Scopes** — enter:
   ```
   User.Read Files.Read Sites.Read.All Team.ReadBasic.All offline_access
   ```
6. If Nango asks for a **tenant / authority**, use `common` (or `organizations`). For the single-tenant app in A.1 you may instead put the specific tenant ID — either works as long as it matches the app's account-type setting.
7. Confirm the integration's **callback/redirect URL** shown by Nango is `https://nango.gruenerator.eu/oauth/callback` and that it matches what you set in A.1 (and is registered in Entra).
8. Save.

---

## Verification

1. Open `https://gruenerator.eu/profile/wolke` (logged in), section **Verbundene Konten**.
2. Click **Verbinden** on **Microsoft 365**.
3. Expected: popup → Microsoft login → consent screen → popup closes → the card flips to **Verbunden**.
4. Cross-check the Nango dashboard → **Connections** → a new connection appears under the `microsoft` integration, `connectionId` = the user's id.

**If the popup errors immediately** → almost always (a) Unique Key ≠ `microsoft`, or (b) redirect-URI mismatch between Entra and `https://nango.gruenerator.eu/oauth/callback`.
**If login works but SharePoint/Teams listing is empty/403** → admin consent (A.4) wasn't actually granted for the admin-scoped permissions.
**If the connection drops after ~1 hour** → `offline_access` is missing from the scopes (no refresh token).

---

## Hand-off note

Report back: the **client ID** (not the secret), whether **admin consent** showed "Granted", the **Verbinden** outcome, and whether a connection row appeared in Nango. That confirms the reference connector works before replicating the pattern for Jira/Confluence (and, separately, Google behind its restricted-scope verification track).
