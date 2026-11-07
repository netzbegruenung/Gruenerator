# App: Wissen-Dashboard, Briefing und Umfragen nativ

Stand 07.11.2026. Baut auf PR #5427 (Web: /wissen-Redesign, /briefing) auf und wird als gestapelter PR darauf eröffnet.

## Wozu

Die Web-Seite /wissen hat einen neuen Kopf bekommen: einen Briefing-Slider mit den Schlagzeilen des Tages, die Karten Trends und Umfragen, darunter die Notebook-Regale. Dazu gibt es mit /briefing eine Seite, die Feed, Watcher und Themen & Trends zusammenführt. In der App zeigt der Wissen-Screen (`apps/mobile/app/(focused)/wissen.tsx`) bisher nur die Notebook-Regale, und eine Briefing-Seite fehlt ganz.

Ziel: Die App übernimmt das Web-Design in Handybreite (Web < 768 px) möglichst genau, gebaut aus React-Native-Bausteinen. Wer die App öffnet, sieht dieselbe Lage des Tages wie im Web.

## Ziele

1. **Wissen-Screen** mit demselben Aufbau wie /wissen in Handybreite, von oben nach unten:
   1. Überschrift.
   2. **Briefing-Karte** über die volle Breite:
      - bis zu 6 Schlagzeilen, abwechselnd aus Feed und Watcher;
      - wechselt alle paar Sekunden selbst weiter, mit Punkten und Pause-Knopf;
      - lässt sich wischen;
      - hält an, solange ein Finger darauf liegt;
      - eine von Hand gewählte Folie bleibt stehen.
   3. **Trends** und **Umfragen** als zwei Karten nebeneinander, jede mit wischbaren Folien und Punkten, ohne Selbstwechsel.
   4. **„Deine Notebooks“** mit „Neues erstellen“ und den Notebook-Kacheln. Gruppen-Kacheln klappen ein Feld darunter auf, so wie die Gruppen im Web (`NotebookShelf.tsx`).
2. **Briefing-Screen** wie /briefing in Handybreite:
   - Überschrift „Briefing“ und Leitsatz (`BriefingLeadLine`);
   - sechs aufklappbare Karten: Themen, Keywords, X-Trends, Heute wichtig, Über die Grünen, Landesverbände (die letzte nur unter `de`);
   - darunter die Zeile „Stand …“.
3. **Navigation:**
   - Der Kartenkopf „Briefing“ öffnet den Briefing-Screen.
   - „Trends“ öffnet ihn mit aufgeklappter Karte Keywords, wie im Web (`/briefing?karte=keywords`).
   - Eine Schlagzeile öffnet den Artikel im In-App-Browser (`expo-web-browser`).
   - „Umfragen“ öffnet den nativen Umfragen-Screen (Ziel 8).
4. **Gleiche Zahlen wie im Web:** Für denselben Nutzer und dieselbe Sprache zeigen beide Clients dieselben Schlagzeilen, Trends und Umfragewerte.
5. **Hell und dunkel** mit den Dashboard-Farben des Webs (`apps/web/src/components/dashboard/dashboardTokens.css`).
6. **Barrierefreiheit:**
   - Jede Folie und jeder Punkt hat einen Namen für Screenreader („Meldung 2 von 6“).
   - Der Pause-Knopf ist erreichbar. Er erfüllt im Web WCAG 2.2.2 und muss das auch hier tun.
   - Bei „Bewegung reduzieren“ wechselt nichts von selbst (`AccessibilityInfo.isReduceMotionEnabled`).
   - Zielflächen sind mindestens 44 pt groß, wie in der App üblich.
7. **Laden:** Platzhalter in Kartenform wie `WissenSkeletons.tsx` statt Spinnern. Eine Karte ohne Daten zeigt den leeren Zustand, den das Web dafür hat.

8. **Umfragen-Screen** als Nachbau von /umfragen und /umfragen/:land. Der Screen hält sich so nah wie möglich an das Original, bis in Aufbau, Reihenfolge, Texte und Farben. Vorlage sind:
   - `apps/web/src/features/monitor/pages/MonitorUmfragenPage.tsx`;
   - `components/UmfragenView.tsx`;
   - `components/GreensChoropleth.tsx`;
   - `umfragenRegion.ts`;
   - `bundeslaender.ts`.

   Inhalt im Einzelnen:
   - **Kopfzahl** (`GlanceHero`) und Sonntagsfrage als Balken (`SonntagsfrageBars`) für Bund, Österreich oder ein Bundesland.
   - **Karten** Deutschland, Europa und Länder als Choroplethen: `react-native-svg` (15.16, vorhanden) mit denselben Projektionen aus `d3-geo`, `d3-scale` und `topojson-client`. Das sind reine JS-Bibliotheken; sie werden per `npx expo install` ergänzt, falls sie in der App fehlen.
   - **Geodaten:** Das Web lädt `/geo/de-bundeslaender.geo.json` und `/geo/europe-110m.json` aus seinem `public/`. Die App lädt dieselben Dateien vom Server (`https://gruenerator.eu/geo/…` bzw. dem konfigurierten Host), statt eine zweite Kopie ins Bundle zu legen. Wie, entscheidet der Builder: über die Basis-URL der App oder einen kleinen Helfer.
   - **Antippen eines Bundeslands** öffnet dessen Seite, wie `/umfragen/:land` im Web. Unbekannte Länder führen zurück zur Übersicht.
   - Route Vorschlag: `app/(focused)/umfragen.tsx` mit optionalem Parameter `land`.
   - **Gemeinsamer Code:** Die reinen Funktionen ziehen mit nach `packages/shared`, also `pollFormat.ts`, `umfragenRegion.ts`, `bundeslaender.ts` und die reinen Helfer aus `UmfragenView.tsx`/`GreensChoropleth.tsx` (`partyOrder`, `laenderGrueneValues`, Farbskala).

## Arbeitsteilung

Zwei Agents bauen parallel, jeder im eigenen Worktree auf `feat/mobile-wissen-briefing`:

- **Agent A:** Wissen-Screen und Briefing-Screen (Ziele 1–7).
- **Agent B:** Umfragen-Screen (Ziel 8).

Damit sich beide nicht ins Gehege kommen:

1. **Zuerst, als eigener Commit von A:** das gemeinsame Fundament.
   - Die reinen Funktionen ziehen nach `packages/shared`, mit Tests, und das Web importiert sie von dort. Dazu gehört auch alles für Umfragen (`pollFormat`, `umfragenRegion`, `bundeslaender`).
   - Die Dashboard-Farben kommen ins App-Theme.
   - Die App bekommt die Monitor-Hooks über den Contract-Client, auch `usePolls` und `useEuGreens`.
2. Erst danach startet B. B ändert diese Dateien nicht, sondern ergänzt höchstens. Was B zusätzlich braucht, etwa die Karten-Helfer, legt B in eigenen Dateien an.
3. Die Umfragen-Karte auf dem Wissen-Screen baut A. Sie verlinkt auf die Route von B.

## Nicht-Ziele

- Keine Transparenz-Seite.
- Keine neuen API-Endpunkte und keine Änderung an `monitorContract`.
- Kein Umbau des Notebook-Datenflusses: `useNotebookCollections`, die Freigabe und `NotebookCreator` bleiben, wie sie sind.
- Der Desktop-/Tablet-Aufbau des Webs mit drei Spalten wird nicht nachgebaut. Auf dem Tablet gilt dasselbe einspaltige Layout mit begrenzter Breite (`useContentColumn`).

## Was es nicht werden darf

- **Keine WebView für die neuen Teile.** Die App bekommt native Karten.
- **Keine zweite Kopie der Datenlogik.** Diese Funktionen gibt es im Web bereits rein (ohne DOM):
  - Mischen der Schlagzeilen (`useWissenNews.ts`);
  - Anreißer kürzen (`components/dashboard/teaser.ts`);
  - `timeAgo`;
  - Leitsatz (`briefingLead.ts`);
  - Signal-Auswahl (`briefingSignals.ts`);
  - Umfrage-Formatierung (`monitor/pollFormat.ts`).

  Dasselbe gilt für die nicht DOM-gebundene Logik der Briefing-Karten:
  - `useBriefingNews.ts`;
  - die Datenteile von `SignalCards.tsx`, `NewsCard.tsx` und `BriefingView.tsx` (etwa `standLine`);
  - die Auswahl, was in welche Karte kommt.

  Diese Funktionen ziehen nach `packages/shared` um, samt ihrer Tests, und beide Apps importieren sie von dort. Weichen App und Web in den Zahlen voneinander ab, ist das ein Fehler.

  Bei Hooks wie `useWissenNews` zieht nur der reine Teil um, also Mischen, Kürzen und Formatieren als Funktion über die Antwortdaten. Die Query-Hooks bleiben je App.
- **Kein Dauer-Rerendern.** Die Folien wechseln über Reanimated (`useSharedValue`, Überblenden auf dem UI-Thread). Ein Folienwechsel rendert weder den ganzen Screen noch die Nachbarkarten neu (Lehre aus #5427).
- **Keine eigenen Farbwerte in Komponenten.** Die Dashboard-Farben stehen einmal im App-Theme (`apps/mobile/theme`) für hell und dunkel.

## Rahmen

- **Expo 58, React Native 0.86**, vorhanden sind:
  - `react-native-reanimated` 4.7;
  - `react-native-gesture-handler` 3.3;
  - `expo-web-browser`;
  - TanStack Query 5.
- **Daten über den typisierten Client** (`getContractsClient()` aus `@gruenerator/shared`), so wie `apps/mobile/hooks/useGroupContent.ts`. Die Web-Hooks stehen in `apps/web/src/features/monitor/hooks/useMonitor.ts`:
  - `useMonitorSnapshot`;
  - `useWhatHappened`;
  - `useEntityResults`;
  - `usePolls`;
  - `useEuGreens`.

  Die App bekommt eigene, schlanke Hooks über dieselben Contract-Endpunkte. Die Web-Hooks hängen am `persistedMonitorQuery` des Webs (localStorage).
  - **Parameter wie im Web:** Die App schickt dieselben Abfrageparameter, etwa `useWhatHappened(locale, { days: 7 })` und `useEntityResults('gruene' | 'gruene-at', locale)`. Die Web-Hooks sind die Vorlage.
  - **Kein Speichern auf dem Gerät:** TanStack Query im Speicher mit ähnlicher `staleTime` wie im Web. Ein Kaltstart zeigt kurz die Platzhalter *(meine Entscheidung)*.
  - Die Query-Keys der App wählt ihr Builder.
- **Sprache:** Die Locale kommt aus `useAuth().locale`: `de-AT` wird `at`, alles andere `de`, auch solange das Profil noch lädt. Einen Umschalter in der App gibt es nicht *(meine Entscheidung)*. Unter `at` mischt der Slider nur den Watcher, die Landesverbände-Karte entfällt, und die Umfragen zeigen Österreich (Regeln wie im Web).
- **Expo-Regeln** (`docs/CLAUDE-expo.md`): `npx expo install` statt `pnpm add`, Bilder über `expo-image`.
- **Tests** mit vitest im Paket `packages/shared` für die verschobenen Funktionen. Für die App reichen Tests der reinen Folienlogik im App-Testaufbau (`apps/mobile/CLAUDE-testing.md`): Index, Pause, „Bewegung reduzieren“, Anhalten bei Berührung. Die Animation selbst wird nicht getestet *(meine Entscheidung)*. Die Folienlogik steht deshalb getrennt von der Animation.
- **Verhalten der Folien wie im Web:** Vorlage ist `useAutoAdvance` in `apps/web/src/components/dashboard/slides.tsx`:
  - dasselbe Intervall (`SLIDE_INTERVAL_MS` in `HeadlineSlider.tsx`);
  - eine von Hand gewählte oder gewischte Folie hält an, bis der Pause-Knopf es wieder startet;
  - nach dem Loslassen bekommt die Folie ihre volle Zeit;
  - nur von Hand gewechselte Folien werden für Screenreader angesagt.
- **Farben:** Die Werte in `dashboardTokens.css` sind einfache Farbwerte (kein `color-mix`/`oklch`) und lassen sich übernehmen. Wo das Web Transparenz nutzt, steht der fertige Wert im App-Theme.

## Vorführung

Am Ende läuft beides im **Android-Emulator mit Dev-Auth-Bypass**. Der Bypass greift nur im Android-Emulator; auf iOS gibt `isEmulator()` in `apps/mobile/services/devAuth.ts` immer `false` zurück. Daten liefert entweder das lokale Backend oder der Mock-Server mit echten Monitor-Antworten, auf dem schon das Web gemessen wurde (Port 3011). Er liegt nur lokal unter `/private/tmp/claude-501/-Users-moritzwachter-Gruenerator/4b2718d9-ebba-45bb-aa63-fdf81d57e1c9/scratchpad/wissen-mock/`, nicht im Repo, und braucht Routen für Umfragen und Geodaten. Die App erreicht den Host aus dem Emulator über `EXPO_PUBLIC_API_URL=http://10.0.2.2:<port>/api` (`apps/mobile/services/api.ts`). Gezeigt werden:

- der Wissen-Screen mit laufendem Slider;
- Wischen;
- Pause;
- Trends und Umfragen;
- eine aufgeklappte Gruppe;
- der Briefing-Screen mit einer aufgeklappten Karte;
- der Umfragen-Screen mit Karte und einem angetippten Bundesland;
- hell und dunkel.

## Dem Builder überlassen

- Die Komponenten-Aufteilung unter `apps/mobile/components/` (etwa `components/wissen/`, `components/briefing/`).
- Die Routen von Briefing- und Umfragen-Screen. Vorschlag: `app/(focused)/briefing.tsx`, weil `wissen.tsx` dort liegt. Der Parameter für die aufgeklappte Karte heißt wie im Web `karte`.
- Wie die Folien technisch überblenden, solange Ziel 1 und die Rerender-Regel halten.
- Die genaue Lage der verschobenen Funktionen in `packages/shared` (etwa `src/monitor/`).
