---
sidebar_position: 99
title: Inhaltsdatenbank
description: Aktuelle Statistiken über die indexierten Inhalte im Grünerator
---

# Inhaltsdatenbank

> Zuletzt aktualisiert: **04.08.2026, 22:22**

## Übersicht

Der Grünerator durchsucht und indexiert Inhalte aus verschiedenen Quellen der Grünen Partei.
Insgesamt sind **33.540 Vektoren** in der Datenbank gespeichert.

## Sammlungen

| Sammlung       |   Vektoren |
| -------------- | ---------: |
| Landesverbände |     19.680 |
| KommunalWiki   |      6.789 |
| Bundestag      |      3.305 |
| Böll-Stiftung  |      2.209 |
| gruene.at      |      1.007 |
| Grünblog       |        550 |
| **Gesamt**     | **33.540** |

## Landesverbände

Die Landesverbände-Sammlung enthält **13.251 Vektoren** aus 9 Quellen.

| Landesverband                   | Kürzel |   Vektoren |
| ------------------------------- | ------ | ---------: |
| Mecklenburg-Vorpommern Fraktion | MV-F   |      2.428 |
| Berlin Fraktion                 | BE-F   |      2.255 |
| Brandenburg                     | BB     |      2.161 |
| Berlin                          | BE     |      1.831 |
| Mecklenburg-Vorpommern          | MV     |      1.414 |
| Sachsen-Anhalt Fraktion         | LSA-F  |      1.385 |
| Thüringen                       | TH     |        771 |
| Bayern                          | BY     |        721 |
| Sachsen-Anhalt                  | LSA    |        285 |
| **Gesamt**                      |        | **13.251** |

## Aktualisierung

- **Landesverbände**: Stündlich zwischen 06:00 und 22:00 Uhr
- **Alle anderen Quellen**: Täglich um 03:00 Uhr

Die Synchronisation läuft automatisch über GitHub Actions.
Neue Inhalte werden erkannt, in Textabschnitte aufgeteilt und als Vektoren (Embeddings) gespeichert.
