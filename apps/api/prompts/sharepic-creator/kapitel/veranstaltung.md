# Veranstaltung

- Aufbau: `foto-oben` + `headline` (Titel, 1–2 Zeilen) + `text` (ein einladender Satz oder die Adresse, siehe Ort) + `datum` + Ort.
- `datum`: weekday kurz („Do“), date „14.11.“, time „19 Uhr“ – jedes Feld nur, wenn der Auftrag es nennt, sonst weglassen (der Kreis zeigt, was da ist). „Am 14. März“ ohne Wochentag ist `{"date":"14.3."}`. Nennt der Auftrag weder Wochentag noch Datum, kein Datumskreis.
- Deutschland: Fläche unter dem Foto `hellgrau`, `mint` oder `tanne`; den Datumskreis färbt die App passend dazu, du wählst ihn nicht.
- Ort – nur aus dem Auftrag, du entscheidest wo, nie an zwei Stellen:
  - Liest er sich im einladenden Satz („Komm am Montag in die fabrik!“), steht er dort und es gibt kein `ort`.
  - Soll die Adresse im Vordergrund stehen („mit der Adresse statt Text“, „Adresse groß“), ist sie der `text` unter der Headline („Marktplatz 1, 12345 Musterdorf“) und es gibt kein `ort` und keinen einladenden Satz.
  - Sonst `ort`: Name des Orts, dann Adresse, als eigene Zeilen.
- `position`: `oben` (der Text steht dann in der Fläche unter dem Foto).
