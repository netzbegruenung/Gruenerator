# Evidence-signal calibration, round 2 (refs #3140)

Depth `deep`, live Qdrant + reranker, 35 cases (13 on-topic, 17 off-topic — 30 deciding; 5 near-topic, reported only).

`denseTop` is `evidenceTopOf` — the same function production runs.

| id                                 | group      | candidates | denseTop | denseMedian | denseMargin | rerankTop | rerankMedian | rerankMargin | rerankTop3Mean | aboveThresholdShare | goldRank | path   |
| ---------------------------------- | ---------- | ---------- | -------- | ----------- | ----------- | --------- | ------------ | ------------ | -------------- | ------------------- | -------- | ------ |
| notebook-berlin-hitzeschutz        | on-topic   | 40         | 0.9895   | 0.9414      | 0.0481      | 0.7206    | 0.3982       | 0.3225       | 0.5835         | 1.0000              | 1        | legacy |
| notebook-berlin-milieuschutz       | on-topic   | 40         | 1.0000   | 1.0000      | 0.0000      | 0.8961    | 0.5670       | 0.3290       | 0.7709         | 1.0000              | 2        | legacy |
| notebook-bayern-moorschutz         | on-topic   | 40         | 1.0000   | 0.9577      | 0.0423      | 0.9478    | 0.6082       | 0.3396       | 0.8044         | 1.0000              | 3        | legacy |
| notebook-at-klimaticket            | on-topic   | 30         | 0.9619   | 0.9472      | 0.0147      | 0.5609    | 0.3200       | 0.2410       | 0.5044         | 1.0000              | 1        | legacy |
| notebook-user-ausschreibungen      | on-topic   | 20         | 0.9803   | 0.9447      | 0.0356      | 0.7798    | 0.1949       | 0.5849       | 0.6238         | 0.5000              | 1        | legacy |
| notebook-user-haushaltsplan        | on-topic   | 11         | 1.0000   | 1.0000      | 0.0000      | 0.6251    | 0.3111       | 0.3140       | 0.6121         | 0.9091              | 2        | legacy |
| notebook-history-moorschutz        | on-topic   | 60         | 0.9861   | 0.8964      | 0.0897      | 0.9476    | 0.6051       | 0.3425       | 0.8384         | 1.0000              | 2        | legacy |
| notebook-history-flaechenfrass     | on-topic   | 60         | 0.9957   | 0.8843      | 0.1115      | 0.7510    | 0.4836       | 0.2674       | 0.7117         | 1.0000              | 1        | legacy |
| notebook-history-artenvielfalt     | on-topic   | 60         | 1.0000   | 0.9623      | 0.0377      | 0.8569    | 0.5503       | 0.3066       | 0.8204         | 1.0000              | 3        | legacy |
| chat-nb-berlin-verkehr             | on-topic   | 40         | 0.9956   | 0.9221      | 0.0735      | 0.9445    | 0.8095       | 0.1350       | 0.9244         | 1.0000              | 4        | legacy |
| chat-nb-berlin-baumfaellmoratorium | on-topic   | 40         | 0.9581   | 0.9263      | 0.0318      | 0.8752    | 0.4972       | 0.3780       | 0.8453         | 1.0000              | —        | legacy |
| chat-nb-bayern-artenvielfalt       | on-topic   | 40         | 0.9956   | 0.9788      | 0.0167      | 0.9362    | 0.6027       | 0.3335       | 0.8768         | 1.0000              | 1        | legacy |
| chat-nb-bayern-flaechenfrass       | on-topic   | 40         | 1.0000   | 0.9094      | 0.0906      | 0.9318    | 0.5773       | 0.3546       | 0.8937         | 1.0000              | 1        | legacy |
| offtopic-sauerteigbrot             | off-topic  | 40         | 0.8535   | 0.8484      | 0.0051      | 0.7878    | 0.4978       | 0.2899       | 0.7612         | 1.0000              | —        | legacy |
| offtopic-fussball-wm-2014          | off-topic  | 40         | 0.8684   | 0.8641      | 0.0043      | 0.8002    | 0.4848       | 0.3154       | 0.7060         | 1.0000              | —        | legacy |
| offtopic-tesla-model-3             | off-topic  | 40         | 0.8813   | 0.8159      | 0.0653      | 0.9310    | 0.5998       | 0.3313       | 0.7671         | 1.0000              | —        | legacy |
| offtopic-mars-distance             | off-topic  | 40         | 0.8955   | 0.8462      | 0.0493      | 0.8135    | 0.4926       | 0.3208       | 0.6816         | 1.0000              | —        | legacy |
| offtopic-carbonara                 | off-topic  | 40         | 0.8445   | 0.7971      | 0.0473      | 0.9634    | 0.4594       | 0.5039       | 0.8940         | 1.0000              | —        | legacy |
| offtopic-bitcoin-mining            | off-topic  | 40         | 0.8488   | 0.8142      | 0.0346      | 0.8523    | 0.5056       | 0.3467       | 0.7199         | 1.0000              | —        | legacy |
| offtopic-gitarre-drop-d            | off-topic  | 40         | 0.8620   | 0.8407      | 0.0213      | 0.7595    | 0.5158       | 0.2438       | 0.7217         | 1.0000              | —        | legacy |
| offtopic-sternbilder-winter        | off-topic  | 40         | 0.9130   | 0.8561      | 0.0569      | 0.9497    | 0.5876       | 0.3621       | 0.9099         | 1.0000              | —        | legacy |
| offtopic-weiches-ei                | off-topic  | 40         | 0.8558   | 0.8331      | 0.0227      | 0.7160    | 0.5367       | 0.1793       | 0.6936         | 1.0000              | —        | legacy |
| offtopic-dieselmotor               | off-topic  | 40         | 0.8698   | 0.8510      | 0.0188      | 0.8421    | 0.5429       | 0.2992       | 0.7469         | 1.0000              | —        | legacy |
| offtopic-steppenwolf-autor         | off-topic  | 40         | 0.8369   | 0.7982      | 0.0387      | 0.7218    | 0.4487       | 0.2731       | 0.6790         | 1.0000              | —        | legacy |
| offtopic-welpe-leine               | off-topic  | 40         | 0.9123   | 0.8159      | 0.0964      | 0.9385    | 0.6393       | 0.2992       | 0.8587         | 1.0000              | —        | legacy |
| offtopic-bmi-berechnen             | off-topic  | 25         | 0.8906   | 0.8376      | 0.0530      | 0.7240    | 0.4222       | 0.3019       | 0.6611         | 1.0000              | —        | legacy |
| offtopic-http-https                | off-topic  | 30         | 0.8873   | 0.8869      | 0.0004      | 0.8974    | 0.6163       | 0.2811       | 0.8096         | 1.0000              | —        | legacy |
| offtopic-impfungen-thailand        | off-topic  | 12         | 0.8790   | 0.8790      | 0.0000      | 0.6281    | 0.3383       | 0.2898       | 0.5398         | 0.7500              | —        | legacy |
| offtopic-apfelbaum-schnitt         | off-topic  | 11         | 0.8458   | 0.8458      | 0.0000      | 0.6496    | 0.3511       | 0.2985       | 0.5427         | 0.9000              | —        | legacy |
| offtopic-zeitumstellung            | off-topic  | 15         | 0.8592   | 0.8592      | 0.0000      | 0.5699    | 0.3265       | 0.2434       | 0.5252         | 0.9333              | —        | legacy |
| neartopic-bvg-monatsabo            | near-topic | 40         | 0.9219   | 0.8812      | 0.0407      | 0.7370    | 0.4585       | 0.2785       | 0.6377         | 1.0000              | —        | legacy |
| neartopic-abgeordnetenhauswahl     | near-topic | 40         | 0.9515   | 0.9005      | 0.0510      | 0.7075    | 0.4554       | 0.2520       | 0.6732         | 1.0000              | —        | legacy |
| neartopic-muenchen-einwohner       | near-topic | 40         | 0.8825   | 0.8434      | 0.0392      | 0.5856    | 0.3577       | 0.2279       | 0.5717         | 1.0000              | —        | legacy |
| neartopic-landesvorsitz-bayern     | near-topic | 40         | 0.9409   | 0.9168      | 0.0240      | 0.9507    | 0.5571       | 0.3936       | 0.8235         | 1.0000              | —        | legacy |
| neartopic-moor-foerdersumme        | near-topic | 40         | 0.9971   | 0.9364      | 0.0607      | 0.7230    | 0.3229       | 0.4001       | 0.6133         | 1.0000              | —        | legacy |

## Separation

- candidates: does not separate — closest margin -29.0000 (negative = overlapping ranges)
- denseTop: SEPARATES (on-topic > off-topic) — margin 0.0451, threshold ≈ 0.9356 (midpoint of the boundary values)
- denseMedian: does not separate — closest margin -0.0026 (negative = overlapping ranges)
- denseMargin: does not separate — closest margin -0.0964 (negative = overlapping ranges)
- rerankTop: does not separate — closest margin -0.3779 (negative = overlapping ranges)
- rerankMedian: does not separate — closest margin -0.4444 (negative = overlapping ranges)
- rerankMargin: does not separate — closest margin -0.3689 (negative = overlapping ranges)
- rerankTop3Mean: does not separate — closest margin -0.3992 (negative = overlapping ranges)
- aboveThresholdShare: does not separate — closest margin -0.2500 (negative = overlapping ranges)

## Acceptance

- A1 (denseTop): min(on-topic) = 0.9581 (chat-nb-berlin-baumfaellmoratorium), max(off-topic) = 0.9130 (offtopic-sternbilder-winter), margin 0.0451
- A1 (default 0.890): strictly between the two boundary values — NO
- Note (after the run): the default was raised from 0.89 to the midpoint 0.9356 in this PR (commit b785b9b6f3); the "NO" above refers to the pre-raise default.
- A3 (resolution): second-lowest on-topic 0.9619 (notebook-at-klimaticket), jump 0.0038 vs limit 0.03 — resolved
- near-topic (reported only, never decides): neartopic-bvg-monatsabo 0.9219, neartopic-abgeordnetenhauswahl 0.9515, neartopic-muenchen-einwohner 0.8825, neartopic-landesvorsitz-bayern 0.9409, neartopic-moor-foerdersumme 0.9971
- join-path cases: none — every case scored on the legacy domain
