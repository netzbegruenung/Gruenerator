# Mac App Store (MAS) Distribution — Grünerator Desktop

Status: **groundwork in progress**. The app ships today via **Developer ID + notarization**
as a direct-download DMG (sandbox OFF, auto-updater ON). The Mac App Store is a _second,
parallel_ distribution that requires a different build (sandbox ON, no updater, `.pkg`,
provisioning profile) and passes Apple App Review.

This guide is the checklist for adding the MAS track. Do **not** change the existing
Developer ID files — MAS uses its own overlay so both tracks coexist.

---

## 0. Decide first: which Apple account?

The Developer ID certs are on **Moritz Waechter (Einzelunternehmen, Team `P74W7SGX8R`)**.
A public App Store listing for "Grünerator" (a netzbegrünung / Die Grünen project) under a
**personal** account is a trademark/ownership question. Decide whether MAS publishes under
this personal account or a dedicated organization account **before** issuing distribution
certs — the certs and the App Store Connect app record are account-bound.

---

## 1. Certificates (CSR flow — same as Developer ID setup)

MAS needs **two** distribution certs (different from Developer ID):

| Purpose                   | Certificate type                                                      |
| ------------------------- | --------------------------------------------------------------------- |
| Sign the `.app`           | **Apple Distribution** (a.k.a. "3rd Party Mac Developer Application") |
| Sign the installer `.pkg` | **Mac Installer Distribution** ("3rd Party Mac Developer Installer")  |

For each: generate a CSR, upload at <https://developer.apple.com/account/resources/certificates/add>,
download the `.cer`, import against the local private key (exactly like we did for Developer ID).

```bash
SIGN_DIR="$HOME/.gruenerator-signing"
# App-distribution cert key + CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$SIGN_DIR/mas_app.key" -out "$SIGN_DIR/mas_app.csr" \
  -subj "/CN=Gruenerator MAS App/C=DE"
# Installer cert key + CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$SIGN_DIR/mas_installer.key" -out "$SIGN_DIR/mas_installer.csr" \
  -subj "/CN=Gruenerator MAS Installer/C=DE"
```

After download, build a `.p12` for each (OpenSSL 3 needs `-legacy`) and
`security import … -T /usr/bin/codesign`, then verify with
`security find-identity -v` (the installer identity is `-p basic`, not `-p codesigning`).

---

## 2. App ID + Provisioning Profile (portal)

1. **App ID**: <https://developer.apple.com/account/resources/identifiers/list> →
   register an **explicit** App ID matching the bundle id **`de.gruenerator.desktop`**
   (capabilities: none beyond defaults unless we add iCloud/Push later).
2. **Provisioning Profile**: <https://developer.apple.com/account/resources/profiles/list> →
   create a **Mac App Store** distribution profile for that App ID, signed with the
   Apple Distribution cert. Download `Gruenerator_MAS.provisionprofile`.
   It gets embedded into the `.app` at `Contents/embedded.provisionprofile` at sign time.

---

## 3. App Store Connect record + metadata (portal)

<https://appstoreconnect.apple.com/apps> → **+ New App** (macOS), bundle id `de.gruenerator.desktop`.
Then fill in the required metadata:

- Name, subtitle, **category** (also set `LSApplicationCategoryType` in the MAS config)
- Description, keywords, support URL, **privacy policy URL** (mandatory)
- Screenshots (macOS)
- **App Privacy** questionnaire (what data is collected — auth email, content)
- Age rating, pricing (free)

---

## 4. Code changes still required (in this repo — pending)

The sandboxed build must drop two things the App Store rejects. Plan: a Cargo feature
`appstore` that cfg-gates them out.

- [ ] **Cargo.toml**: add `[features] appstore = []`.
- [ ] **src/lib.rs**: gate the updater + LaunchAgent autostart behind
      `#[cfg(not(feature = "appstore"))]` (updater plugin, autostart plugin, the
      `check_for_update`/autostart commands). Autostart, if needed in MAS, must be
      reimplemented via `SMAppService` (macOS 13+) — deferred; v1 MAS can ship without it.
- [ ] **MAS Tauri config overlay** (`tauri.appstore.conf.json`): set
      `bundle.macOS.entitlements = "Entitlements.appstore.plist"`,
      `bundle.macOS.provisioningProfile`, a `LSApplicationCategoryType`, and
      `bundle.createUpdaterArtifacts = false`; strip the `updater`/`deep-link` updater bits.

`Entitlements.appstore.plist` (sandbox ON) is already created.

---

## 5. Build → sign → package → upload

MAS packaging in Tauri is **not** fully turnkey — expect a manual `productbuild` step.

```bash
# 1. Build the .app with the MAS overlay + feature flag (release)
cd apps/desktop
APPLE_SIGNING_IDENTITY="Apple Distribution: <Name> (P74W7SGX8R)" \
pnpm exec tauri build --target aarch64-apple-darwin \
  --features appstore -c tauri.appstore.conf.json --bundles app

APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Grünerator.app"

# 2. Embed the provisioning profile
cp ~/.gruenerator-signing/Gruenerator_MAS.provisionprofile "$APP/Contents/embedded.provisionprofile"

# 3. Re-sign the .app with entitlements + provisioning (Tauri may have signed already;
#    re-sign to be safe with the MAS entitlements)
codesign --force --deep --options runtime \
  --entitlements src-tauri/Entitlements.appstore.plist \
  --sign "Apple Distribution: <Name> (P74W7SGX8R)" "$APP"

# 4. Build the installer .pkg with the INSTALLER cert
productbuild --component "$APP" /Applications \
  --sign "3rd Party Mac Developer Installer: <Name> (P74W7SGX8R)" \
  Gruenerator.pkg

# 5. Validate + upload (Transporter app, or:)
xcrun altool --validate-app -f Gruenerator.pkg -t macos \
  --apiKey WQ7PJ2B8HU --apiIssuer 10439416-4f0d-4577-b11c-29c022ab6493
xcrun altool --upload-app   -f Gruenerator.pkg -t macos \
  --apiKey WQ7PJ2B8HU --apiIssuer 10439416-4f0d-4577-b11c-29c022ab6493
```

(MAS builds are **not** notarized — App Review replaces notarization.)

---

## 6. Submit for review — and the big caveat

After upload, the build appears in App Store Connect → select it for a version → **Submit
for Review**. Apple review is typically **1–3 days**.

⚠️ **Guideline 4.2 ("minimum functionality / just a web view")**: a Tauri wrapper that
mostly loads the web app risks rejection. Lean on the native value the app already has
(tray, native menus, notifications, deep-link login, offline shell) and be ready to argue
it in the review notes. Plan for at least one rejection round.
