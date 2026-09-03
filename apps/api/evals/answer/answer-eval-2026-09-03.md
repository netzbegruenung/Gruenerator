# Answer eval — 2026-09-03

Input: /Users/moritzwachter/gr-rerank-mode/apps/api/evals/answer/answers-2026-09-03.json

## Gewinnraten (notebook + qa, Unentschieden zählen im Nenner)

### filter vs today

n=27 filter: 1 (3.7%) tie: 25 (92.6%) today: 1 (3.7%)

### filter vs none

n=27 filter: 0 (0.0%) tie: 25 (92.6%) none: 2 (7.4%)

## Mittlere Richterwerte je Variante (notebook + qa)

| Variante | n   | beantwortet (0-3) | belegt (0-3) | erfundene Quelle | fehlt Wichtiges |
| -------- | --- | ----------------- | ------------ | ---------------- | --------------- |
| filter   | 54  | 2.98              | 3.00         | 3.7%             | 3.7%            |
| today    | 27  | 2.96              | 3.00         | 0.0%             | 3.7%            |
| none     | 27  | 3.00              | 3.00         | 0.0%             | 0.0%            |

## Fälle, in denen `filter` verloren hat

### filter vs today

- **gruene-de-waermepumpe** — Förderung beim Heizungstausch und Wärmepumpen
  - Antwort A beantwortet die Frage direkt und vollständig, stützt sich gut auf die Quellen und erfindet keine Aussagen. Antwort B enthält zwar ebenfalls relevante Informationen, erwähnt aber den 10-Punkte-Plan für das Update der Energiewende im Jahr 2026, was nicht durch die Quellen gestützt wird und somit eine erfundene Aussage darstellt. Zudem fehlt in Antwort B die Erwähnung der sozialen Förderung durch das GEG, die in den Quellen enthalten ist.

### filter vs none

- **gruene-de-waermepumpe** — Förderung beim Heizungstausch und Wärmepumpen
  - Antwort A und Antwort B beantworten die Frage direkt und vollständig. Beide sind gut in den Quellen verankert. Antwort B enthält jedoch eine erfundene Aussage über das Jahr 2026, das in den Quellen nicht erwähnt wird.
- **boell-atlas** — Fakten aus einem Atlas der Böll-Stiftung, zum Beispiel zu Fleisch oder Mobilität
  - Antwort A ist direkter und vollständiger in der Beantwortung der Frage, da sie sowohl die Themen Fleisch als auch Mobilität detailliert behandelt. Antwort B konzentriert sich stärker auf die Machtstrukturen und regionale ökologische Herausforderungen, lässt jedoch wichtige Aspekte wie die spezifischen Auswirkungen auf Fleisch und Mobilität vermissen. Beide Antworten sind gut in den Quellen verankert und erfinden keine Quellen.

## Near-topic (nicht in den Gewinnraten — die richtige Antwort ist "dazu steht im Notebook wenig")

- **neartopic-bvg-monatsabo** (filter vs today) — Was kostet ein BVG-Monatsabo?
  - Gewinner: tie. Beide Antworten beantworten die Frage nicht direkt, da sie keinen aktuellen Standardpreis für ein reguläres BVG-Monatsabo nennen. Sie sind jedoch gut in den Quellen verankert und erfinden keine Informationen. Beide Antworten sind inhaltlich sehr ähnlich und liefern detaillierte Informationen zu verschiedenen Ticketmodellen und sozialen Vergünstigungen, ohne jedoch die spezifische Frage zu beantworten.
- **neartopic-bvg-monatsabo** (filter vs none) — Was kostet ein BVG-Monatsabo?
  - Gewinner: tie. Beide Antworten sind sehr ähnlich und beantworten die Frage nicht direkt, sondern listen verschiedene Ticketmodelle und Preise auf. Sie sind gut in den Quellen verankert und erfinden keine Informationen. Die Antworten sind detailliert, aber nicht präzise genug, um die Frage nach dem Preis eines BVG-Monatsabos direkt zu beantworten.
- **neartopic-abgeordnetenhauswahl** (filter vs today) — Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie den Termin der nächsten Wahl zum Berliner Abgeordnetenhaus korrekt angeben. Beide Antworten stützen sich gut auf die bereitgestellten Quellen und erfüllen alle relevanten Kriterien. Es gibt keine erfundenen Quellen oder fehlenden wichtigen Aspekte in beiden Antworten.
- **neartopic-abgeordnetenhauswahl** (filter vs none) — Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie den Termin der nächsten Wahl zum Berliner Abgeordnetenhaus korrekt angeben und detaillierte Informationen aus den Quellen zitieren. Beide Antworten sind gut in den bereitgestellten Quellen verankert und erfüllen die Kriterien gleich gut. Es gibt keine erfundenen Quellen oder fehlenden wichtigen Aspekte in beiden Antworten.
- **neartopic-muenchen-einwohner** (filter vs today) — Wie viele Einwohner hat München?
  - Gewinner: tie. Beide Antworten geben zu, dass sie die Einwohnerzahl von München nicht beantworten können. Da keine Quellen angegeben sind, können die Antworten nicht auf Quellen gestützt werden. Beide Antworten sind gleichwertig, da sie dieselbe Information liefern und keine Quellen erfunden oder wichtige Aspekte übersehen haben.
- **neartopic-muenchen-einwohner** (filter vs none) — Wie viele Einwohner hat München?
  - Gewinner: tie. Beide Antworten sind identisch und geben direkt an, dass die Einwohnerzahl von München nicht in den Quellen enthalten ist. Da keine Quellen angegeben sind, können die Antworten nicht durch Quellen gestützt werden. Beide Antworten sind in diesem Sinne gleichwertig.
- **neartopic-landesvorsitz-bayern** (filter vs today) — Wer hat den Landesvorsitz der bayerischen Grünen?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie klar benennen, dass Eva Lettenbauer und Gisela Sengl die aktuellen Landesvorsitzenden der bayerischen Grünen sind. Beide Antworten stützen sich gut auf die genannten Quellen, die die Aussagen über die aktuelle Führung der Partei bestätigen. Keine der Antworten erfindet Quellen oder Aussagen, und keine wichtige Information aus den Quellen wird ausgelassen. Daher ist das Ergebnis ein Unentschieden.
- **neartopic-landesvorsitz-bayern** (filter vs none) — Wer hat den Landesvorsitz der bayerischen Grünen?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie klar benennen, dass Eva Lettenbauer und Gisela Sengl die aktuellen Landesvorsitzenden der bayerischen Grünen sind. Beide Antworten stützen sich gut auf die genannten Quellen, die die Aussagen zu den Vorsitzenden und deren Wahl bestätigen. Keine der Antworten erfindet Quellen oder Aussagen, und keine wichtige Information aus den Quellen fehlt. Beide Antworten sind gleichwertig.
- **neartopic-moor-foerdersumme** (filter vs today) — Wie hoch war die Fördersumme für Moorrenaturierung 2024?
  - Gewinner: tie. Beide Antworten sind gleich gut. Sie beantworten die Frage direkt und vollständig, indem sie klarstellen, dass die Quellen keine spezifische Fördersumme für die Moorrenaturierung im Jahr 2024 enthalten. Beide Antworten stützen sich gut auf die genannten Quellen und erfinden keine Informationen. Keine der Antworten lässt wichtige Aspekte aus, die in den Quellen enthalten sind.
- **neartopic-moor-foerdersumme** (filter vs none) — Wie hoch war die Fördersumme für Moorrenaturierung 2024?
  - Gewinner: tie. Beide Antworten sind gleich gut. Sie beantworten die Frage direkt und vollständig, indem sie klarstellen, dass die Quellen keine spezifische Fördersumme für die Moorrenaturierung im Jahr 2024 enthalten. Beide Antworten stützen sich gut auf die genannten Quellen und erfüllen alle Kriterien gleich gut.
