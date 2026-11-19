# Google Workspace connector: Einrichtung außerhalb des Codes

Stand 19.11.2026. Der Code ist fertig: Google steht nicht mehr in `HIDDEN_NANGO_PROVIDERS`, die Karte „Google Workspace" (experimentell) liegt im Konnektor-Verzeichnis, und der Cloud-Browser im Chat öffnet für Google den Google Picker (`GET /api/connections/google/picker`). Damit „Verbinden" und die Dateiauswahl in Prod wirklich funktionieren, braucht es die Schritte unten. Vorbild ist `microsoft-connector-chrome-todo.md`.

## Warum der Picker

Der OAuth-Client fragt nur den Scope `https://www.googleapis.com/auth/drive.file` an. Damit sieht der Grünerator ausschließlich Dateien, die die Person im Picker ausgewählt hat, und Google stuft den Scope als „nicht sensibel" ein. Bei `drive.readonly` wäre der Scope „restricted", und Google verlangt dann eine Verifizierung mit jährlicher Sicherheitsbewertung (CASA). Deshalb gibt es für Google keine Ordneransicht.

## A. Google Cloud Console (ein Projekt für alles)

OAuth-Client, API-Key und App-ID **müssen aus demselben Cloud-Projekt stammen**, sonst lehnt der Picker den Token ab.

1. APIs aktivieren: **Google Drive API**, **Google Docs API**, **Google Sheets API**, **Google Picker API**.
2. OAuth-Zustimmungsbildschirm:
   - Typ „Extern“, App-Name „Grünerator“, Support-Mail, Datenschutz-Link `https://gruenerator.eu/datenschutz`, autorisierte Domain `gruenerator.eu`.
   - Scopes: `openid`, `email`, `profile`, `drive.file` und sonst nichts.
   - **Veröffentlichungsstatus auf „In Produktion“ setzen.** Im Status „Testen“ kommen nur eingetragene Testkonten durch, und Refresh-Tokens laufen nach 7 Tagen ab.
   - Wegen der Markenprüfung (Name und Logo) kann Google ein paar Tage brauchen. Bei nur nicht sensiblen Scopes ist keine Sicherheitsbewertung nötig.
3. Anmeldedaten → OAuth-Client-ID, Typ „Webanwendung“:
   - autorisierte Weiterleitungs-URI `https://nango.gruenerator.eu/oauth/callback` (Beta: der Nango-Host der Beta-Instanz)
   - autorisierter JavaScript-Ursprung `https://gruenerator.eu`
4. Anmeldedaten → API-Schlüssel:
   - Einschränkung „Websites“ mit `https://gruenerator.eu/*` (Beta: deren Domain zusätzlich)
   - API-Einschränkung nur auf „Google Picker API“
5. Die **Projektnummer** (nicht die Projekt-ID) aus den Projekteinstellungen ist die App-ID.

## B. Nango (je Umgebung die eigene Instanz)

1. Integration anlegen, Anbieter „Google“ (bzw. „Google Drive“).
2. **Unique Key genau `google`.** `NANGO_PROVIDERS` in `apps/api/config/nango.ts` verwendet diesen String fest.
3. Client-ID und Client-Secret aus A.3 eintragen, Scopes wie oben: `openid email profile https://www.googleapis.com/auth/drive.file`.
4. Die Umgebung muss dieselbe sein, deren Secret Key das Backend nutzt (siehe die Memory zur Nango-Key-Drift: `prod.sls` und `test.sls` zeigen auf denselben Passbolt-Eintrag).

## C. Salt

In `states/gruenerator-docker/files/backend.env.j2`:

```
GOOGLE_PICKER_API_KEY={{ pillar["passbolt"][pillar["gruenerator"]["google-picker-api-key-uuid"]] }}
GOOGLE_PICKER_APP_ID={{ pillar["gruenerator"]["google-picker-app-id"] }}
```

- Den API-Key in Passbolt ablegen und die UUID als `google-picker-api-key-uuid` in `pillars/gruenerator/{prod,test}.sls` eintragen.
- `google-picker-app-id` ist die Projektnummer und kein Geheimnis, sie kommt als normaler Pillar-Wert dazu.
- Fehlen die beiden Variablen, antwortet die Picker-Route mit 404, und der Chat zeigt „Die Dateiauswahl für Google Drive ist noch nicht eingerichtet.“

## D. Prüfen

1. `/admin/konnektoren` → Google: Verbinden, Picker öffnen, ein Google-Doc und eine PDF lesen. Beide müssen Chunks liefern.
2. Als normales Konto: Einstellungen → Konnektoren → „Google Workspace“ → Verbinden. Dann im Chat Plus-Menü → Datei hinzufügen → Google Drive → „In Google Drive auswählen…“ → Datei wählen → senden. Die Antwort muss aus der Datei zitieren.

## Bekannte Grenzen

- **Desktop (Tauri):** Die CSP lässt `apis.google.com` nicht zu, und der API-Key ist auf `gruenerator.eu` eingeschränkt. Der Picker öffnet dort nicht, der Chat zeigt dann die Fehlermeldung.
- **Mobile:** Es gibt keinen Picker. Wer verbunden ist, sieht in der App unter Google Drive nur die Dateien der obersten Ebene, die schon einmal im Web ausgewählt wurden, wegen `drive.file` meist nichts.
- **Lokal und Beta:** Der Picker-Key gilt nur für die eingetragenen Domains.
