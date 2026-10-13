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

## Tabellen: Univer

Univer ist die Grundlage der Tabellen im Grünerator. Die quelloffene Bibliothek bringt eine vollwertige Tabellenkalkulation in den Browser – mit Formeln, bedingter Formatierung und Datenvalidierung, wie du es aus Excel oder Google Tabellen kennst. Technisch liefert Univer die Rechenlogik und die Oberfläche in einzelnen Bausteinen, die der Grünerator zusammensetzt und an sein Design anpasst.

[GitHub](https://github.com/dream-num/univer) · [NPM](https://www.npmjs.com/package/@univerjs/core)

## Sharepics & Canvas: Konva

Konva ist die Zeichenfläche hinter dem Canvas-Editor, mit dem du Sharepics und Grafiken gestaltest. Die Bibliothek stellt Texte, Bilder und Formen als einzelne Ebenen auf einer Leinwand dar, die du frei verschieben, drehen und skalieren kannst. Über react-konva fügt sie sich nahtlos in die React-Oberfläche des Grünerators ein.

**Konva:** [GitHub](https://github.com/konvajs/konva) · [NPM](https://www.npmjs.com/package/konva)<br />
**react-konva:** [GitHub](https://github.com/konvajs/react-konva) · [NPM](https://www.npmjs.com/package/react-konva)

## Texteingabe im Canvas: Tiptap

Tiptap ist ein quelloffener Editor-Baukasten auf Basis von ProseMirror. Im Grünerator sorgt er dafür, dass du Texte in Canvas-Grafiken und in gemeinsam bearbeiteten Inhalten direkt formatieren kannst – fett, kursiv, unterstrichen oder als Liste. Er ist zudem der Ursprung von Hocuspocus, dem Echtzeit-Server (siehe unten).

[GitHub](https://github.com/ueberdosis/tiptap) · [NPM](https://www.npmjs.com/package/@tiptap/core)

## Sprachanalyse: spaCy & FastAPI

Für Monitor und Notebooks erkennt der Grünerator, worum es in einem Text geht: Themen, Schlagwörter, Emotionen und Personen. Das übernimmt spaCy, eine quelloffene Bibliothek zur Verarbeitung natürlicher Sprache, mit einem großen deutschen Sprachmodell. FastAPI stellt diese Analyse als eigenen kleinen Dienst bereit, den der Rest des Grünerators abfragen kann.

**spaCy:** [GitHub](https://github.com/explosion/spaCy)<br />
**FastAPI:** [GitHub](https://github.com/fastapi/fastapi)

## Anbindung an KI-Assistenten: Model Context Protocol

Das Model Context Protocol (MCP) ist ein offener Standard, über den KI-Assistenten wie Claude auf externe Werkzeuge und Inhalte zugreifen können. Der Grünerator nutzt das offizielle MCP-SDK, um seine Programm- und Beschlusssuche sowie deine eigenen Inhalte als MCP-Server bereitzustellen – damit du sie auch aus anderen KI-Assistenten heraus verwenden kannst.

[GitHub](https://github.com/modelcontextprotocol/typescript-sdk) · [NPM](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

## Dokumentation: Docusaurus

Diese Dokumentation selbst entsteht mit Docusaurus. Das quelloffene Framework macht aus einfachen Textdateien eine durchsuchbare, übersichtliche Webseite mit Navigation – so bleibt die Doku nah am Code und lässt sich gemeinsam pflegen.

[GitHub](https://github.com/facebook/docusaurus) · [NPM](https://www.npmjs.com/package/@docusaurus/core)

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

**Redis** ist der schnelle Zwischenspeicher im Hintergrund. Er hält Anmeldesitzungen, merkt sich häufig gebrauchte Daten und begrenzt die Zahl der Anfragen pro Person, damit der Dienst für alle stabil bleibt.

[GitHub](https://github.com/redis/redis) · [NPM](https://www.npmjs.com/package/redis)

**Better Auth** kümmert sich um die Anmeldung. Die quelloffene Authentifizierungs-Bibliothek verwaltet Konten und Sitzungen und fügt sich in den Server des Grünerators ein.

[GitHub](https://github.com/better-auth/better-auth) · [NPM](https://www.npmjs.com/package/better-auth)

**Drizzle ORM, Zod & ts-rest** halten Daten und Schnittstellen zusammen. Drizzle beschreibt die Datenbanktabellen als Code, Zod prüft, ob eingehende Daten die erwartete Form haben, und ts-rest legt die Schnittstelle zwischen App und Server einmal fest – beide Seiten teilen sich dieselben Typen, Abweichungen fallen schon beim Entwickeln auf.

**Drizzle:** [GitHub](https://github.com/drizzle-team/drizzle-orm) · [NPM](https://www.npmjs.com/package/drizzle-orm)<br />
**Zod:** [GitHub](https://github.com/colinhacks/zod) · [NPM](https://www.npmjs.com/package/zod)<br />
**ts-rest:** [GitHub](https://github.com/ts-rest/ts-rest) · [NPM](https://www.npmjs.com/package/@ts-rest/core)

**Vite, Tailwind CSS & shadcn/ui** formen die Weboberfläche. Vite baut die Seite und liefert sie schnell aus, Tailwind CSS stellt das Gerüst fürs Styling bereit, und shadcn/ui liefert zugängliche Bausteine wie Dialoge und Menüs, die auf Radix UI und Base UI aufbauen.

**Vite:** [GitHub](https://github.com/vitejs/vite) · [NPM](https://www.npmjs.com/package/vite)<br />
**Tailwind CSS:** [GitHub](https://github.com/tailwindlabs/tailwindcss) · [NPM](https://www.npmjs.com/package/tailwindcss)<br />
**shadcn/ui:** [GitHub](https://github.com/shadcn-ui/ui)

**Zustand & TanStack Query** steuern, was die App weiß. Zustand hält den Zustand auf deinem Gerät, etwa geöffnete Menüs oder Einstellungen. TanStack Query lädt Daten vom Server, merkt sie sich zwischen und aktualisiert sie, wenn sich etwas ändert.

**Zustand:** [GitHub](https://github.com/pmndrs/zustand) · [NPM](https://www.npmjs.com/package/zustand)<br />
**TanStack Query:** [GitHub](https://github.com/TanStack/query) · [NPM](https://www.npmjs.com/package/@tanstack/react-query)

**pdf.js, pdf-lib & docx** lesen und erzeugen Dateien. pdf.js liest den Inhalt hochgeladener PDFs aus, pdf-lib und docx erstellen die PDF- und Word-Dateien, die du aus Dokumenten herunterladen kannst.

**pdf.js:** [GitHub](https://github.com/mozilla/pdf.js) · [NPM](https://www.npmjs.com/package/pdfjs-dist)<br />
**pdf-lib:** [GitHub](https://github.com/Hopding/pdf-lib) · [NPM](https://www.npmjs.com/package/pdf-lib)<br />
**docx:** [GitHub](https://github.com/dolanmiu/docx) · [NPM](https://www.npmjs.com/package/docx)

**Recharts** zeichnet die Diagramme und Auswertungen.

[GitHub](https://github.com/recharts/recharts) · [NPM](https://www.npmjs.com/package/recharts)

**TypeScript** ist die Programmiersprache, in der fast der gesamte Grünerator geschrieben ist. Die von Microsoft entwickelte Erweiterung von JavaScript prüft den Code schon beim Entwickeln auf Fehler, bevor sie bei dir ankommen – das macht den Grünerator stabiler und zuverlässiger.

[GitHub](https://github.com/microsoft/TypeScript) · [NPM](https://www.npmjs.com/package/typescript)

:::info[Offenheit als Prinzip]
All diese Projekte werden offen und gemeinschaftlich entwickelt und stehen damit allen zur Verfügung. Genau wie bei der [europäischen Infrastruktur](./gruenerator-pro-eu) setzt der Grünerator damit bewusst auf Transparenz statt Blackbox.
:::
