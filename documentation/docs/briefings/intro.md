---
sidebar_position: 0
title: 'Briefing-Agents'
---

# Briefing-Agents

Autonome Agenten, die automatisiert Nachrichten sammeln, filtern und per E-Mail als KI-Briefing versenden.

## Aktive System-Agenten

| Agent                           | Quellen                                                                                 | Zeitplan          | Beschreibung                                         |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| Grüne Pressespiegel             | 10 RSS-Feeds (Tagesschau, Spiegel, ZEIT, SZ, FAZ, Welt, Stern, n-tv, Handelsblatt, ZDF) | Täglich 20:00     | Keyword-Filter nach Grünen-Themen, Tonalitätsanalyse |
| Friedrich Merz Briefing         | Web-Suche (SearXNG)                                                                     | Täglich 20:00     | Nachrichten über Friedrich Merz aus allen Quellen    |
| Iran-Berichterstattung ZEIT     | Web + RSS (ZEIT Politik)                                                                | Täglich 18:00     | Iran-Artikel auf zeit.de                             |
| SPD Instagram Monitor           | Instagram (Apify)                                                                       | Täglich 19:00     | Posts von @spdde                                     |
| Söder isst — Vegane Alternative | Instagram (Apify) + Keyword "söderisst"                                                 | Wöchentlich 10:00 | Söders Essens-Posts mit veganer Rezeptalternative    |
| Grüne Berlin — Neue Inhalte     | Qdrant-Dokumente (LV Berlin)                                                            | Wöchentlich 09:00 | Neu indexierte Inhalte von Grüne Berlin              |

## Datenquellen

- **Web-Suche**: SearXNG (self-hosted) mit Domain-Filter
- **RSS**: 51 verifizierte Feeds (21 DE national, 6 DE regional, 15 AT, 5 EU/Spezial)
- **Instagram**: Apify Cloud (apify/instagram-post-scraper)
- **Twitter/X**: TODO (Apify-Actor benötigt Paid Plan)
- **Dokumente**: Qdrant-Vektorsuche (Landesverbände, Bundespartei, etc.)

## Archiv

Vergangene Briefings werden hier archiviert.
