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
| Signatur | `apps/mobile/certs/certificate.pem`, `keyid: main`, `alg: rsa-v1_5-sha256`, gültig bis 30.09.2036                    |
| App-ID   | Header `expo-app-id: 9af925be-1aa5-426b-98c2-855300438cb3` (App „Gruenerator" im xprem-Dashboard)                    |
| Kanäle   | Header `expo-channel-name`: `production` bzw. `preview`                                                              |

**Die Signaturschlüssel** hat der Server am 30.09.2026 beim Anlegen der App
erzeugt („Managed for you"); sie liegen mit `DB_KEYS_MASTER_KEY_B64`
verschlüsselt in Postgres. Das Zertifikat im Repo stammt aus dem Dashboard (App
Info → Download certificate). **Master-Key und Postgres-Backup gehören beide
gesichert** — fehlt eins davon, nimmt keine ausgelieferte Binary mehr ein Update
an, bis ein neuer Store-Build mit neuem Zertifikat draußen ist.

## Stand 30.09.2026

Läuft in Coolify aus `docker-compose.yml` unter `https://ota.moritz-waechter.de`
(Let's Encrypt), Kanäle `production` und `preview` zeigen auf gleichnamige
Branches, ein API-Token für `production` liegt im Schlüsselbund. Der Rauchtest
unten liefert für beide Kanäle `noUpdateAvailable`, und die Signatur prüft gegen
`apps/mobile/certs/certificate.pem`:

```bash
openssl x509 -in apps/mobile/certs/certificate.pem -pubkey -noout > pub.pem
openssl dgst -sha256 -verify pub.pem -signature sig.bin directive.json
```

(`sig.bin` = base64-dekodierter `sig=` aus dem `expo-signature`-Header des
`directive`-Teils, `directive.json` = dessen Rumpf.)

**Backup:** tägliches Postgres-Volume-Backup um 02:00, 7 Stück, bisher nur lokal
auf dem Coolify-Server. Fällt der Server aus, sind Schlüssel und Backup zugleich
weg — ein Ziel außerhalb (S3/Offsite) fehlt noch. Der Master-Key liegt zusätzlich
im Schlüsselbund.

Erstes Update auf `preview` veröffentlichen, auf einem Preview-Build von 1.5.5
prüfen, erst dann `production`.

Rauchtest ohne App:

```bash
curl -s -H 'expo-platform: android' -H 'expo-runtime-version: 1.5.5' \
  -H 'expo-channel-name: preview' \
  -H 'expo-app-id: 9af925be-1aa5-426b-98c2-855300438cb3' \
  -H 'expo-expect-signature: sig, keyid="main", alg="rsa-v1_5-sha256"' \
  -D - https://ota.moritz-waechter.de/manifest -o /dev/null
```

## Datenschutz

Der Server sieht bei jeder Abfrage die IP-Adresse, Plattform, Runtime-Version,
Kanal und die zufällige Installations-ID (`EAS-Client-ID`), die `expo-updates`
mitschickt. `DISABLE_DEVICE_TELEMETRY=true` verhindert, dass xprem daraus ein
Geräteregister baut; `DISABLE_TELEMETRY=true` den Nutzungs-Ping an den Hersteller.
Keine Geolokalisierung (`TRUST_GEOIP_HEADERS`/MaxMind nicht setzen).
