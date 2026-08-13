---
sidebar_position: 1
title: Eigenes Notebook erstellen
---

# Eigenes Notebook erstellen

Ein Notebook bündelt Dokumente zu einem Thema und macht ihren Inhalt im Grünerator durchsuchbar — etwa für Anträge, Beschlüsse, Programme oder Pressemitteilungen. Diese Anleitung führt dich Schritt für Schritt durch die Erstellung deines ersten eigenen Notebooks.

## Was du benötigst

Ein angemeldetes Grünerator-Konto und ein paar Dokumente, die du zusammenfassen, durchsuchen oder als Wissensbasis nutzen möchtest. Unterstützt werden **PDF, DOCX, PPTX, TXT, MD, CSV** sowie Bilder (**PNG, JPG, AVIF**, die per Texterkennung gelesen werden) — bis zu **1.000 Dokumente** pro Notebook und **maximal 50 MB** pro Datei.

Ältere Office-Formate — `.doc`, `.odt` und `.rtf` — kann der Grünerator nicht lesen und nimmt sie deshalb gar nicht erst an. Öffne solche Dateien einmal in Word oder LibreOffice und speichere sie als **PDF** oder **DOCX**.

## Schritt-für-Schritt

Der Editor führt dich durch **drei Schritte**: **Quellen → Details → Überprüfen**. Das Veröffentlichen ist bewusst kein Teil der Erstellung — es passiert später über das **„Teilen"**-Menü (siehe [Notebook teilen](#dein-notebook-teilen-und-veröffentlichen)).

### Schritt 1: Zur Notebook-Übersicht

Öffne in der Navigation **Wissen** (`/wissen`). Auf dieser Seite sind alle Notebooks an einem Ort gebündelt. Solange du noch kein eigenes Notebook hast, liegt in der Notebook-Leiste oben eine Karte **„Neues erstellen"** — ein Klick darauf öffnet direkt den Editor. Sobald du mindestens ein eigenes Notebook besitzt, tritt an ihre Stelle die Karte **„Eigene Notebooks"**: Sie klappt den Abschnitt **„Eigene"** auf, in dem neben der Überschrift der Button **„Notebook erstellen"** sitzt.

### Schritt 2: Quellen wählen

Im ersten Schritt des Editors („Quellen — Woher kommen deine Dokumente?") stehen vier Kacheln zur Auswahl:

- **Dateien hochladen** — Dateien aus dem Dateibrowser auswählen (Mehrfachauswahl möglich) oder per **Drag &amp; Drop** auf das Fenster ziehen.
- **Aus der Wolke verbinden** — einen Ordner aus der Grünen Wolke als Quelle nutzen (siehe Schritt 3).
- **Aus Docs importieren** — eigene Docs als Quelle einbinden (siehe Schritt 3).
- **Von einer Website** — Beiträge und Seiten einer WordPress-Website importieren (siehe Schritt 3).

Beim Hochladen werden die gewählten Dateien zunächst als Vorschau **„Bereit zum Hochladen"** gesammelt. Dort kannst du einzelne Dateien wieder entfernen und startest den Upload dann mit **„Hochladen"**. Überschüssige Uploads jenseits der 1.000 werden mit einem Hinweis abgelehnt.

:::note[Nicht lesbare Dateien werden abgewiesen]
Dateien in einem nicht unterstützten Format oder über 50 MB kommen gar nicht erst in die Vorschau — egal ob du sie über den Dateidialog auswählst oder per Drag & Drop ablegst. Unter der Kachel steht dann, welche Datei aus welchem Grund nicht übernommen wurde.

Scheitert ein Dokument später doch noch bei der Verarbeitung — etwa ein PDF ohne erkennbaren Text —, bleibt es in der Dokumentenliste stehen und ist rot als **„Nicht durchsuchbar"** markiert, mit dem Grund daneben. Über den Hinweis oberhalb der Liste entfernst du alle betroffenen Dokumente auf einmal.
:::

Sobald die erste Datei hochgeladen ist, schlägt der Editor automatisch einen Notebook-Namen vor — abgeleitet vom Dateinamen der ersten Datei (gekürzt auf 60 Zeichen). Mit **„Weiter →"** gelangst du zu Schritt 2 (Details).

:::tip[Hochladen vs. Indexieren]
Das **Hochladen** dauert nur Sekunden, das anschließende **Indexieren** (damit der Inhalt durchsuchbar wird) läuft im Hintergrund weiter. Du erkennst noch laufende Indexierung an einem kleinen Lade-Indikator („Wird verarbeitet…") auf der Dokumenten-Karte. Du kannst das Notebook trotzdem schon erstellen.
:::

#### Optional: Wolke-Ordner anbinden

Wenn du bereits einen Freigabe-Link aus der Grünen Wolke eingerichtet hast, kannst du über die Kachel **„Aus der Wolke verbinden"** einen Cloud-Ordner an dein Notebook hängen. Dokumente aus dem Ordner werden dann automatisch importiert und mit der Wolke synchronisiert. Diese Funktion ist mit einem **„Experimentell"**-Badge gekennzeichnet — der Komfort wächst, aber die Sync-Logik kann sich noch ändern.

Nach der Auswahl einer Verbindung öffnet sich ein Ordner-Browser: Du hängst entweder die ganze Freigabe an oder gezielt einen **Unterordner** daraus — praktisch, wenn nur ein Teil der Freigabe ins Notebook gehört. Mehrere Ordner derselben Freigabe lassen sich nebeneinander anbinden. Jede Ordner-Karte hat außerdem einen Schalter **„Unterordner einbeziehen"**: standardmäßig aus, dann wird nur die oberste Ebene importiert; eingeschaltet zieht der Sync auch alles aus den Unterordnern mit.

Schlägt beim Sync eine Datei fehl, wird sie samt Grund benannt statt stillschweigend übersprungen.

Mehr zur Einrichtung des Wolke-Links: → [Wolke einbinden](/docs/konto/gruene-wolke).

#### Optional: Docs importieren

Über die Kachel **„Aus Docs importieren"** kannst du eigene Docs verknüpfen und als Quelle einbinden — sie werden beim Import in durchsuchbaren Text umgewandelt und lassen sich später per Sync aktualisieren. Auch diese Funktion trägt ein **„Experimentell"**-Badge.

#### Optional: Eine Website einlesen

Über die Kachel **„Von einer Website"** bindest du die Inhalte einer **WordPress**-Website ein — etwa die Seite deines Kreis- oder Landesverbands. Du gibst die Adresse ein, der Grünerator sieht nach, welche Beiträge und Seiten es dort gibt, und du wählst aus, was ins Notebook soll. Rubriken lassen sich dabei gezielt an- und abwählen, statt alles auf einmal zu übernehmen. Wie die Wolke- und die Docs-Quelle trägt auch diese Funktion ein **„Experimentell"**-Badge.

:::note[Nur WordPress]
Der Import setzt voraus, dass die Website mit WordPress läuft und ihre Inhalte maschinenlesbar bereitstellt. Bei anderen Systemen bleibt der Weg über heruntergeladene Dateien.
:::

Websites, die du einmal hinterlegt hast, merkt sich dein Konto — du kannst sie später für weitere Notebooks wiederverwenden, ohne die Adresse erneut einzutragen.

### Schritt 3: Name, Beschreibung und Labels

Im zweiten Schritt („Details — Wie soll dein Notebook heißen?") passt du den vorgeschlagenen **Namen** an (max. 100 Zeichen). Darunter kannst du eine optionale **Beschreibung** hinzufügen (max. 500 Zeichen) — sie hilft dir und anderen, später schnell zu erkennen, worum es im Notebook geht.

Über das Label-Feld vergibst du bis zu **10 Labels** (max. 30 Zeichen pro Label). Labels sind freie Schlagworte und helfen beim Sortieren und Filtern in der Notebook-Übersicht.

### Schritt 4: Überprüfen und erstellen

Im dritten Schritt („Überprüfen — Alles bereit zum Erstellen?") siehst du eine Zusammenfassung: Name, Beschreibung, die Anzahl der Dokumente (eigene, aus der Wolke, aus Docs) und deine Labels.

Klicke unten rechts auf **„Notebook erstellen"**. Der Button bleibt deaktiviert, solange noch kein Name eingetragen oder kein Dokument hochgeladen ist. Nach dem Speichern landest du wieder in der Notebook-Übersicht und siehst eine Erfolgsmeldung.

:::note[Veröffentlichen kommt später]
Beim Erstellen ist dein Notebook **privat**. Ob und für wen es sichtbar wird, legst du danach im **„Teilen"**-Menü fest — siehe unten.
:::

## Dein Notebook teilen und veröffentlichen

Sichtbarkeit und Veröffentlichung sind aus der Erstellung herausgelöst. Der Einstieg ist der **„Teilen"**-Button: Öffne dein Notebook über **Bearbeiten**, dann findest du oben rechts — neben **„Alle Quellen aktualisieren"** — den Button **„Teilen"**. Er ist nur für die Eigentümer\*in sichtbar und öffnet den Dialog **„Notebook teilen"**, in dem du die gesamte Sichtbarkeit steuerst.

(Das **„Teilen"**-Untermenü im Drei-Punkte-Menü der Notebook-Übersicht ist davon getrennt: Es bietet nur **„Link kopieren"** und das direkte Teilen mit einer Gruppe, aber nicht die Sichtbarkeits- und Veröffentlichungseinstellungen.)

Im Dialog **„Notebook teilen"** stellst du die **Sichtbarkeit** ein:

- **„Privat — nur ich"** — Standard. Nur du siehst das Notebook.
- **„Mit Gruppen geteilt"** — sichtbar für ausgewählte Gruppen. Du fügst Gruppen hinzu und legst unter **„Wer darf bearbeiten?"** fest, wer Änderungen vornehmen darf (nur ich / Gruppen-Admins / alle Mitglieder).
- **„Mit Anmeldung — alle eingeloggten Nutzer\*innen"** — sichtbar für alle eingeloggten Nutzer\*innen aus deinem Land.

### Auf „Von der Basis" listen

Im Modus **„Mit Anmeldung"** kannst du zusätzlich den Schalter **„Auf ‚Von der Basis' listen"** aktivieren. Dann taucht dein Notebook für andere in der Suche der Wissen-Seite auf — sie durchsucht System-Notebooks, eigene und die so gelisteten öffentlichen Notebooks gemeinsam; einen eigenen Abschnitt „Von der Basis" gibt es nicht mehr. Sobald du den Schalter aktivierst, musst du eine der beiden Aussagen bestätigen:

- **„Ich besitze die Daten"** — … oder habe die Rechte zur Veröffentlichung; z.&nbsp;B. eigene Texte, Beschlüsse deines Verbands, Material, das du selbst veröffentlichen darfst.
- **„Daten sind öffentlich verfügbar"** — z.&nbsp;B. offizielle Dokumente, Pressemitteilungen, frei zugängliche Veröffentlichungen.

Ohne diese Bestätigung lässt sich das Notebook nicht listen. Hintergrund: Damit stellen wir sicher, dass nur Inhalte mit klarer Rechtelage veröffentlicht werden.

:::warning[Privat ist die sichere Voreinstellung]
Wenn du dir bei den Rechten unsicher bist, lass das Notebook privat — du kannst die Sichtbarkeit jederzeit später ändern.
:::

## Dein Notebook nach der Erstellung

Hinter der Karte **„Eigene Notebooks"** auf der Wissen-Seite erscheint jedes deiner Notebooks als Karte im Abschnitt **„Eigene"**. Ein **Klick** auf die Karte öffnet die Notebook-Detailseite, von der aus du chatten und durchsuchen kannst. Über das **Drei-Punkte-Menü** der Karte erreichst du weitere Aktionen:

- **Bearbeiten** — öffnet wieder den Editor (Quellen, Details, Labels, Wolke, Docs). Auf der Bearbeiten-Seite kannst du Name und Beschreibung auch direkt im Kopfbereich ändern und alle Quellen per **„Alle Quellen aktualisieren"** neu synchronisieren.
- **Teilen** — Untermenü mit **„Link kopieren"** (kopiert die URL des Notebooks) und — falls du in Gruppen bist — Optionen zum direkten Teilen mit einer Gruppe. Die volle Sichtbarkeits- und Veröffentlichungssteuerung liegt dagegen im **„Teilen"**-Button auf der Bearbeiten-Seite (siehe [Notebook teilen](#dein-notebook-teilen-und-veröffentlichen)).
- **Löschen** — entfernt das Notebook unwiderruflich. **Wichtig:** Die enthaltenen Dokumente bleiben in deiner persönlichen Bibliothek erhalten und können in andere Notebooks aufgenommen werden.

## Häufige Fragen

**Wo schalte ich ein Notebook öffentlich?**
Nicht mehr in der Erstellung. Öffne das Notebook über **Bearbeiten** und klicke oben rechts auf **„Teilen"**. Wähle im Dialog die Sichtbarkeit **„Mit Anmeldung"** und aktiviere **„Auf ‚Von der Basis' listen"**, damit es in der Suche der Wissen-Seite auffindbar wird.

**Was passiert mit Dokumenten, wenn ich ein Notebook lösche?**
Die Dokumente bleiben in deiner persönlichen Dokumenten-Bibliothek erhalten — nur die Sammlung wird gelöscht.

**Kann ich dasselbe Dokument in mehrere Notebooks aufnehmen?**
Ja. Beim Bearbeiten eines Notebooks kannst du beliebige Dokumente aus deiner Bibliothek auswählen.

**Wie lange dauert die Indexierung?**
Bei Text-PDFs und reinen Textdateien meist nur Sekunden. Eingescannte PDFs (mit OCR) und sehr große Dateien können einige Minuten brauchen. Das Notebook ist trotzdem sofort nutzbar — neue Dokumente erscheinen in den Antworten, sobald die Indexierung abgeschlossen ist.

**Mein Dokument wird nicht akzeptiert.**
Prüfe die Dateiendung (PDF, DOCX, PPTX, TXT, MD, CSV, PNG, JPG, AVIF) und die Dateigröße (max. 50 MB). Andere Formate — darunter `.doc`, `.odt` und `.rtf` — musst du vorher als PDF oder DOCX speichern.

**Ein Dokument ist rot als „Nicht durchsuchbar" markiert.**
Dann ließ sich beim Verarbeiten kein Text daraus gewinnen; der Grund steht in der Zeile. Häufigster Fall ist eine leere oder beschädigte Datei. Das Dokument bleibt im Notebook, taucht aber in keiner Antwort auf — entferne es und lade es in einem anderen Format erneut hoch.

## Verwandte Themen

- [Wolke einbinden](/docs/konto/gruene-wolke) — Voraussetzung, um Wolke-Ordner an Notebooks zu hängen.
- [Deine Daten im Grünerator](/docs/ueber-den-gruenerator/notebook) — Hintergrund zu Notebooks für Landesverbände und Abgeordnetenbüros.
