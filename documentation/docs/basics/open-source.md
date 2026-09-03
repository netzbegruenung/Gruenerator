---
sidebar_position: 5
title: Worauf der Grünerator aufbaut
description: 'Die freien Projekte, auf denen der Grünerator steht — was jedes davon hier tut und was technisch dahintersteckt.'
---

# Worauf der Grünerator aufbaut

Der Grünerator steht auf den Schultern vieler freier Open-Source-Projekte – Software, die offen entwickelt wird und die alle nutzen, einsehen und weiterentwickeln dürfen. Das passt zu unserer Haltung: Politische Werkzeuge sollten transparent und überprüfbar sein, nicht in einer Blackbox verschwinden. Hier findest du die wichtigsten Bausteine, was sie im Grünerator tun und was technisch dahintersteckt.

## KI-Chat: assistant-ui

assistant-ui ist die Grundlage des KI-Chats im Grünerator. Es ist eine quelloffene React-Bibliothek, die genau die Chat-Oberfläche bereitstellt, die du von ChatGPT kennst – mit Nachrichtenverläufen, Antworten, die Wort für Wort erscheinen, und der Einbindung von Werkzeugen wie der Web-Recherche. Technisch ist assistant-ui bewusst „kopflos" (headless) gehalten: Es liefert das Verhalten und die Bausteine eines Chats, das Aussehen gestaltet der Grünerator komplett selbst – damit sich der Chat grün anfühlt und nahtlos in die Oberfläche einfügt.

[GitHub](https://github.com/assistant-ui/assistant-ui) · [NPM](https://www.npmjs.com/package/@assistant-ui/react)

## Dokumente: BlockNote

BlockNote ist der Editor hinter den Dokumenten im Grünerator. Er funktioniert wie ein modernes Schreibprogramm im Stil von Notion: Du baust deinen Text aus einzelnen Bausteinen – sogenannten Blöcken – wie Überschriften, Listen und Bildern auf und formatierst alles direkt beim Schreiben. Technisch setzt BlockNote auf der etablierten Editor-Grundlage ProseMirror auf, ergänzt sie aber um dieses blockbasierte Konzept und eine fertige Oberfläche. So kannst du Dokumente außerdem mit einem Klick als PDF-, Word- oder OpenDocument-Datei herunterladen.

**BlockNote:** [GitHub](https://github.com/TypeCellOS/BlockNote) · [NPM](https://www.npmjs.com/package/@blocknote/core)<br />
**ProseMirror:** [GitHub](https://github.com/ProseMirror/prosemirror) · [NPM](https://www.npmjs.com/package/prosemirror-view)

## Boards: Kibo UI & dnd-kit

Die verschiedenen Board-Ansichten – Kanban, Tabelle, Kalender, Zeitstrahl und Liste – stammen von Kibo UI. Das ist eine quelloffene Sammlung fertiger, anpassbarer React-Komponenten (im Stil von shadcn/ui), die direkt in den Grünerator übernommen und an unser Design angepasst werden. Das eigentliche Verschieben der Karten übernimmt darunter dnd-kit, eine schlanke Bibliothek für flüssiges und barrierefreies Drag-and-drop. Zusammen sorgen sie dafür, dass du Aufgaben einfach mit der Maus von einer Spalte in die nächste ziehst, neu sortierst und an der passenden Stelle ablegst.

**Kibo UI:** [GitHub](https://github.com/haydenbleasel/kibo)<br />
**dnd-kit:** [GitHub](https://github.com/clauderic/dnd-kit) · [NPM](https://www.npmjs.com/package/@dnd-kit/core)

## Recherche & Dateiablage: Qdrant

Qdrant ist das Herzstück der Recherche und der Dateiablage. Es ist eine quelloffene „Vektor-Suchmaschine": Anders als eine klassische Stichwortsuche findet Qdrant Inhalte nach ihrer Bedeutung. Dafür werden Texte in Zahlenreihen übersetzt, die ihren Sinn abbilden – Qdrant findet dann die Stellen, die inhaltlich am besten passen, auch wenn du andere Worte benutzt als im Originaltext. So findet der Grünerator in deinen hochgeladenen Dateien und recherchierten Quellen die richtigen Passagen wieder und kann sie in seinen Antworten korrekt zitieren.

**Qdrant:** [GitHub](https://github.com/qdrant/qdrant)

Ergänzend dazu durchforstet **Crawlee** für deine Recherche das Web: Es ruft Webseiten auf, liest ihre Inhalte aus und bereitet sie für die Suche auf. So fließen auch aktuelle Quellen aus dem Internet in deine Recherche ein.

**Crawlee:** [GitHub](https://github.com/apify/crawlee) · [NPM](https://www.npmjs.com/package/crawlee)

## Untertitel: FFmpeg

FFmpeg ist das Allzweckwerkzeug für Video und Ton, das im Hintergrund der Untertitel-Funktion arbeitet. Es gilt seit Jahrzehnten als der Industriestandard für die Verarbeitung von Medien und steckt in unzähligen Programmen weltweit. Im Grünerator wandelt es deine Videos um, löst die Tonspur für die Transkription heraus und brennt die fertigen Untertitel fest ins Bild ein. Ohne FFmpeg gäbe es kein fertig untertiteltes Reel zum Herunterladen.

[GitHub](https://github.com/FFmpeg/FFmpeg)

## Zusammenarbeit in Echtzeit: Yjs & Hocuspocus

Yjs und Hocuspocus arbeiten zusammen, damit mehrere Menschen gleichzeitig am selben Dokument oder Board arbeiten können. Yjs ist ein sogenanntes CRDT-Framework: eine Technik, die parallele Änderungen mehrerer Personen automatisch und ohne Konflikte zusammenführt – dieselbe Idee, die auch hinter Google Docs steckt. Hocuspocus ist der passende Server dazu (ursprünglich für den Editor Tiptap entwickelt): Er verbindet alle Beteiligten über eine dauerhafte Echtzeit-Verbindung und sichert den gemeinsamen Stand laufend in der Datenbank, damit keine Eingabe verloren geht.

**Yjs:** [GitHub](https://github.com/yjs/yjs) · [NPM](https://www.npmjs.com/package/yjs)<br />
**Hocuspocus:** [GitHub](https://github.com/ueberdosis/hocuspocus) · [NPM](https://www.npmjs.com/package/@hocuspocus/server)

## Das Fundament

Unter all diesen Funktionen liegt ein Fundament aus bewährten Open-Source-Bausteinen:

**React** ist die Grundlage der gesamten Benutzeroberfläche – im Web wie in der App. Die von Meta entwickelte Bibliothek setzt aus einzelnen Komponenten zusammen, was du auf dem Bildschirm siehst, und aktualisiert Inhalte automatisch, sobald sich etwas ändert.

[GitHub](https://github.com/facebook/react) · [NPM](https://www.npmjs.com/package/react)

**Tauri** verwandelt den Grünerator in eine echte Desktop-App für Windows und Mac. Anders als ältere Lösungen ist Tauri in der Programmiersprache Rust geschrieben und nutzt den im Betriebssystem vorhandenen Browser – dadurch werden die Programme deutlich kleiner und sparsamer. Es kümmert sich außerdem um Dinge wie automatische Updates und Benachrichtigungen.

[GitHub](https://github.com/tauri-apps/tauri) · [NPM](https://www.npmjs.com/package/@tauri-apps/api)

**Expo & React Native** sind die Grundlage der mobilen App für iPhone und Android. React Native erlaubt es, die App einmal zu schreiben und auf beiden Systemen als echte App laufen zu lassen; Expo liefert dazu die Werkzeuge und den Zugriff auf Funktionen wie Kamera, Mikrofon und Mitteilungen.

**Expo:** [GitHub](https://github.com/expo/expo) · [NPM](https://www.npmjs.com/package/expo)<br />
**React Native:** [GitHub](https://github.com/facebook/react-native) · [NPM](https://www.npmjs.com/package/react-native)

**Express** ist der Server, der im Hintergrund alle Anfragen entgegennimmt. Das schlanke Standard-Framework für Node.js leitet jede Anfrage an die richtige Stelle weiter – egal ob du etwas grünerierst, eine Datei hochlädst oder eine Recherche startest.

[GitHub](https://github.com/expressjs/express) · [NPM](https://www.npmjs.com/package/express)

**Vercel AI SDK & LangGraph** bilden zusammen den KI-Motor des Grünerators. Das AI SDK verbindet den Grünerator mit den Sprachmodellen und liefert ihre Antworten Wort für Wort aus, während du zuschaust. LangGraph aus dem LangChain-Umfeld steuert die mehrstufigen Abläufe dahinter und bildet sie als eine Art Ablaufdiagramm ab – etwa wenn der Chat erst recherchiert und dann eine Antwort formuliert.

**Vercel AI SDK:** [GitHub](https://github.com/vercel/ai) · [NPM](https://www.npmjs.com/package/ai)<br />
**LangGraph:** [GitHub](https://github.com/langchain-ai/langgraphjs) · [NPM](https://www.npmjs.com/package/@langchain/langgraph)

**PostgreSQL** ist die Datenbank, in der der Grünerator deine Inhalte sicher speichert – von Dokumenten über Boards bis zu deinen Einstellungen. Sie ist seit Jahrzehnten erprobt und gilt als eine der zuverlässigsten Open-Source-Datenbanken überhaupt.

[GitHub](https://github.com/postgres/postgres)

**TypeScript** ist die Programmiersprache, in der fast der gesamte Grünerator geschrieben ist. Die von Microsoft entwickelte Erweiterung von JavaScript prüft den Code schon beim Entwickeln auf Fehler, bevor sie bei dir ankommen – das macht den Grünerator stabiler und zuverlässiger.

[GitHub](https://github.com/microsoft/TypeScript) · [NPM](https://www.npmjs.com/package/typescript)

:::info[Offenheit als Prinzip]
All diese Projekte werden offen und gemeinschaftlich entwickelt und stehen damit allen zur Verfügung. Genau wie bei der [europäischen Infrastruktur](./gruenerator-pro-eu) setzt der Grünerator damit bewusst auf Transparenz statt Blackbox.
:::
