---
sidebar_position: 1
---

# Landesverband-Agents

Der Grünerator hat für mehrere Landesverbände **eigene, regional getunte KI-Agents**. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sprecher\*innen, den lokalen Themen und der typischen Tonalität. Im Hintergrund recherchieren sie automatisch in der Wissensdatenbank des Landesverbands (Pressemitteilungen, Beschlüsse, Wahlprogramme) und im Web.

Es gibt zwei Sorten von Landesverband-Agents:

- **Öffentlichkeitsarbeit** — schreibt Pressemitteilungen und Social-Media-Posts im Stil des Landesverbands.
- **Bürger\*innenanfragen** — formuliert versandfertige, recherchebasierte Antwort-E-Mails auf Anfragen von Bürger\*innen.

## Abgedeckte Landesverbände

| Landesverband          | Öffentlichkeitsarbeit           | Bürger\*innenanfragen | Wissensdatenbank                            |
| ---------------------- | ------------------------------- | --------------------- | ------------------------------------------- |
| Berlin                 | ✅ `/agents/gruene-berlin`      | ✅                    | `/notebooks/berlin` · `@berlin`             |
| Hamburg                | ✅ `/agents/gruene-hamburg`     | ✅                    | `/notebooks/hamburg` · `@hamburg`           |
| Mecklenburg-Vorpommern | ✅ `/agents/gruene-mv`          | ✅                    | `/notebooks/mecklenburg-vorpommern` · `@mv` |
| Thüringen              | ✅ `/agents/gruene-thueringen`  | ✅                    | `/notebooks/thueringen` · `@thüringen`      |
| Brandenburg            | ✅ `/agents/gruene-brandenburg` | ✅                    | `/notebooks/brandenburg` · `@brandenburg`   |
| Bayern                 | ✅ `/agents/gruene-bayern`      | ✅                    | `/notebooks/bayern` · `@bayern`             |
| Schleswig-Holstein     | 🛠️ in Vorbereitung              | ✅                    | 🛠️ noch nicht freigeschaltet                |

:::note Österreich
Die Grünen Österreich sind kein Landesverband, sondern die Bundespartei — sie haben aber dieselben beiden Agent-Typen (Agent `/agents/gruene-oesterreich`, Wissensdatenbank `/notebooks/oesterreich` · `@at`). Diese Agents verwenden österreichisches Vokabular (Nationalrat, Klubobfrau\*Klubobmann, Klimaticket) und erscheinen nur für Nutzer\*innen mit österreichischer Einstellung.
:::

Bei Schleswig-Holstein ist die Wissensdatenbank aktuell noch nicht freigeschaltet; der Öffentlichkeitsarbeit-Agent ist deshalb noch nicht voll einsatzbereit. Die Bürger\*innenanfragen-Funktion funktioniert bereits.

## Pressemitteilungen & Social Media schreiben

Du erreichst einen Öffentlichkeitsarbeit-Agent auf zwei Wegen:

**1. Über den Agent direkt** — öffne ihn über seine Adresse (z. B. `/agents/gruene-berlin`) oder wähle ihn in der Agent-Auswahl im Chat aus. Der Agent bleibt für das ganze Gespräch im LV-Stil.

**2. Über eine Skill-Abkürzung** — tippe im Chat einen Slash-Befehl wie `/presse-berlin` und direkt dahinter dein Thema. Die Skill schickt deine Anfrage an den passenden LV-Agent und gibt ihm gleich die richtige Aufgabe mit (Pressemitteilung bzw. Instagram-Post).

### LV-Skills im Überblick

Für diese Landesverbände gibt es eigene Skill-Abkürzungen für **Pressemitteilung** und **Instagram**:

| Landesverband          | Pressemitteilung      | Instagram            |
| ---------------------- | --------------------- | -------------------- |
| Berlin                 | `/presse-berlin`      | `/insta-berlin`      |
| Hamburg                | `/presse-hamburg`     | `/insta-hamburg`     |
| Mecklenburg-Vorpommern | `/presse-mv`          | `/insta-mv`          |
| Thüringen              | `/presse-thueringen`  | `/insta-thueringen`  |
| Brandenburg            | `/presse-brandenburg` | `/insta-brandenburg` |

Für Bayern und Schleswig-Holstein gibt es (noch) keine eigenen Skill-Abkürzungen — nutze dort den Agent direkt über die Agent-Auswahl bzw. `/agents/gruene-bayern`.

:::tip Allgemeine Skills für alle Kanäle
Unabhängig vom Landesverband gibt es allgemeine Skills für jede Plattform: `/presse`, `/instagram`, `/facebook`, `/twitter`, `/linkedin` und `/reel`. Sie greifen auf Beispiele aus allen Landesverbänden zurück. Die LV-Skills oben sind die Spezialversion mit eingebautem Regional-Stil.
:::

### Was die LV-Agents besonders macht

Jeder hand-getunte LV-Agent kennt die Eigenheiten seines Landesverbands. Ein paar Beispiele:

- **Berlin** — ein einziger langer Lead-Satz, gefolgt von einem Block-Zitat; pointierte Wegner-Kritik; Kiez- und Clubkultur-Bezug.
- **Hamburg** — koalitionsfreundlicher Rot-Grün-Ton, Bürgerschafts-Bezug, hanseatischer Weg; zitiert die Fraktion, nie Senator\*innen.
- **Mecklenburg-Vorpommern** — kämpferische Tonalität, Ostsee- und Offshore-Frame, Erneuerbare als Wirtschaftsthema.
- **Thüringen** — außerparlamentarische Oppositionsstimme gegen die „Brombeer-Regierung", „Vorreiter verspielt"-Narrativ.
- **Brandenburg** — durchgehend „Bündnisgrüne" statt „Grüne", Strukturwandel- und Lausitz-Frame, nüchterner Ton.
- **Bayern** — Doppelspitzen-Zitat, „Freiheitsenergie"-Frame, Söder-/Aiwanger-Opposition.

Die Agents erfinden **keine Zitate oder Fakten** — sie recherchieren erst in der LV-Wissensdatenbank und im Web und schreiben dann auf dieser Basis.

## Bürger\*innenanfragen beantworten

Die Bürger\*innenanfragen-Agents helfen dir, eingehende E-Mails von Bürger\*innen zu beantworten. Du fügst die Anfrage ein, der Agent recherchiert die Positionen des Landesverbands (die Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine **versandfertige Antwort-E-Mail** nach festem Aufbau: Anrede → Dank → inhaltliche Antwort → weiterführende Links.

Du findest sie in der Agent-Auswahl unter dem Namen **„Bürger\*innenanfragen (Berlin)"**, **„Bürger\*innenanfragen (Hamburg)"** usw. Für eine allgemeine, nicht LV-gebundene Variante gibt es außerdem die Skill `/bürgerservice`.

## Die Wissensdatenbank dahinter

Jeder Landesverband hat ein **Notebook** — eine durchsuchbare Sammlung seiner offiziellen Inhalte (Pressemitteilungen, Beschlüsse, Wahlprogramme). Die LV-Agents durchsuchen es automatisch und auf den richtigen Landesverband gefiltert, du musst nichts einstellen.

Du kannst dasselbe Notebook auch direkt nutzen:

- **Aufrufen & durchstöbern:** über seine Adresse, z. B. `/notebooks/berlin`.
- **Im Chat als Quelle einbinden:** tippe die `@`-Erwähnung, z. B. `@berlin`, `@hamburg`, `@mv`, `@thüringen`, `@brandenburg` oder `@bayern`. Der Chat zieht dann seine Antworten aus diesem Notebook.

Mehr zu Notebooks allgemein findest du unter [Notebooks](/docs/notebooks/eigenes-notebook-erstellen).

:::info Technischer Hintergrund
Der Stil jedes hand-getunten LV-Agents stammt aus einer Korpusanalyse von echten Pressemitteilungen des jeweiligen Landesverbands. Die Analysen liegen im internen Bereich unter **Landesverband-Korpusanalyse** und richten sich an die Personen, die die Agents pflegen.
:::
