---
sidebar_position: 3
title: GrünOMat einbetten
draft: true
---

# GrünOMat auf deiner Website einbetten

Der GrünOMat lässt sich als Chat-Widget auf externen Websites einbinden. Besucher\*innen sehen einen schwebenden Chat-Button, der beim Klicken ein Chat-Fenster mit dem GrünOMat öffnet.

## Schnellstart

Füge folgendes Script-Tag am Ende deines `<body>` ein:

```html
<script src="https://gruen-o-mat.eu/embed.js" data-collection="hamburg-system"></script>
```

Das war's — auf deiner Seite erscheint ein grüner Chat-Button unten rechts, der den GrünOMat mit den Inhalten der Grünen Hamburg öffnet.

## Konfiguration

Das Widget lässt sich über `data-*` Attribute am Script-Tag konfigurieren:

| Attribut          | Standard           | Beschreibung                                            |
| ----------------- | ------------------ | ------------------------------------------------------- |
| `data-collection` | `gruene-de-system` | Quellensammlung für den Chat (siehe unten)              |
| `data-position`   | `bottom-right`     | Position des Buttons: `bottom-right` oder `bottom-left` |
| `data-color`      | `#316049`          | Farbe des Chat-Buttons und der Titelleiste              |
| `data-title`      | `Grün-O-Mat`       | Titel im Chat-Fenster                                   |

### Verfügbare Sammlungen

| Collection-ID               | Landesverband            |
| --------------------------- | ------------------------ |
| `hamburg-system`            | Grüne Hamburg            |
| `schleswig-holstein-system` | Grüne Schleswig-Holstein |
| `thueringen-system`         | Grüne Thüringen          |
| `bayern-system`             | Grüne Bayern             |
| `berlin-system`             | Grüne Berlin             |

## Beispiel mit allen Optionen

```html
<script
  src="https://gruen-o-mat.eu/embed.js"
  data-collection="bayern-system"
  data-position="bottom-left"
  data-color="#1a7a4c"
  data-title="Grüne Bayern"
></script>
```

:::tip Stil-Isolation
Das Widget nutzt Shadow DOM — die CSS-Stile deiner Website beeinflussen das Widget nicht und umgekehrt.
:::

## Domain-Freischaltung

Aus Sicherheitsgründen muss die Domain, auf der das Widget eingebettet wird, freigeschaltet werden. Ohne Freischaltung blockiert der Browser das Laden des Chat-Fensters (iframe).

Um deine Domain freischalten zu lassen, schreib eine E-Mail an das Grünerator-Team mit der Domain (z.B. `https://mein-kreisverband.de`).

:::info Lokale Entwicklung
Für lokale Tests (`localhost`) ist keine Freischaltung nötig — `'self'` ist immer erlaubt.
:::

## Technische Details

- Das Widget lädt den Chat-Iframe **erst beim ersten Klick** auf den Button (kein Performance-Overhead beim Seitenaufruf)
- Mobilgeräte: Das Chat-Fenster wird automatisch im Vollbild angezeigt
- Schließen: Klick auf ✕, Klick auf den Hintergrund, oder Escape-Taste
- Der Chat-Button verwendet `z-index: 2147483646` um über allen anderen Elementen zu liegen
