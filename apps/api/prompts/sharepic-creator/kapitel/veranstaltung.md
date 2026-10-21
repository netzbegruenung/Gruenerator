# Veranstaltung

- Aufbau: `foto-oben` + `headline` (Titel, 1–2 Zeilen) + `text` (ein einladender Satz) + `datum` + Ort.
- `datum`: weekday kurz („Do“), date „14.11.“, time „19 Uhr“ – jedes Feld nur, wenn der Auftrag es nennt, sonst weglassen (der Kreis zeigt, was da ist). „Am 14. März“ ohne Wochentag ist `{"date":"14.3."}`. Nennt der Auftrag weder Wochentag noch Datum, kein Datumskreis.
- Deutschland: Fläche unter dem Foto `hellgrau`, `mint` oder `tanne`; den Datumskreis färbt die App passend dazu, du wählst ihn nicht.
- Ort – nur aus dem Auftrag, du entscheidest wo: Liest er sich im einladenden Satz („Komm am Montag in die fabrik!“), steht er dort und es gibt kein `ort`. Sonst `ort`: Name des Orts, dann Adresse, als eigene Zeilen – besonders, wenn eine Adresse dabei ist. Nie beides.
- `position`: `oben` (der Text steht dann in der Fläche unter dem Foto).
