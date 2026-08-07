---
sidebar_position: 2
---

import AgentTiles from '@site/src/components/AgentTiles';

# Landesverband-Grüneratoren

Der Grünerator hat für mehrere Landesverbände **eigene, regional getunte Grüneratoren**. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sprecher\*innen, den lokalen Themen und der typischen Tonalität. Im Hintergrund recherchieren sie automatisch in der Wissensdatenbank des Landesverbands (Pressemitteilungen, Beschlüsse, Wahlprogramme) und im Web.

Es gibt drei Sorten von Landesverband-Grüneratoren:

- **Öffentlichkeitsarbeit** — schreibt Pressemitteilungen und Social-Media-Posts im Stil des Landesverbands.
- **Bürger\*innenanfragen** — formuliert versandfertige, recherchebasierte Antwort-E-Mails auf Anfragen von Bürger\*innen.
- **Wahlprüfsteine** — beantwortet Wahlprüfsteine im Stil und mit den Positionen des Landesverbands.

## Abgedeckte Landesverbände

<AgentTiles />

Jede Kachel verlinkt auf die **Landesverband-Seite** — sie bietet alle drei Grüneratoren des Landesverbands zur Auswahl an: **Öffentlichkeitsarbeit** (siehe unten), **Bürger\*innenanfragen** (siehe unten) und **Wahlprüfsteine**. Darunter stehen die Rezept-Abkürzungen und ein Link zur Wissensdatenbank (Notebook).

:::note[Österreich]
Die Grünen Österreich sind kein Landesverband, sondern die Bundespartei — sie haben aber dieselben drei Grünerator-Typen (erreichbar unter `/agents/gruene-oesterreich`, Wissensdatenbank `/notebooks/oesterreich` · `@at`). Diese Grüneratoren verwenden österreichisches Vokabular (Nationalrat, Klubobfrau\*Klubobmann, Klimaticket) und erscheinen nur für Nutzer\*innen mit österreichischer Einstellung.
:::

## Pressemitteilungen & Social Media schreiben

Du erreichst den Öffentlichkeitsarbeit-Grünerator auf zwei Wegen:

**1. Über die Landesverband-Seite** — öffne die LV-Adresse (z. B. `/agents/gruene-berlin`) und wähle dort **Öffentlichkeitsarbeit**; oder wähle den Grünerator-Agent direkt in der Auswahl im Chat aus. Er bleibt für das ganze Gespräch im LV-Stil.

**2. Über eine Rezept-Abkürzung** — tippe im Chat einen Slash-Befehl wie `/presse-berlin` und direkt dahinter dein Thema. Das Rezept schickt deine Anfrage an den passenden LV-Grünerator und gibt ihm gleich die richtige Aufgabe mit (Pressemitteilung bzw. Instagram-Post).

### LV-Rezepte im Überblick

Für diese Landesverbände gibt es eigene Rezept-Abkürzungen für **Pressemitteilung** und **Instagram**:

| Landesverband          | Pressemitteilung      | Instagram            |
| ---------------------- | --------------------- | -------------------- |
| Berlin                 | `/presse-berlin`      | `/insta-berlin`      |
| Mecklenburg-Vorpommern | `/presse-mv`          | `/insta-mv`          |
| Thüringen              | `/presse-thueringen`  | `/insta-thueringen`  |
| Brandenburg            | `/presse-brandenburg` | `/insta-brandenburg` |
| Bayern                 | `/presse-bayern`      | —                    |

Sachsen-Anhalt, Hessen und das Saarland haben (noch) keine eigenen Rezept-Abkürzungen — ihre Grüneratoren erreichst du über die jeweilige Landesverband-Seite.

:::tip[Allgemeine Rezepte für alle Kanäle]
Unabhängig vom Landesverband gibt es allgemeine Rezepte für jede Plattform: `/presse`, `/instagram`, `/facebook`, `/twitter`, `/linkedin` und `/reel`. Sie greifen auf Beispiele aus allen Landesverbänden zurück. Die LV-Rezepte oben sind die Spezialversion mit eingebautem Regional-Stil.
:::

## Bürger\*innenanfragen beantworten

Die Bürger\*innenanfragen-Grüneratoren helfen dir, eingehende E-Mails von Bürger\*innen zu beantworten. Du fügst die Anfrage ein, der Grünerator-Agent recherchiert die Positionen des Landesverbands (die Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine **versandfertige Antwort-E-Mail** nach festem Aufbau: Anrede → Dank → inhaltliche Antwort → weiterführende Links.

Du erreichst sie über die Landesverband-Seite (z. B. `/agents/gruene-berlin`) — dort wählst du den **Bürger\*innenservice** statt der Öffentlichkeitsarbeit.

## Die Wissensdatenbank dahinter

Jeder Landesverband hat ein **Notebook** — eine durchsuchbare Sammlung seiner offiziellen Inhalte (Pressemitteilungen, Beschlüsse, Wahlprogramme). Die LV-Grüneratoren durchsuchen es automatisch und auf den richtigen Landesverband gefiltert, du musst nichts einstellen.

Du kannst dasselbe Notebook auch direkt nutzen:

- **Aufrufen & durchstöbern:** über seine Adresse, z. B. `/notebooks/berlin`.
- **Im Chat als Quelle einbinden:** tippe die `@`-Erwähnung, z. B. `@berlin`, `@mv`, `@thüringen`, `@brandenburg`, `@bayern`, `@sachsen-anhalt`, `@hessen` oder `@saar`. Der Chat zieht dann seine Antworten aus diesem Notebook.

Mehr zu Notebooks allgemein findest du unter [Notebooks](/docs/wissen/eigenes-notebook-erstellen).
