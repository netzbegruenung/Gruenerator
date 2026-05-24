# TODO for Claude-in-Chrome: connect personal OneDrive (test)

**Goal:** make the Microsoft 365 connector reach **"Verbunden"** with a personal Microsoft account (`outlook.com` / `hotmail.com` / `live.com`).

The OAuth chain is already correct — reaching Microsoft's _"Eine Anmeldung mit einem persönlichen Konto ist hier nicht möglich"_ page proves the Nango integration, environment, and redirect URI all work. The **only** blocker is two settings: the Azure app is single-tenant (rejects personal accounts) and it requests two scopes that don't exist for personal accounts.

Two browser surfaces: **(A)** Azure/Entra portal, **(B)** the Nango dashboard.

---

## Step 1 — Azure: allow personal accounts

1. Go to **https://entra.microsoft.com** → Identity → Applications → **App registrations** → open **"Grünerator – Connectors"** (Client ID `38205f6a-1036-412c-9236-00c04f126282`).
2. **Authentication** (left nav) → **Supported account types**.
3. Change it to:
   > **"Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"**
4. **Save.**

Why: single-tenant and plain multitenant both _exclude_ consumer Microsoft accounts. Only the "…and personal Microsoft accounts" option lets an `outlook.com` account sign in — that's the exact error you hit.

---

## Step 2 — Nango: reduce scopes for personal accounts

1. Go to **https://nango.gruenerator.eu** → basic-auth `admin` / dashboard password.
2. Confirm the env switcher (top-left) is on the **same environment the backend uses** (the one whose login worked earlier — you reached the Microsoft page, so this is already correct; don't change it).
3. Integrations → **`microsoft`** → **Scopes**. Set to **exactly**:
   ```
   User.Read Files.Read offline_access
   ```
4. **Remove** `Sites.Read.All` and `Team.ReadBasic.All`. **Save.**

Why: `Sites.Read.All` (SharePoint) and `Team.ReadBasic.All` (Teams) don't exist on consumer accounts — leaving them in makes the consent screen error out for a personal login. `Files.Read` alone reads personal OneDrive (`/me/drive`).

---

## Step 3 — Test

1. Open **https://gruenerator.eu/profile/wolke** (logged in) → section **Verbundene Konten**.
2. Click **Verbinden** on **Microsoft 365**.
3. Sign in with the **personal** Microsoft account → approve consent.
4. Expected: popup closes, the card flips to **Verbunden**.
5. Cross-check: Nango dashboard → **Connections** → a new connection appears under the `microsoft` integration.

**Report back:** whether it reached Verbunden, and the exact text of any consent-screen error.

---

## ⚠️ This is a test-only configuration

Personal OneDrive validates the OAuth pipe but **not** the production scope set (no SharePoint/Teams). When you move to org/work accounts:

- Restore `Sites.Read.All` + `Team.ReadBasic.All` to the Nango `microsoft` integration.
- Decide whether to keep the app multitenant+personal or switch back to org-only.

Also note: even at **Verbunden**, there's no UI yet to browse/import the files — that's the separate `@connect`-in-chat follow-up PR (see `~/.claude/plans/eine-anmeldung-mit-einem-sparkling-sonnet.md`).
