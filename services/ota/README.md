# OTA-Server (xprem / expo-open-ota)

Ab Version 1.5.5 holt `apps/mobile` Over-the-air-Updates von
`https://ota.moritz-waechter.de/manifest` statt von EAS Update (`u.expo.dev`).
Grund: die Update-Abfrage bei Expo schickt die IP jedes Geräts an einen
US-Anbieter (#3904). Die App-Seite steht in `apps/mobile/app.config.js`, die
Veröffentlichung in `docs/CLAUDE-expo.md`.

**Solange hier nichts läuft, ist das kein Fehler:** die App findet keinen Server,
startet mit dem eingebauten Bundle und bekommt eben keine Updates. Neue Features
kommen dann über Store-Builds.

Software: [xprem](https://github.com/mercuretechnologies/xprem), MIT-Kern
(Kanäle, Rollback, Dashboard, gestaffelte Rollouts). Die kommerziellen
Zusatzfunktionen (SSO, Audit-Log, Observe, Geräteregister) brauchen wir nicht.
Doku: <https://mercure-technologies.gitbook.io/xprem>.

## Was schon feststeht und nicht mehr geändert werden kann

Diese Werte sind in jede ausgelieferte Binary ab 1.5.5 eingebaut. Wer sie ändert,
braucht einen neuen Store-Build — und die alten Binaries bleiben trotzdem beim
alten Wert:

| Wert     | Stand                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Adresse  | `https://ota.moritz-waechter.de/manifest` — der Server muss unter genau diesem Pfad antworten (`BASE_URL` ohne Pfad) |
| Signatur | `apps/mobile/certs/certificate.pem`, `keyid: main`, `alg: rsa-v1_5-sha256`, gültig bis 29.09.2036                    |
| App-ID   | Header `expo-app-id: 86989c3a-549f-47fe-b141-df891ff6e075` (= EAS-Projekt-ID)                                        |
| Kanäle   | Header `expo-channel-name`: `production` bzw. `preview`                                                              |

**Der private Schlüssel** wurde am 30.09.2026 lokal erzeugt und liegt nicht im
Repo. Er gehört in den Passwortmanager und als `PRIVATE_EXPO_KEY_B64` in Coolify
(`base64 -i private-key.pem`, ebenso für `public-key.pem`). **Geht er verloren,
nimmt keine ausgelieferte Binary mehr ein Update an.**

## Aufsetzen

1. Coolify: neuen Docker-Compose-Dienst aus `docker-compose.yml`, Domain
   `ota.moritz-waechter.de` auf Port 3000, TLS über Coolify.
2. Variablen setzen: `JWT_SECRET` und `DB_KEYS_MASTER_KEY_B64` (je
   `openssl rand -base64 32`), `POSTGRES_PASSWORD`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` (mind. 8 Zeichen, Groß-/Kleinbuchstabe, Ziffer, Sonderzeichen),
   die beiden Schlüssel. **Den Master-Key sichern** — ohne ihn sind die in
   Postgres versiegelten Schlüssel unlesbar.
3. Prüfen, dass der Server mit **unseren** Schlüsseln signiert (siehe unten),
   dann im Dashboard die Kanäle `production` und `preview` je auf den
   gleichnamigen Branch zeigen lassen und einen API-Token anlegen.
4. Erstes Update auf `preview` veröffentlichen, auf einem Preview-Build prüfen,
   erst dann `production`.

**Ungeprüft, beim Aufsetzen verifizieren:** Laut Doku übernimmt der Postgres-Modus
Schlüssel aus `KEYS_STORAGE_TYPE=environment` beim ersten Start („reads your local
or environment keys once and seals them into the database"), beschrieben ist das
aber für die Migration eines zuvor zustandslos laufenden Servers. Wenn der Server
stattdessen ein eigenes Paar erzeugt, passt es nicht zum eingebauten Zertifikat
und jedes Update wird abgelehnt. Sicherer Weg: erst **ohne** `DB_URL` starten
(zustandslos, braucht dann `EXPO_ACCESS_TOKEN`), ein Test-Manifest abrufen, dann
`DB_URL` dazunehmen. Nachsehen, welches Zertifikat der Server nutzt: im Dashboard
unter App Info „Download certificate" und mit
`apps/mobile/certs/certificate.pem` vergleichen.

Rauchtest ohne App:

```bash
curl -s -H 'expo-platform: android' -H 'expo-runtime-version: 1.5.5' \
  -H 'expo-channel-name: preview' \
  -H 'expo-app-id: 86989c3a-549f-47fe-b141-df891ff6e075' \
  -H 'expo-expect-signature: sig, keyid="main", alg="rsa-v1_5-sha256"' \
  -D - https://ota.moritz-waechter.de/manifest -o /dev/null
```

## Datenschutz

Der Server sieht bei jeder Abfrage die IP-Adresse, Plattform, Runtime-Version,
Kanal und die zufällige Installations-ID (`EAS-Client-ID`), die `expo-updates`
mitschickt. `DISABLE_DEVICE_TELEMETRY=true` verhindert, dass xprem daraus ein
Geräteregister baut; `DISABLE_TELEMETRY=true` den Nutzungs-Ping an den Hersteller.
Keine Geolokalisierung (`TRUST_GEOIP_HEADERS`/MaxMind nicht setzen).
