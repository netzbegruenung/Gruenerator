# Agent Guide: Sign the Grünerator Desktop app with Azure Trusted Signing

**Goal:** make the Windows installer install **without** the "Windows protected your PC" /
"unknown publisher" Microsoft Defender SmartScreen warning.

**How:** set up **Azure Trusted Signing** (formerly Azure Code Signing) and wire it into the release
pipeline. Its **Public Trust** certificate is recognised by SmartScreen immediately — no
months-long reputation build-up like a plain OV certificate.

This document is for an **AI agent that drives Chrome**. The agent executes the browser steps
(Phase 0–5), **stops at every 🛑 checkpoint** (async waits, sign-in/MFA, identity verification,
missing rights), and hands **Part B** (repo/CI) to a developer.

---

## ⚠️ Read first — two unrelated "signatures" exist

| Thing                                                                                 | What it is                                                                 | Stops SmartScreen?                     |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_KEY_PASSWORD` (already in `desktop-release.yml`) | **minisign** key that signs the **auto-updater manifest** (`latest.json`). | ❌ No — unrelated. **Leave it alone.** |
| **Azure Trusted Signing** Authenticode cert (this guide)                              | Microsoft-trusted **code-signing** of the `.exe`/`.msi`.                   | ✅ Yes — this is the fix.              |

---

## App facts (use these exact values)

| Field             | Value                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Product name      | `Grünerator`                                                                                        |
| Bundle identifier | `de.gruenerator.desktop`                                                                            |
| Version           | `1.2.0`                                                                                             |
| Windows artifacts | NSIS `…_x64-setup.exe` and `.msi`                                                                   |
| Build pipeline    | `.github/workflows/desktop-release.yml` (`tauri-apps/tauri-action@v0`, `windows-latest`, ~line 112) |
| Tauri config      | `apps/desktop/src-tauri/tauri.conf.json` (Windows block has **no** signing config yet)              |
| GitHub repository | `netzbegruenung/Gruenerator`                                                                        |
| Release trigger   | push of tag `desktop-v*` (plus manual `workflow_dispatch`)                                          |

## Decisions (prefilled — do not re-ask)

| Decision                                       | Value                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity type                                  | **Organization** — validating Moritz Wächter's Einzelunternehmen. _(Individual is NOT offered in the EU — only USA & Canada.)_ |
| Publisher shown in Windows                     | **Moritz Wächter** (the validated business name)                                                                               |
| Region                                         | **West Europe** — endpoint `https://weu.codesigning.azure.net/`                                                                |
| Azure subscription                             | `cc4836eb-72cc-4145-a8ab-29fbccc7992b` (Pay-As-You-Go)                                                                         |
| CI signing method                              | **`azure/trusted-signing-action`**                                                                                             |
| The agent also requests the **D-U-N-S number** | yes (Phase 0)                                                                                                                  |

### Identity / contact values

| Field                                          | Value                                       |
| ---------------------------------------------- | ------------------------------------------- |
| Business name (must match D-U-N-S **exactly**) | `Moritz Wächter`                            |
| Business address (must match D-U-N-S exactly)  | `Villestr. 6-8, 53347 Alfter`               |
| Country                                        | `Germany`                                   |
| Contact email                                  | `moritz-waechter@outlook.de`                |
| Contact phone                                  | `+49 162 9830496` (national `0162 9830496`) |
| D-U-N-S number                                 | `<FILL: D-U-N-S>` — obtained in Phase 0     |

### Status so far (done — do not redo)

- ✅ Region restriction removed (`sys.regionrestriction` auto-deleted on Pay-As-You-Go upgrade).
- ✅ Trusted Signing account **`gruenerator-signing`** created (West Europe, Basic, ~$10/mo).
- ✅ Subscription ID captured.
- ✅ **Phase 1 role done** — `Artifact Signing Identity Verifier` assigned to Moritz Wächter
  (Object ID `585205a5-b0a4-491a-a32e-b60beb2d0aec`). "+ New identity validation" is now enabled.
- 🟡 **Phase 0 D-U-N-S** — form pre-filled on the Apple tool but **not submitted**; operator must
  finish (see Phase 0 notes). Once issued, fill `<FILL: D-U-N-S>`.
- ⬜ Open: **D-U-N-S submit/wait** → **Org identity validation (Phase 3)** → **cert profile** → **CI app + role** → **record values**.

> ⚠️ Eligibility caveat: Organization validation generally expects the business to have existed
> **~3 years**. If the Gewerbe is younger, Microsoft may ask for extra proof or reject — that is why
> we "try it". A rejection is a possible, non-surprising outcome: report it, don't retry blindly.

---

# Part A — Browser steps (the agent does these)

## Phase 0 — Request the D-U-N-S number 🛑 H0 (separate website, NOT Azure)

Microsoft verifies the business against the **Dun & Bradstreet** directory, so a D-U-N-S number must
exist first. It is **free** but issuance takes **days to weeks** — start this first; Phase 1 can run
in parallel.

1. Open the free **Apple D-U-N-S lookup tool** (works for any business, no Apple account needed):
   `https://developer.apple.com/enroll/duns-lookup/`.
   _(Fallback if unavailable: Dun & Bradstreet Germany `https://www.dnb.com/de-de/` → "D-U-N-S-Nummer".)_
2. Enter and **search**:
   - **Legal entity name:** `Moritz Wächter`
   - **Country/region:** `Germany`
   - address fields from `Villestr. 6-8, 53347 Alfter`
3. **If a D-U-N-S already exists**, the tool shows it → **record it** into `<FILL: D-U-N-S>` and
   **skip to Phase 1** (no waiting needed).
4. **If none exists**, complete the request form:
   - Legal entity name `Moritz Wächter`, address `Villestr. 6-8, 53347 Alfter`, country `Germany`
   - Contact name `Moritz Wächter`, email `moritz-waechter@outlook.de`, phone `+49 162 9830496`
   - Website: leave blank unless the operator provides one.
   - Submit the request.
5. **🛑 Stop and report.** A new D-U-N-S arrives **by email in days–weeks**. Do not wait in-session.
   If any **email/phone verification** appears, **hand it to the operator** — do not complete a
   personal verification on their behalf.

> **Known traps on the Apple D-U-N-S form (learned in practice — the operator must finish these):**
>
> 1. **Umlauts get stripped** by the form-fill tooling — "Wächter" saves as "Wchter". The operator
>    must manually correct **Legal Entity Name → `Moritz Wächter`** and **Family Name → `Wächter`**.
>    A mismatch here makes the Phase 3 D-U-N-S match fail.
> 2. **CAPTCHA** — the agent must not solve it; the operator completes it.
> 3. **Phone country code** — set both "Intl. Code" flag dropdowns to **+49 Germany** (Work Phone
>    and Organization Phone); the agent often leaves them empty.
> 4. **Email must be an org-domain address.** Apple's help text wants an email on a domain you
>    control — `outlook.de` (a free mailbox) is likely rejected. Use an address on a domain the
>    operator owns, e.g. **`moritz-waechter.de`** (already used by the project's auth service
>    `auth.services.moritz-waechter.de`). This is the operator's call.

> The agent should now proceed to Phase 1 (parallel), then **pause before Phase 3** until the
> operator supplies the issued `<FILL: D-U-N-S>`.

## Phase 1 — Open the signing account & grant the verifier role 🛑 H1 (Azure, parallel)

No D-U-N-S needed for this — do it immediately while Phase 0 is pending.

1. Go to `https://portal.azure.com`. If a sign-in/MFA screen appears, **stop** and let the human
   authenticate (never type credentials).
2. Search **`gruenerator-signing`** and open it. _(The account already exists — do not create one.)_
3. Left menu → **Access control (IAM)** → **+ Add** → **Add role assignment**.
4. Role: **`Artifact Signing Identity Verifier`** (search by name).
   - **Members:** user `moritz-waechter@outlook.de`. → **Review + assign**.
   - This is required even though the user is subscription **Owner**; without it the
     **+ New identity** button in Phase 3 stays greyed out. Allow ~1 min to propagate.
   - 🛑 If the agent lacks rights to assign roles (IAM error) → stop, ask an admin.

## Phase 2 — Wait for the D-U-N-S 🛑 H2

Resume here once the operator provides the issued `<FILL: D-U-N-S>`. Confirm the **name + address**
that D&B registered, because Phase 3 must match them **character-for-character**.

## Phase 3 — Submit the Organization identity validation 🛑 H3

**Requires:** D-U-N-S (Phase 0/2) **and** the role (Phase 1). Microsoft reviews this asynchronously
(hours to several days).

1. Open **`gruenerator-signing`** → **Identity validations** → **+ New identity validation**
   (now enabled).
2. Type **Organization**; enter — **matching the D-U-N-S record exactly**:
   - **Organization / business name:** `Moritz Wächter`
   - **D-U-N-S number:** `<FILL: D-U-N-S>`
   - **Address:** `Villestr. 6-8, 53347 Alfter`
   - **Country:** `Germany`
   - **Contact email:** `moritz-waechter@outlook.de`
   - **Phone:** `+49 162 9830496`
3. Submit.
4. **🛑 Stop and report.** Status shows **`In progress`**; Phase 4 needs **`Completed`**. If
   **`rejected`** (e.g. Gewerbe < ~3 years, or D-U-N-S name/address mismatch) → report the exact
   message, do not retry blindly. Re-check the status at most a few times per day.

## Phase 4 — Create the certificate profile (after validation `Completed`)

1. **`gruenerator-signing`** → **Certificate profiles** → **+ Create**.
2. - **Profile name:** `gruenerator-public-trust`
   - **Profile type:** **Public Trust** ← the only type SmartScreen honours. Do **not** pick Test /
     Private Trust / VBS.
   - **Identity validation:** select the `Completed` Organization validation from Phase 3.
3. **Create**.

## Phase 5 — CI service principal + signer role 🛑 H5

GitHub Actions authenticates to Azure via **OIDC** (no stored secret). This is the only app
registration in the task — for CI auth, not user login.

1. Portal search → **Microsoft Entra ID** → **App registrations** → **+ New registration**:
   - **Name:** `gruenerator-ci-signing`; **Account types:** **Single tenant**; no redirect URI →
     **Register**.
   - Copy **Application (client) ID** and **Directory (tenant) ID**.
2. App → **Certificates & secrets** → **Federated credentials** → **+ Add credential**, scenario
   _GitHub Actions deploying Azure resources_, **Organization** `netzbegruenung`, **Repository**
   `Gruenerator`. Add **two** credentials:
   - Entity type **Tag**, value `desktop-v*`, name `release-tag` (releases are tag-triggered).
   - Entity type **Branch**, value `master`, name `manual-dispatch` (covers `workflow_dispatch`).
3. **`gruenerator-signing`** → **Access control (IAM)** → **+ Add role assignment** → role
   **`Trusted Signing Certificate Profile Signer`** → member: the `gruenerator-ci-signing` app →
   **Review + assign**.
   - 🛑 Insufficient rights to register the app or assign the role → stop, ask an admin.

## Phase 6 — Record values and report (agent's final step)

```
Trusted Signing setup — report
  D-U-N-S number:               <fill or "requested, pending email">
  Account name:                 gruenerator-signing
  Certificate profile:          gruenerator-public-trust
  Endpoint URI:                 https://weu.codesigning.azure.net/
  Subscription ID:              cc4836eb-72cc-4145-a8ab-29fbccc7992b
  Tenant ID (AZURE_TENANT_ID):  <guid>
  CI client ID (AZURE_CLIENT_ID): <guid>
  Identity validation status:   Completed | In progress | rejected (+message)
  Verifier role assigned:       yes | no
  CI signer role assigned:      yes | no
```

The agent's job ends here. Below is Part B (a developer).

---

# Part B — Wire signing into the pipeline (a developer does this)

### B1. GitHub repository secrets

Settings → Secrets and variables → Actions:

- `AZURE_SUBSCRIPTION_ID` = `cc4836eb-72cc-4145-a8ab-29fbccc7992b`
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` (from Phase 5)
- `TRUSTED_SIGNING_ENDPOINT` = `https://weu.codesigning.azure.net/`
- `TRUSTED_SIGNING_ACCOUNT` = `gruenerator-signing`
- `TRUSTED_SIGNING_PROFILE` = `gruenerator-public-trust`

### B2. Sign the Windows artifacts in `desktop-release.yml`

In the `windows-latest` matrix leg, **after** `tauri-apps/tauri-action@v0` (~line 112) and before
upload:

1. `azure/login@v2` with `client-id`/`tenant-id`/`subscription-id` (OIDC).
2. `azure/trusted-signing-action@v0` with `endpoint`, `trusted-signing-account-name:
gruenerator-signing`, `certificate-profile-name: gruenerator-public-trust`, and a glob over
   `apps/desktop/src-tauri/target/**/release/bundle/{nsis,msi}` filtering `*.exe,*.msi`.

The job needs `permissions: { id-token: write, contents: write }`.

### B3. Verify on real Windows

1. Download the signed `…_x64-setup.exe`.
2. Properties → **Digital Signatures** → signature shows `Moritz Wächter`, valid timestamp.
3. Run it — the hard **"unknown publisher"** block is gone. (A brand-new cert may still show a
   softer prompt for the first downloads until reputation accrues, but the publisher is now named
   and trusted.)
4. Optional: `signtool verify /pa /v <file>`.

---

## 🛑 Stop conditions (summary)

- **Phase 0** D-U-N-S submitted → stop, resume at Phase 2 when the number arrives by email.
- **Phase 0/3** any email/phone/personal verification screen → hand to the operator.
- **Phase 1 / 5** insufficient IAM rights → stop, ask an admin.
- **Phase 3** validation `In progress` → stop, resume Phase 4 at `Completed`.
- **Phase 3** validation `rejected` (Gewerbe < ~3 yrs, or D-U-N-S mismatch) → report exact message, don't retry blindly.
- Any portal sign-in / MFA screen → stop, let the human authenticate.

## Open data slots

- `<FILL: D-U-N-S>` — produced in Phase 0; fill once Microsoft/D&B issues it. **This is the only
  remaining gap** — every other value is set.
