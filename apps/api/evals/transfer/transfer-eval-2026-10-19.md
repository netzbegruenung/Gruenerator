# Übertragungs-Eval 19.10.2026

Lokaler Stack (Branch `fix/leichte-sprache-agent`), Dev-Bypass, Modell `auto`
(Pipeline-Lane: Gemma 4 31B über Cortecs). Eingabe wie im Web-Composer: Text
als Paste-Chip, Eingabezeile leer.

## Vorher

Leichte Sprache. Läufe 1 und 2: `mdl-radvorrangnetz` (12.567 Zeichen) auf
`master`. Lauf 3: `mdl-radschnell` mit neuer Persona und Formatregel, aber noch
ohne Überarbeitungsschleife.

| Lauf                 | Fassung       | Abdeckung                          | Urteil    |
| -------------------- | ------------- | ---------------------------------- | --------- |
| 1                    | 2.103 Zeichen | 17 von 39 vollständig              | ABLEHNUNG |
| 2                    | 2.168 Zeichen | 18 von 38 vollständig              | ABLEHNUNG |
| 3 (`mdl-radschnell`) | —             | 36 von 36, 7 Modalitätsfehler HOCH | ABLEHNUNG |

Ursachen im Systemprompt der Fassung: „bis zu 6 Absätze" bzw. „1-2 Absätze"
aus der generischen Formatregel, der Visual-Block-Katalog, das
Sharepic-Angebot am Schluss, und eine Persona, die Kernaussagen statt des
ganzen Texts verlangte.

## Nachher

| Fall                  | Agent | Zeichen orig/final | Urteil   | Runden | Ø Wörter/Satz | Dauer s |
| --------------------- | ----- | ------------------ | -------- | ------ | ------------- | ------- |
| mdl-radvorrangnetz-ls | LS    | 12645/10109        | FREIGABE | 0      | 8.5           | 24.5    |
| mdl-radvorrangnetz-es | ES    | 12645/9399         | FREIGABE | 1      | –             | 44.3    |
| mdl-radschnell-ls     | LS    | 11222/9494         | FREIGABE | 0      | 6.5           | 21.1    |
| bund-sozialstaat-ls   | LS    | 11341/10556        | FREIGABE | 0      | 6.3           | 23.7    |
| bund-sozialstaat-es   | ES    | 11341/8806         | FREIGABE | 0      | –             | 19.4    |
| bund-klimaschutz-ls   | LS    | 5312/4344          | FREIGABE | 0      | 9.2           | 14.0    |
| bund-klimaschutz-es   | ES    | 5312/4547          | FREIGABE | 0      | –             | 15.4    |
| at-stvo-ls            | LS    | 10506/9949         | FREIGABE | 0      | 7.7           | 23.1    |
| at-stvo-es            | ES    | 10506/8243         | FREIGABE | 0      | –             | 21.8    |
| at-armut-ls           | LS    | 2647/2644          | FREIGABE | 0      | 8.4           | 14.2    |
| lang-geschichte-ls    | LS    | 95808/121351       | FREIGABE | 0      | 6.4           | 126.6   |

In keinem Fall: Schlussangebot, Visual-Block, Prüfspur in der Nachricht,
Seitenrauschen. `numberRecall` bei den Martin-Metz-Seiten (0,17–0,22) misst
die Navigation mit: alle fehlenden Zahlen sind Archivjahre und Beitragsdaten,
die Zahlen des Artikels stehen vollständig in der Fassung.

`lang-geschichte-ls` lief im ersten Durchgang mit Titel, „Worum geht es?" und
Schlusshinweis mitten im Text — die Überarbeitung eines Abschnitts kannte ihre
Position nicht. Behoben (Abschnitts-Hinweis an die Überarbeitung, dazu
`trimSectionFrame`); der Lauf oben ist nach dem Fix.

## Härtetest des Prüfers

Die kaputte Fassung aus Lauf 1 (2.093 Zeichen) direkt in `checkAndRevise`:
Prüfbericht ABLEHNUNG (7 von 24 Punkten vollständig, 7 von 8 Modalitäten
nicht erhalten), nach einer Überarbeitung 8.200 Zeichen, Nachprüfung 0 Punkte
offen → FREIGABE. Der strukturierte Prüfer ist also nicht nachsichtiger
geworden; dass die neuen Fassungen meist in Runde 0 durchgehen, liegt an der
Fassung.

## Live-Chat

Beide Agents im Web-Client mit Dev-Bypass, Text per Paste-Event eingefügt: im
Chat nur der fertige Text (ein Satz pro Zeile bei Leichter Sprache), darunter
die Karte „Prüfprotokoll: …", das Panel dockt nicht von selbst an.

## Offen

- Leichte Sprache: vereinzelt Konjunktiv („würde") — der Prüfer meldet
  Regelverstöße als MITTEL, das löst keine Überarbeitung aus.
- Einfache Sprache übernimmt manchmal den Originaltitel wörtlich.
- Ein Durchgang ist keine Statistik: LLM-Ausgaben schwanken, Läufe vergleichen.
