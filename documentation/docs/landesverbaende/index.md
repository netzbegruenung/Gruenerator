---
sidebar_position: 1
---

import AgentTiles from '@site/src/components/AgentTiles';

# Landesverband-Agents

Der Grünerator hat für mehrere Landesverbände **eigene, regional getunte KI-Agents**. Sie schreiben nicht generisch-grün, sondern im konkreten Stil des jeweiligen Landesverbands — mit den richtigen Sprecher\*innen, den lokalen Themen und der typischen Tonalität. Im Hintergrund recherchieren sie automatisch in der Wissensdatenbank des Landesverbands (Pressemitteilungen, Beschlüsse, Wahlprogramme) und im Web.

Es gibt zwei Sorten von Landesverband-Agents:

- **Öffentlichkeitsarbeit** — schreibt Pressemitteilungen und Social-Media-Posts im Stil des Landesverbands.
- **Bürger\*innenanfragen** — formuliert versandfertige, recherchebasierte Antwort-E-Mails auf Anfragen von Bürger\*innen.

## Abgedeckte Landesverbände

<AgentTiles />

Jede Kachel verlinkt auf die **Landesverband-Seite** — sie bietet beide Agents des Landesverbands zur Auswahl an: **Öffentlichkeitsarbeit** (siehe unten) und **Bürger\*innenanfragen** (siehe unten). Darunter stehen die Skill-Abkürzungen und ein Link zur Wissensdatenbank (Notebook).

:::note Österreich
Die Grünen Österreich sind kein Landesverband, sondern die Bundespartei — sie haben aber dieselben beiden Agent-Typen (Agent `/agents/gruene-oesterreich`, Wissensdatenbank `/notebooks/oesterreich` · `@at`). Diese Agents verwenden österreichisches Vokabular (Nationalrat, Klubobfrau\*Klubobmann, Klimaticket) und erscheinen nur für Nutzer\*innen mit österreichischer Einstellung.
:::

## Pressemitteilungen & Social Media schreiben

Du erreichst einen Öffentlichkeitsarbeit-Agent auf zwei Wegen:

**1. Über die Landesverband-Seite** — öffne die LV-Adresse (z. B. `/agents/gruene-berlin`) und wähle dort den Öffentlichkeitsarbeit-Agent; oder wähle ihn direkt in der Agent-Auswahl im Chat aus. Der Agent bleibt für das ganze Gespräch im LV-Stil.

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
| Bayern                 | `/presse-bayern`      | `/insta-bayern`      |

:::tip Allgemeine Skills für alle Kanäle
Unabhängig vom Landesverband gibt es allgemeine Skills für jede Plattform: `/presse`, `/instagram`, `/facebook`, `/twitter`, `/linkedin` und `/reel`. Sie greifen auf Beispiele aus allen Landesverbänden zurück. Die LV-Skills oben sind die Spezialversion mit eingebautem Regional-Stil.
:::

## Bürger\*innenanfragen beantworten

Die Bürger\*innenanfragen-Agents helfen dir, eingehende E-Mails von Bürger\*innen zu beantworten. Du fügst die Anfrage ein, der Agent recherchiert die Positionen des Landesverbands (die Treffer erscheinen als Recherche-Karten im Chat) und formuliert eine **versandfertige Antwort-E-Mail** nach festem Aufbau: Anrede → Dank → inhaltliche Antwort → weiterführende Links.

Du erreichst sie über die Landesverband-Seite (z. B. `/agents/gruene-berlin`) — dort wählst du den **Bürger\*innenservice** statt der Öffentlichkeitsarbeit. Für eine allgemeine, nicht LV-gebundene Variante gibt es außerdem die Skill `/bürgerservice`.

## Die Wissensdatenbank dahinter

Jeder Landesverband hat ein **Notebook** — eine durchsuchbare Sammlung seiner offiziellen Inhalte (Pressemitteilungen, Beschlüsse, Wahlprogramme). Die LV-Agents durchsuchen es automatisch und auf den richtigen Landesverband gefiltert, du musst nichts einstellen.

Du kannst dasselbe Notebook auch direkt nutzen:

- **Aufrufen & durchstöbern:** über seine Adresse, z. B. `/notebooks/berlin`.
- **Im Chat als Quelle einbinden:** tippe die `@`-Erwähnung, z. B. `@berlin`, `@hamburg`, `@mv`, `@thüringen`, `@brandenburg` oder `@bayern`. Der Chat zieht dann seine Antworten aus diesem Notebook.

Mehr zu Notebooks allgemein findest du unter [Notebooks](/docs/notebooks/eigenes-notebook-erstellen).
