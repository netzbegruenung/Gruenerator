# Answer eval — 2026-09-03

Input: /Users/moritzwachter/gr-rerank-mode/apps/api/evals/answer/answers-2026-09-03.json

## Gewinnraten (notebook + qa, Unentschieden zählen im Nenner)

### cut vs today

n=27 cut: 1 (3.7%) tie: 25 (92.6%) today: 1 (3.7%)

### cut vs none

n=27 cut: 1 (3.7%) tie: 25 (92.6%) none: 1 (3.7%)

## Mittlere Richterwerte je Variante (notebook + qa)

| Variante | n   | beantwortet (0-3) | belegt (0-3) | erfundene Quelle | fehlt Wichtiges |
| -------- | --- | ----------------- | ------------ | ---------------- | --------------- |
| filter   | 54  | 2.98              | 3.00         | 3.7%             | 3.7%            |
| today    | 54  | 2.96              | 3.00         | 0.0%             | 3.7%            |
| none     | 54  | 3.00              | 3.00         | 1.9%             | 0.0%            |
| cut      | 54  | 2.96              | 3.00         | 0.0%             | 3.7%            |

## Fälle, in denen die Challenger-Variante verloren hat

### cut vs today

- **boell-atlas** — Fakten aus einem Atlas der Böll-Stiftung, zum Beispiel zu Fleisch oder Mobilität
  - Antwort B geht direkter auf die Frage ein, indem sie explizit auf die Themen Fleisch und Mobilität eingeht, auch wenn sie zu Fleisch keine Informationen hat. Antwort A erwähnt diese Themen nur am Rande und gibt vor, die Quellen hätten etwas zu den Themen, was sie nicht tun. Beide Antworten sind gut in den Quellen verankert, aber Antwort A behauptet, die Quellen hätten etwas, was sie nicht haben, und lässt damit einen wichtigen Aspekt aus, den die Quellen nicht hergeben.

### cut vs none

- **boell-atlas** — Fakten aus einem Atlas der Böll-Stiftung, zum Beispiel zu Fleisch oder Mobilität
  - Antwort B beantwortet die Frage direkter und vollständiger, indem sie spezifische Fakten zu Fleisch und Mobilität aus den genannten Atlanten der Heinrich-Böll-Stiftung bereitstellt. Beide Antworten sind gut in den Quellen verankert und erfinden keine Quellen. Antwort A lässt jedoch wichtige Aspekte aus, die in den Quellen enthalten sein könnten, während Antwort B alle relevanten Informationen liefert.

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
- **neartopic-bvg-monatsabo** (cut vs today) — Was kostet ein BVG-Monatsabo?
  - Gewinner: tie. Beide Antworten beantworten die Frage nicht direkt, sondern gehen auf verschiedene Ticketmodelle und politische Forderungen ein. Sie sind gut in den Quellen verankert, aber keine der Antworten nennt den aktuellen Preis eines regulären BVG-Monatsabos, der in den Quellen nicht enthalten ist.
- **neartopic-bvg-monatsabo** (cut vs none) — Was kostet ein BVG-Monatsabo?
  - Gewinner: tie. Beide Antworten sind sehr ähnlich und beantworten die Frage nicht direkt, sondern listen verschiedene Ticketpreise und politische Forderungen auf. Beide sind gut in den Quellen verankert und erfinden keine Informationen. Die Antworten sind umfangreich, aber nicht präzise genug, um die Frage nach dem Preis eines BVG-Monatsabos direkt zu beantworten.
- **neartopic-abgeordnetenhauswahl** (cut vs today) — Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie den Termin der nächsten Wahl zum Berliner Abgeordnetenhaus korrekt angeben. Sie stützen sich gut auf die bereitgestellten Quellen und erfüllen alle Kriterien gleich gut. Daher ist das Ergebnis ein Unentschieden.
- **neartopic-abgeordnetenhauswahl** (cut vs none) — Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie den Termin der nächsten Wahl zum Berliner Abgeordnetenhaus korrekt angeben. Sie stützen sich gut auf die genannten Quellen und erfüllen alle Kriterien gleich gut. Daher ist das Ergebnis ein Unentschieden.
- **neartopic-muenchen-einwohner** (cut vs today) — Wie viele Einwohner hat München?
  - Gewinner: tie. Beide Antworten sind identisch und geben direkt an, dass die Einwohnerzahl von München nicht in den Quellen enthalten ist. Da keine Quellen angegeben sind, können die Antworten nicht durch Quellen gestützt werden. Beide Antworten sind in diesem Sinne gleichwertig.
- **neartopic-muenchen-einwohner** (cut vs none) — Wie viele Einwohner hat München?
  - Gewinner: tie. Beide Antworten geben an, dass die Einwohnerzahl von München nicht in den Quellen enthalten ist. Da keine Quellen angegeben sind, können die Antworten nicht auf ihre Richtigkeit überprüft werden. Beide Antworten sind gleichwertig, da sie dieselbe Information liefern und keine Quellen angegeben sind.
- **neartopic-landesvorsitz-bayern** (cut vs today) — Wer hat den Landesvorsitz der bayerischen Grünen?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, indem sie klar angeben, dass Eva Lettenbauer und Gisela Sengl die aktuellen Landesvorsitzenden der bayerischen Grünen sind. Beide Antworten stützen ihre Aussagen gut mit den genannten Quellen, und es gibt keine erfundenen Quellen oder fehlenden wichtigen Aspekte. Die Antworten sind inhaltlich nahezu identisch und gleich gut begründet.
- **neartopic-landesvorsitz-bayern** (cut vs none) — Wer hat den Landesvorsitz der bayerischen Grünen?
  - Gewinner: tie. Beide Antworten beantworten die Frage direkt und vollständig, wer den Landesvorsitz der bayerischen Grünen innehat. Sie stützen sich gut auf die genannten Quellen und erfüllen alle Kriterien gleich gut. Daher ist das Ergebnis ein Unentschieden.
- **neartopic-moor-foerdersumme** (cut vs today) — Wie hoch war die Fördersumme für Moorrenaturierung 2024?
  - Gewinner: tie. Beide Antworten sind gleich gut. Sie beantworten die Frage direkt und vollständig, indem sie klarstellen, dass die Fördersumme für die Moorrenaturierung im Jahr 2024 nicht in den Quellen angegeben ist. Beide Antworten stützen sich gut auf die genannten Quellen und erfüllen alle Kriterien gleich gut.
- **neartopic-moor-foerdersumme** (cut vs none) — Wie hoch war die Fördersumme für Moorrenaturierung 2024?
  - Gewinner: tie. Beide Antworten sind gleich gut. Sie beantworten die Frage direkt und vollständig, indem sie klarstellen, dass die Fördersumme für die Moorrenaturierung im Jahr 2024 nicht in den Quellen angegeben ist. Beide Antworten stützen sich auf die bereitgestellten Quellen und erfüllen die Kriterien vollständig.
